import { DeploymentTemplate } from "./vscode-azurearmtools/src/DeploymentTemplate"
import { readFileSync, writeFileSync } from "fs";
import * as http from "http";
import { getLanguageService, JSONDocument } from "vscode-json-languageservice"
import { TextDocument } from 'vscode-languageserver-types';
import { xhr, XHRResponse, configure as configureHttpRequests, getErrorStatusDescription } from 'request-light';

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

async function getErrors() {
    var content = readFileSync("./testdata/basic.1error.json")

    var template = new DeploymentTemplate(content.toString(), "./testdata/basic.json")

    if (!template.hasValidSchemaUri()) {
        console.log("invalid schema uri")
        throw "can't continue without valid schema"
    } else {
        //Use the VSCode JSON language server to validate the schema

        let service = getLanguageService({ schemaRequestService: schemaRequestService })

        let document = toDocument(content.toString())
        let jsonDoc = await service.parseJSONDocument(document)

        let results = await service.doValidation(document, jsonDoc)

        results.forEach(e =>{
            console.log(e)
        })

    }

    // Use the VSCode ARM extension to validate the ARM template syntax
    var errors = await template.errors

    errors.forEach(error => {
        console.log("found error")
        console.log(error)
    });

    var warnings = await template.warnings

    warnings.forEach(warning => {
        console.log("found warning")
        console.log(warning)
    })
}

getErrors().then(() => console.log("done")).catch(x => console.log(x))

function toDocument(text: string): TextDocument {
	return TextDocument.create('foo://bar/file.json', 'json', 0, text);
}

