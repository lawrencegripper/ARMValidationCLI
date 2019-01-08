"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const DeploymentTemplate_1 = require("./vscode-azurearmtools/src/DeploymentTemplate");
const fs_1 = require("fs");
const http = require("http");
const vscode_json_languageservice_1 = require("vscode-json-languageservice");
const vscode_languageserver_types_1 = require("vscode-languageserver-types");
const request_light_1 = require("request-light");
const glob = require("glob");
const process_1 = require("process");
// Define how json schemas should be fetched
const schemaRequestService = (uri) => {
    const headers = { 'Accept-Encoding': 'gzip, deflate' };
    return request_light_1.xhr({ url: uri, followRedirects: 5, headers }).then(response => {
        return response.responseText;
    }, (error) => {
        return Promise.reject(error.responseText || request_light_1.getErrorStatusDescription(error.status) || error.toString());
    });
};
function symbolContainsLine(s, line) {
    return s.range.start.line <= line && s.range.end.line >= line;
}
function buildSymbolPathForLine(line, path, symbol) {
    // Build up json path
    path = path + "." + symbol.name;
    // If this symbol doesn't have children and the line is in it then BINGO!
    if (symbol.children == null || symbol.children.length == 0) {
        return path.substr(2);
    }
    // If not lets look at its children
    for (let s of symbol.children) {
        if (symbolContainsLine(s, line)) {
            return buildSymbolPathForLine(line, path, s);
        }
    }
    return path.substr(2);
}
function getErrorsForFile(fileLocation) {
    return __awaiter(this, void 0, void 0, function* () {
        var content = fs_1.readFileSync(fileLocation);
        let combinedIssues = new Array();
        var template = new DeploymentTemplate_1.DeploymentTemplate(content.toString(), fileLocation);
        if (!template.hasValidSchemaUri()) {
            combinedIssues.push({
                message: "JSON Document may not be an ARM template, it's missing the '$schema' field of the value in invalid",
                position: { character: 0, line: 0 },
                type: "Error",
                source: "SchemaValidation",
                file: fileLocation
            });
        }
        //Use the VSCode JSON language server to validate the schema
        let service = vscode_json_languageservice_1.getLanguageService({ schemaRequestService: schemaRequestService });
        let document = toDocument(content.toString());
        let jsonDoc = yield service.parseJSONDocument(document);
        let results = yield service.doValidation(document, jsonDoc);
        let symbols = service.findDocumentSymbols2(document, jsonDoc);
        let docSymbols = new vscode_languageserver_types_1.DocumentSymbol();
        docSymbols.children = symbols;
        docSymbols.name = "";
        // console.log(docSymbols)
        results.forEach(e => {
            let type = e.severity === 1 ? "Error" : "Warning";
            let startPosition = vscode_languageserver_types_1.Location.create(fileLocation, e.range).range.start;
            var path = buildSymbolPathForLine(startPosition.line, "", docSymbols);
            combinedIssues.push({
                message: e.message,
                position: startPosition,
                type: type,
                source: "VSCodeJSONLanguageServer",
                file: fileLocation,
                jsonPath: path
            });
        });
        // Use the VSCode ARM extension to validate the ARM template syntax
        var errors = yield template.errors;
        errors.forEach(e => {
            let position = document.positionAt(e.span.startIndex);
            var path = buildSymbolPathForLine(position.line, "", docSymbols);
            combinedIssues.push({
                message: e.message,
                position: position,
                type: "Error",
                source: "VSCodeARMValidation",
                file: fileLocation,
                jsonPath: path
            });
        });
        var warnings = yield template.warnings;
        warnings.forEach(w => {
            let position = document.positionAt(w.span.startIndex);
            var path = buildSymbolPathForLine(position.line, "", docSymbols);
            combinedIssues.push({
                message: w.message,
                position: position,
                type: "Warning",
                source: "VSCodeARMValidation",
                file: fileLocation,
                jsonPath: path
            });
        });
        return combinedIssues;
    });
}
function toDocument(text) {
    return vscode_languageserver_types_1.TextDocument.create('foo://bar/file.json', 'json', 0, text);
}
function getFiles(globString) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            glob(globString, {}, function (er, files) {
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
    });
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        let files = yield getFiles(process.argv[2]);
        let allIssues = new Array();
        console.log("-----------------------------");
        for (let f of files) {
            console.log(`\n --> Checking file ${f} \n`);
            let issues = yield getErrorsForFile(f);
            allIssues.push(...issues);
            console.log(`Found ${issues.length} issues \n`);
            for (let i of issues) {
                printIssue(i);
                console.log("\n");
            }
            console.log("-----------------------------");
        }
        if (allIssues.length > 0) {
            console.error("Failed with issues. Exit 1");
            process_1.exit(1);
        }
    });
}
run().catch(e => {
    console.error(e);
    process_1.exit(1);
});
function printIssue(i) {
    console.log(`Error: ${i.message} \n Location: { line: ${i.position.line + 1} char: ${i.position.character + 1} } \n Type: ${i.type} \n From: ${i.source} \n File: ${i.file} \n JsonPath: ${i.jsonPath}`);
}
//# sourceMappingURL=index.js.map