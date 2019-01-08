import { DeploymentTemplate } from "./vscode-azurearmtools/src/DeploymentTemplate"
import { readFileSync, writeFileSync } from "fs";
import * as http from "http";
import { getLanguageService, JSONDocument } from "vscode-json-languageservice"
import { TextDocument, Location, Position } from 'vscode-languageserver-types';
import { xhr, XHRResponse, configure as configureHttpRequests, getErrorStatusDescription } from 'request-light';
import * as glob from "glob";
import { exit } from "process";

// Added to prevent AppInsights code in vscode-azurearmtools creating build errors
declare module "http" {
    export class ServerRequest extends http.IncomingMessage { }
}

// Define how json schemas should be fetched
const schemaRequestService = (uri: string): Thenable<string> => {

    const headers = { 'Accept-Encoding': 'gzip, deflate' };
    return xhr({ url: uri, followRedirects: 5, headers }).then(response => {
        return response.responseText;
    }, (error: XHRResponse) => {
        return Promise.reject(error.responseText || getErrorStatusDescription(error.status) || error.toString());
    });
};

async function getErrorsForFile(fileLocation: string): Promise<Array<Issue>> {
    var content = readFileSync(fileLocation)

    let combinedIssues = new Array<Issue>()
    var template = new DeploymentTemplate(content.toString(), fileLocation)

    if (!template.hasValidSchemaUri()) {
        combinedIssues.push(new Issue("No Schema Defined, ARM template must have a $schema field set", {character: 0, line:0}, "Error", "JSONSchemaValidation", fileLocation))
    }

    //Use the VSCode JSON language server to validate the schema

    let service = getLanguageService({ schemaRequestService: schemaRequestService })
    let document = toDocument(content.toString())
    let jsonDoc = await service.parseJSONDocument(document)
    let results = await service.doValidation(document, jsonDoc)

    results.forEach(e => {
        let type = e.severity === 1 ? "Error" : "Warning"
        combinedIssues.push(new Issue(e.message, Location.create(fileLocation, e.range).range.start, type, "VSCodeJSONLanguageServer", fileLocation))
    })



    // Use the VSCode ARM extension to validate the ARM template syntax
    var errors = await template.errors

    errors.forEach(error => {
        let position = document.positionAt(error.span.startIndex)
        combinedIssues.push(new Issue(error.message, position, "Error", "ARMValidation", fileLocation))
    });

    var warnings = await template.warnings
    warnings.forEach(warning => {
        let position = document.positionAt(warning.span.startIndex)
        combinedIssues.push(new Issue(warning.message, position, "Warning", "ARMValidation", fileLocation))
    })

    return combinedIssues
}

function toDocument(text: string): TextDocument {
    return TextDocument.create('foo://bar/file.json', 'json', 0, text);
}

async function getFiles(globString: string): Promise<Array<string>> {
    return new Promise<Array<string>>((resolve, reject) => {
        glob(globString, {}, function (er, files) {
            if (er !== null) {
                reject(er)
                return
            }

            if (files === null) {
                reject("No files found")
                return
            }

            console.log("-----------------------------")
            console.log(`Files to be checked based on Glob '${globString}'`)
            console.log(files)

            if (files.length === 1) {
                console.log("Expecting more files? Check your glob isn't being expanded by your terminal. To fix put quotes around the input like this: \"**/*azuredeploy*.json\"")
            }

            resolve(files)
        })
    })   
}

async function run() {
    let files = await getFiles(process.argv[2])

    let allIssues = new Array<Issue>()

    console.log("-----------------------------")
    for (let f of files) {
        console.log(`\n --> Checking file ${f} \n`)
        let issues = await getErrorsForFile(f)
        allIssues.push(...issues)
        console.log(`Found ${issues.length} issues \n`)

        for (let i of issues) {
            i.print()
            console.log("\n")
        }
        console.log("-----------------------------")
    }

    if (allIssues.length > 0) {
        console.error("Failed with issues. Exit 1")
        exit(1)
    }
}

run().catch(e => {
    console.error(e)
    exit(1)
})

class Issue {
    /**
     *
     */
    constructor(public message: string, public position: Position, public type: string, public source: string, public file: string) {

    }

    print() {
        console.log(`Error: ${this.message} \n Location: { line: ${this.position.line} char: ${this.position.character} } \n Type: ${this.type} \n From: ${this.source} \n File ${this.file}`)
    }
}