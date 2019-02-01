/* tslint:disable:mocha-no-side-effect-code */

import { fail } from 'assert';
import { expect } from 'chai';
import { getErrorsForFile, loadIgnores } from "../armval";
const timeoutValue = 10000;

describe('Ignore rules test', () => {
    it('finds error in file when ignore not configured', async () => {
        const s = await getErrorsForFile("test/testdata/azuredeploy.arm.1error.json");
        expect(s.length).to.equal(1);
    }).timeout(timeoutValue);

    it('load ignore rules returns correct rules', async () => {
        const ignoreRules = loadIgnores("test/testdata/arm.ignorefuncerror.json");
        expect(ignoreRules["test/testdata/azuredeploy.arm.1error.json"].length).to.equal(1, "Missing ignore rule");
    }).timeout(timeoutValue);

    it('skips error when ignore configured', async () => {
        let ignoreRules = JSON.parse(`{
            "test/testdata/azuredeploy.arm.1error.json": [
                {
                    "message": "Unrecognized function name 'nonfunction'.",
                    "jsonPath": "resources.1.dependsOn.1"
                }
            ]
        }`);

        const s = await getErrorsForFile("test/testdata/azuredeploy.arm.1error.json", ignoreRules);
        expect(s.length).to.equal(0);
    }).timeout(timeoutValue);

    it('when global ignore configured it skips error', async () => {
        let ignoreRules = JSON.parse(`{
            "global": [
                {
                    "message": "Unrecognized function name 'nonfunction'.",
                    "jsonPath": "resources.1.dependsOn.1"
                }
            ],
            "test/testdata/azuredeploy.arm.1error.json": [
                {
                    "message": "SomethingElse.",
                    "jsonPath": "resources.1.dependsOn.1"
                }
            ]
        }`);

        const s = await getErrorsForFile("test/testdata/azuredeploy.arm.1error.json", ignoreRules);
        expect(s.length).to.equal(0);
    }).timeout(timeoutValue);

    it('when wildcard json path set ignores all occurances of the error', async () => {
        let ignoreRules = JSON.parse(`{
            "test/testdata/azuredeploy.arm.repeatederror.json": [
                {
                    "message": "Unrecognized function name 'nonfunction'.",
                    "jsonPath": ".*",
                    "reason": "something"
                }
            ]
        }`);
        const s = await getErrorsForFile("test/testdata/azuredeploy.arm.repeatederror.json", ignoreRules);
        expect(s.length).to.equal(0);
    }).timeout(timeoutValue);

    it('when partial wildcard jsonpath set ignores all occurances of the error under that path', async () => {
        let ignoreRules = JSON.parse(`{
            "test/testdata/azuredeploy.arm.repeatederror.json": [
                {
                    "message": "Unrecognized function name 'nonfunction'.",
                    "jsonPath": "resources.1.properties.containers.*"
                }
            ]
        }`);
        const s = await getErrorsForFile("test/testdata/azuredeploy.arm.repeatederror.json", ignoreRules);
        expect(s.length).to.equal(1);
    }).timeout(timeoutValue);

    it('when wildcard set for error message ignore all errors under jsonpath', async () => {
        let ignoreRules = JSON.parse(`{
            "test/testdata/azuredeploy.arm.repeatederror.json": [
                {
                    "message": ".*",
                    "jsonPath": "resources.1.*"
                }
            ]
        }`);
        const s = await getErrorsForFile("test/testdata/azuredeploy.arm.repeatederror.json", ignoreRules);
        expect(s.length).to.equal(0);
    }).timeout(timeoutValue);

    it('should skip all errors everywhere!', async () => {
        let ignoreRules = JSON.parse(`{
            "global": [
                {
                    "message": ".*",
                    "jsonPath": ".*"
                }
            ]
        }`);
        const s = await getErrorsForFile("test/testdata/azuredeploy.arm.repeatederror.json", ignoreRules);
        expect(s.length).to.equal(0);
    }).timeout(timeoutValue);

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

});
