import { DeploymentTemplate } from "./vscode-azurearmtools/src/DeploymentTemplate"
import { readFileSync } from "fs";
import * as http from "http";
import * as ajvValidator from "ajv";
import * as request from "request-promise"


declare module "http" {
    export class ServerRequest extends http.IncomingMessage { }
}

async function getErrors() {

    var content = readFileSync("./testdata/basic.1error.json")

    var template = new DeploymentTemplate(content.toString(), "./testdata/basic.json")

    // Without this call schema errors aren't show
    if (!template.hasValidSchemaUri()) {
        console.log("invalid schema uri")
        throw "can't continue without valid schema"
    } else {
        var ajv = new ajvValidator({
            meta: false, // optional, to prevent adding draft-06 meta-schema
            extendRefs: true, // optional, current default is to 'fail', spec behaviour is to 'ignore'
            unknownFormats: 'ignore',  // optional, current default is true (fail)
        })

        var metaSchema = require('ajv/lib/refs/json-schema-draft-04.json');
        ajv.addMetaSchema(metaSchema);
        ajv._opts.defaultMeta = metaSchema.id;
        
        // optional, using unversioned URI is out of spec, see https://github.com/json-schema-org/json-schema-spec/issues/216
        ajv._refs['http://json-schema.org/schema'] = 'http://json-schema.org/draft-04/schema';
        
        // Optionally you can also disable keywords defined in draft-06
        ajv.removeKeyword('propertyNames');
        ajv.removeKeyword('contains');
        ajv.removeKeyword('const');

        var schema = ajv

        // await addSchema("http://json-schema.org/draft-04/schema#", schema);
        await addSchema(template.schemaUri, schema);
        var valid = schema.validate(template.schemaUri, content)
        if (!valid) {
            schema.errors.forEach(error => {
                console.log(error)
            })
        }

    }

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

async function addSchema(schemaUri: string, schema: ajvValidator.Ajv) {
    var r = await request(schemaUri);
    schema.addSchema(JSON.parse(r));
}
