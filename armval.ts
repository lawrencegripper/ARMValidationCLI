#!/usr/bin/env node

/* tslint:disable:no-console */

import chalk from 'chalk';
import { readFileSync } from "fs";
import * as glob from "glob";
import { exit } from "process";
import { getErrorStatusDescription, xhr, XHRResponse } from 'request-light';
import { getLanguageService } from "vscode-json-languageservice";
import { DocumentSymbol, Location, Position, SymbolKind, TextDocument } from 'vscode-languageserver-types';
import { DeploymentTemplate } from "./vscode-azurearmtools/src/DeploymentTemplate";

// Added to prevent AppInsights code in vscode-azurearmtools creating build errors
declare module "http" {
    export class ServerRequest extends IncomingMessage { }
}

// Define how json schemas should be fetched
const schemaRequestService = (uri: string): Thenable<string> => { //tslint:disable-line

    const headers = { 'Accept-Encoding': 'gzip, deflate' };
    return xhr({ url: uri, followRedirects: 5, headers }).then(
        response => {
            return response.responseText;
        },
        async (error: XHRResponse) => {
            return Promise.reject(error.responseText || getErrorStatusDescription(error.status) || error.toString());
        });
};

function symbolContainsLine(s: DocumentSymbol, line: number) {
    return s.range.start.line <= line && s.range.end.line >= line;
}

// This method is used to find the resource in which the error
// occured and build out the `jsonPath` information
// tslint:disable-next-line:no-any
function buildSymbolInfoForLine(line: number, path: string, docSymbol: DocumentSymbol, document: TextDocument, resource?: any): { path: string, resource: any } {
    // Is it a resource? If so we want it to enable `resoruce` based ignores.
    //
    // The JSON language server returns type Module for {} objects in json
    // We can also check the path as we know it should be under resources
    if (docSymbol.kind === SymbolKind.Module && path.includes(".resources")) {
        let jsSection = document.getText(docSymbol.range);
        // Not all failures will be in 'resource' objects. Deserialising all of them takes an age as lots fail
        // so we only attempt to deserialise them if there is a reasonable chance of success
        if (jsSection.includes("name") && jsSection.includes("apiVersion") && jsSection.includes("type")) {
            try {
                resource = JSON.parse(jsSection);
            } catch (e) { console.log(`Failed to parse resource ${jsSection}`); }
        }
    }

    // Build up json path
    path = `${path}.${docSymbol.name}`;

    // If this symbol doesn't have children and the line is in it then BINGO!
    if (docSymbol.children == null || docSymbol.children.length === 0) {
        return { path: path.substr(2), resource: resource };
    }

    // If not lets look at its children
    for (let s of docSymbol.children) {
        if (symbolContainsLine(s, line)) {
            // Store the parent
            return buildSymbolInfoForLine(line, path, s, document, resource);
        }
    }

    return { path: path.substr(2), resource: resource };
}

export function loadIgnores(pathToConfig?: string): IgnoreRule[] {
    try {
        if (pathToConfig == null) {
            pathToConfig = "./armvalconfig.json";
        }
        let content = readFileSync(pathToConfig);
        return JSON.parse(content.toString()).ignore;
    } catch (e) {
        console.error(`Failed to load ignore file: ${e}`);
        return null;
    }
}

// Check to see if an issue has an IgnoreRule configured
// tslint:disable-next-line:no-any
function checkRules(rules: IgnoreRule[], jsonPath: string, message: string, jsonDoc: any): boolean {
    for (let rule of rules) {
        // Handle error cases
        if (rule.jsonPath != null && rule.resource != null) {
            throw new Error("Cannot specify both 'jsonPath' and 'resource' in an ignore rule");
        }

        if (rule.jsonPath == null && rule.resource == null) {
            throw new Error("Must specify either 'jsonPath' and 'resource' in an ignore rule");
        }

        // Check the message matches
        if (!message.match(rule.message)) {
            continue;
        }

        // Check the resource block
        if (rule.resource != null) {
            if (rule.resource.name == null || rule.resource.apiVersion == null || rule.resource.type == null) {
                throw new Error("In a `resource` rule ALL of `apiVersion`, `name` and `type` fields must be set to a regex");
            }
            if (jsonDoc.name.match(rule.resource.name) && jsonDoc.apiVersion.match(rule.resource.apiVersion) && jsonDoc.type.match(rule.resource.type)) {
                console.log(chalk.grey(`Skipped issue due to resource ignore rule reason: '${rule.reason}' location:'${JSON.stringify(rule.resource)}'\n`));
                // Track that this rule was used
                rule.used = true;
                return true;
            }
        }

        // Check the jsonPath block
        if (rule.jsonPath != null) {
            if (rule.jsonPath === jsonPath) {
                return true;
            }

            if (jsonPath.match(rule.jsonPath)) {
                console.log(chalk.grey(`Skipped issue due to ignore rule reason: '${rule.reason}' location:'${jsonPath}'\n`));
                // Track that this rule was used
                rule.used = true;
                return true;

            }
        }

    }

}

// Report which of the ignore rules are unused
// tslint:disable-next-line:no-any
export function checkForUnusedIgnoreRules(ignores: any): boolean {
    let hasUnusedIgnores = false;
    // tslint:disable-next-line:no-for-in
    for (let p of Object.keys(ignores)) {
        let ignoreRules = ignores[p] as IgnoreRule[];
        for (let r of ignoreRules) {
            if (r.used !== true) {
                console.log(`Unused rule in ignoreFile, consider cleaning up: ${JSON.stringify(r)}`);
                hasUnusedIgnores = true;
            }
        }
    }
    return hasUnusedIgnores;
}

// tslint:disable-next-line:no-any
function shouldSkip(jsonPath: string, message: string, fileLocation: string, ignoreRules: IgnoreRule[], jsonDoc: any): boolean {
    if (ignoreRules) {
        // Check specific file rules
        let fileIgnores = ignoreRules[fileLocation] as IgnoreRule[];
        if (fileIgnores) {
            // If we got a match then return, if not fall through to the global rules
            let skip = checkRules(fileIgnores, jsonPath, message, jsonDoc);
            if (skip) {
                return true;
            }
        }

        let globalIgnores = ignoreRules["global"] as IgnoreRule[]; // tslint:disable-line
        if (globalIgnores) {
            return checkRules(globalIgnores, jsonPath, message, jsonDoc);
        }
    }
}

function createIssue(message: string, start: Position, fileLocation: string, docSymbols: DocumentSymbol, document: TextDocument, ignoreRules: IgnoreRule[]): Issue {
    let pathResult = buildSymbolInfoForLine(start.line, "", docSymbols, document);

    if (shouldSkip(pathResult.path, message, fileLocation, ignoreRules, pathResult.resource)) {
        return null;
    }
    return {
        message: message,
        position: start,
        source: "VSCodeJSONLanguageServer",
        file: fileLocation,
        jsonPath: pathResult.path
    };
}

let service = getLanguageService({ schemaRequestService: schemaRequestService });
const ErrorType = "Error";
const WarningType = "Warning";

export async function getErrorsForFile(fileLocation: string, ignoreRules?: IgnoreRule[]): Promise<Issue[]> {
    let content = readFileSync(fileLocation);

    let combinedIssues: Issue[] = [];
    let template = new DeploymentTemplate(content.toString(), fileLocation);

    if (!template.hasValidSchemaUri()) {
        combinedIssues.push({
            message: "JSON Document may not be an ARM template, it's missing the '$schema' field of the value in invalid",
            position: { character: 0, line: 0 },
            issueSeverity: "Error",
            source: "SchemaValidation",
            file: fileLocation
        });
        return combinedIssues;
    }

    //Use the VSCode JSON language server to validate the schema
    let document = toDocument(content.toString());
    let jsonDoc = service.parseJSONDocument(document);
    let results = await service.doValidation(document, jsonDoc);
    let symbols = service.findDocumentSymbols2(document, jsonDoc);
    let docSymbols = new DocumentSymbol();
    docSymbols.children = symbols;
    docSymbols.name = "";

    // tslint:disable-next-line:no-for-in
    for (let e of results) {
        let issueType = e.severity === 1 ? ErrorType : WarningType;
        let issueSource = "VSCodeJSONLanguageServer";
        let range = Location.create(fileLocation, e.range).range;

        let issue = createIssue(e.message, range.start, fileLocation, docSymbols, document, ignoreRules);
        if (issue !== null) {
            issue.source = issueSource;
            issue.issueSeverity = issueType;
            combinedIssues.push(issue);
        }
    }

    // Use the VSCode ARM extension to validate the ARM template syntax
    let errors = await template.errors;

    for (let e of errors) {
        let source = "VSCodeARMValidation";
        let issueSeverity = ErrorType;
        let position = document.positionAt(e.span.startIndex);

        let issue = createIssue(e.message, position, fileLocation, docSymbols, document, ignoreRules);
        if (issue !== null) {
            issue.source = source;
            issue.issueSeverity = issueSeverity;
            combinedIssues.push(issue);
        }
    }

    let warnings = template.warnings;
    for (let w of warnings) {
        let source = "VSCodeARMValidation";
        let issueSeverity = WarningType;
        let position = document.positionAt(w.span.startIndex);

        let issue = createIssue(w.message, position, fileLocation, docSymbols, document, ignoreRules);
        if (issue !== null) {
            issue.source = source;
            issue.issueSeverity = issueSeverity;
            combinedIssues.push(issue);
        }
    }

    return combinedIssues;
}

function toDocument(text: string): TextDocument {
    return TextDocument.create('foo://bar/file.json', 'json', 0, text);
}

async function getFiles(globString: string): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        glob(globString, {}, (er, files) => {
            if (er !== null) {
                reject(er);
                return;
            }

            if (files === null) {
                reject("No files found");
                return;
            }

            console.log("-----------------------------");
            console.log(`Files to be checked based on Glob '${globString}'`);
            console.log(files);

            if (files.length === 1) {
                console.log("Expecting more files? Check your glob isn't being expanded by your terminal. To fix put quotes around the input like this: \"**/*azuredeploy*.json\"");
            }

            resolve(files);
        });
    });
}

export async function run() {
    let ignoreRules = loadIgnores();
    let fileGlob = process.argv[2];
    if (fileGlob === undefined) {
        console.log("Using default glob '**/azuredeploy.json' as none provided");
        fileGlob = '**/*azuredeploy*.json';
    }
    let files = await getFiles(fileGlob);

    let allIssues: Issue[] = [];

    console.log("-----------------------------");
    for (let f of files) {
        console.log(`\n --> Checking file ${f} \n`);
        let issues = await getErrorsForFile(f, ignoreRules);
        allIssues.push(...issues);
        console.log(`Found ${issues.length} issues \n`);

        for (let i of issues) {
            printIssue(i);
            console.log("\n");
        }
        console.log("-----------------------------");
    }

    console.log(`Summary: Found ${allIssues.length} issues in ${files.length} files.`);

    checkForUnusedIgnoreRules(ignoreRules);

    if (allIssues.length > 0) {
        console.error(chalk.red("Failed with issues. Exit 1"));
        exit(1);
    } else {
        console.log(chalk.green("Passed ✓"));
    }
}

interface Issue {
    message: string;
    position: Position;
    issueSeverity?: string;
    source?: string;
    file: string;
    jsonPath?: string;
}

interface IgnoreType {
    name: string;
    // tslint:disable-next-line:no-reserved-keywords
    type: string;
    apiVersion: string;
}

interface IgnoreRule {
    message: string;
    jsonPath: string;
    resource: IgnoreType;
    reason?: string;
    used?: boolean;
}

function printIssue(i: Issue) {

    const message = `Error: ${i.message} \n Location: { line: ${i.position.line + 1} char: ${i.position.character + 1} } \n Type: ${i.issueSeverity} \n From: ${i.source} \n File: ${i.file} \n JsonPath: ${i.jsonPath}`;
    if (i.issueSeverity === ErrorType) {
        console.log(chalk.red(message));
    } else {
        console.log(chalk.yellow(message));
    }
}
