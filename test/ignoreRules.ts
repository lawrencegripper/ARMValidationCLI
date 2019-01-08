import { getErrorsForFile, loadIgnores } from "../index"
import { expect } from 'chai';
import { doesNotReject } from "assert";
import { log } from "util";

const timeoutValue = 10000;

describe('Ignore rules test', () => {
    it('finds error in file when ignore not configured', async () => {
        const s = await getErrorsForFile("./test/testdata/azuredeploy.arm.1error.json")
        expect(s.length).to.equal(1);
    }).timeout(timeoutValue);

    it('load ignore rules returns correct rules', async () => {
        const ignoreRules = loadIgnores("./test/testdata/arm.ignorefuncerror.json")
        expect(ignoreRules["test/testdata/azuredeploy.arm.1error.json"].length).to.equal(1, "Missing ignore rule")
    }).timeout(timeoutValue);

    it('skips error when ignore configured', async () => {
        let ignoreRules = JSON.parse(`{
            "test/testdata/azuredeploy.arm.1error.json": [
                {
                    "message": "Unrecognized function name 'nonfunction'.",
                    "jsonPath": "resources.1.dependsOn.1"
                }
            ]
        }`)

        const s = await getErrorsForFile("test/testdata/azuredeploy.arm.1error.json", ignoreRules)
        expect(s.length).to.equal(0);
    }).timeout(timeoutValue);
});
