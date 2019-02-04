/* tslint:disable:mocha-no-side-effect-code */

import { fail } from 'assert';
import { expect } from 'chai';
import { getErrorsForFile, loadIgnores } from "../armval";
const timeoutValue = 10000;

describe('Ignore `resource` rules test', () => {

    it('ignore incorrect schema error using `resource` property in ignore file', async () => {
        let ignoreRules = JSON.parse(`{
            "test/testdata/azuredeploy.schema.1error.json": [
                {
                    "message": ".*",
                    "resource": {
                        "name":"[variables('storageAccountName')]",
                        "apiVersion":"2017-10-05",
                        "type":"Microsoft.Storage/storageAccounts"
                    }
                }
            ]
        }`);
        const s = await getErrorsForFile("test/testdata/azuredeploy.schema.1error.json", ignoreRules);
        expect(s.length).to.equal(0);
    }).timeout(timeoutValue);

    it('ignore incorrect schema error using `resource` property in ignore file with wildcards', async () => {
        let ignoreRules = JSON.parse(`{
            "test/testdata/azuredeploy.schema.1error.json": [
                {
                    "message": ".*",
                    "resource": {
                        "name":".*",
                        "apiVersion":".*",
                        "type":"Microsoft.Storage/storageAccounts"
                    }
                }
            ]
        }`);
        const s = await getErrorsForFile("test/testdata/azuredeploy.schema.1error.json", ignoreRules);
        expect(s.length).to.equal(0);
    }).timeout(timeoutValue);

    it('error if both `resource` set in an ignore rule with missing fields', async () => {
        let ignoreRules = JSON.parse(`{
            "test/testdata/azuredeploy.arm.1error.json": [
                {
                    "message": "Unrecognized function name 'nonfunction'.",
                    "resource": {
                        "name": "bob"
                    }
                }
            ]
        }`);

        // tslint:disable-next-line:no-unused-expression
        try {
            let x = await getErrorsForFile("test/testdata/azuredeploy.arm.1error.json", ignoreRules);
        } catch (e) {
            expect(e.message).to.equal(new Error("In a `resource` rule ALL of `apiVersion`, `name` and `type` fields must be set to a regex").message);
            return;
        }

        fail("Expected error");
    }).timeout(timeoutValue);

    it('error if both jsonPath and resource set in an ignore rule', async () => {
        let ignoreRules = JSON.parse(`{
            "test/testdata/azuredeploy.arm.1error.json": [
                {
                    "message": "Unrecognized function name 'nonfunction'.",
                    "jsonPath": "resources.1.dependsOn.1",
                    "resource": {
                        "name": "bob"
                    }
                }
            ]
        }`);

        // tslint:disable-next-line:no-unused-expression
        try {
            let x = await getErrorsForFile("test/testdata/azuredeploy.arm.1error.json", ignoreRules);
        } catch (e) {
            expect(e.message).to.equal(new Error("Cannot specify both 'jsonPath' and 'resource' in an ignore rule").message);
            return;
        }

        fail("Expected error");
    }).timeout(timeoutValue);

    it('error if neither jsonPath and resource set in an ignore rule', async () => {
        let ignoreRules = JSON.parse(`{
            "test/testdata/azuredeploy.arm.1error.json": [
                {
                    "message": "Unrecognized function name 'nonfunction'."
                }
            ]
        }`);

        // tslint:disable-next-line:no-unused-expression
        try {
            let x = await getErrorsForFile("test/testdata/azuredeploy.arm.1error.json", ignoreRules);
        } catch (e) {
            expect(e.message).to.equal(new Error("Must specify either 'jsonPath' and 'resource' in an ignore rule").message);
            return;
        }

        fail("Expected error");
    }).timeout(timeoutValue);

    it('ignore subresource with error', async () => {
        let ignoreRules = JSON.parse(`{
            "global": [
                {
                    "message": ".*",
                    "resource": {
                        "type": "providers/diagnosticSettings",
                        "name": ".*",
                        "apiVersion": "2017-05-01-preview"
                    }
                }
            ]
        }`);

        let x = await getErrorsForFile("test/testdata/azuredeploy.schema.subreserror.json", ignoreRules);

        // Only ignore the subresource error
        expect(x.length).to.equal(1);

    }).timeout(timeoutValue);
});
