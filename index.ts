#!/usr/bin/env node

/* tslint:disable:no-console */

import chalk, {Chalk} from 'chalk';
import { readFileSync } from "fs";
import * as glob from "glob";
import * as http from "http";
import { exit } from "process";
import { configure as configureHttpRequests, getErrorStatusDescription, xhr, XHRResponse } from 'request-light';
import { getLanguageService, JSONDocument } from "vscode-json-languageservice";
import { DocumentSymbol, Location, Position, TextDocument } from 'vscode-languageserver-types';
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

function buildSymbolPathForLine(line: number, path: string, docSymbol: DocumentSymbol): string {

    // Build up json path
    path = `${path}.${docSymbol.name}`;

    // If this symbol doesn't have children and the line is in it then BINGO!
    if (docSymbol.children == null || docSymbol.children.length === 0) {
        return path.substr(2);
    }

    // If not lets look at its children
    for (let s of docSymbol.children) {
        if (symbolContainsLine(s, line)) {
            return buildSymbolPathForLine(line, path, s);
        }
    }

    return path.substr(2);
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

function checkRules(rules: IgnoreRule[], jsonPath: string, message: string): boolean {
    for (let rule of rules) {
        // Handle simple ignores - direct match
        if (rule.jsonPath === jsonPath && rule.message === message) {
            return true;
        }

        let isJsonPathRegexMatch = jsonPath.match(rule.jsonPath);
        let isMessageRegexMatch = message.match(rule.message);

        if (isJsonPathRegexMatch && isMessageRegexMatch) {
            console.log(chalk.grey(`Skipped issue due to ignore rule reason: '${rule.reason}' location:'${jsonPath}'\n`));
            return true;
        }
    }

}

function shouldSkip(jsonPath: string, message: string, fileLocation: string, ignoreRules: IgnoreRule[]): boolean {
    if (ignoreRules) {
        // Check specific file rules
        let fileIgnores = ignoreRules[fileLocation] as IgnoreRule[];
        if (fileIgnores) {
            // If we got a match then return, if not fall through to the global rules
            let skip = checkRules(fileIgnores, jsonPath, message);
            if (skip) {
                return true;
            }
        }

        let globalIgnores = ignoreRules["global"] as IgnoreRule[]; // tslint:disable-line
        if (globalIgnores) {
            return checkRules(globalIgnores, jsonPath, message);
        }
    }
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

    results.forEach(e => {
        let issueType = e.severity === 1 ? ErrorType : WarningType;
        let startPosition = Location.create(fileLocation, e.range).range.start;
        let path = buildSymbolPathForLine(startPosition.line, "", docSymbols);

        if (shouldSkip(path, e.message, fileLocation, ignoreRules)) {
            return;
        }

        combinedIssues.push({
            message: e.message,
            position: startPosition,
            issueSeverity: issueType,
            source: "VSCodeJSONLanguageServer",
            file: fileLocation,
            jsonPath: path
        });

    });

    // Use the VSCode ARM extension to validate the ARM template syntax
    let errors = await template.errors;

    errors.forEach(e => {
        let position = document.positionAt(e.span.startIndex);
        let path = buildSymbolPathForLine(position.line, "", docSymbols);

        if (shouldSkip(path, e.message, fileLocation, ignoreRules)) {
            return;
        }

        combinedIssues.push({
            message: e.message,
            position: position,
            issueSeverity: ErrorType,
            source: "VSCodeARMValidation",
            file: fileLocation,
            jsonPath: path
        });
    });

    let warnings = template.warnings;
    warnings.forEach(w => {
        let position = document.positionAt(w.span.startIndex);
        let path = buildSymbolPathForLine(position.line, "", docSymbols);
        if (shouldSkip(path, w.message, fileLocation, ignoreRules)) {
            return;
        }
        combinedIssues.push({
            message: w.message,
            position: position,
            issueSeverity: WarningType,
            source: "VSCodeARMValidation",
            file: fileLocation,
            jsonPath: path
        });
    });

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

async function run() {
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

    if (allIssues.length > 0) {
        console.error(chalk.red("Failed with issues. Exit 1"));
        exit(1);
    } else {
        console.log(chalk.green("Passed ✓"));
    }
}

run().catch(e => {
    console.error(e);
    exit(1);
});

interface Issue {
    message: string;
    position: Position;
    issueSeverity: string;
    source: string;
    file: string;
    jsonPath?: string;
}

interface IgnoreRule {
    message: string;
    jsonPath: string;
    reason?: string;
}

function printIssue(i: Issue) {

    const message = `Error: ${i.message} \n Location: { line: ${i.position.line + 1} char: ${i.position.character + 1} } \n Type: ${i.issueSeverity} \n From: ${i.source} \n File: ${i.file} \n JsonPath: ${i.jsonPath}`;
    if (i.issueSeverity === ErrorType) {
        console.log(chalk.red(message));
    } else {
        console.log(chalk.yellow(message));
    }
}
