/* tslint:disable:mocha-no-side-effect-code */

import { fail } from 'assert';
import { expect } from 'chai';
import { checkForUnusedIgnoreRules, getErrorsForFile } from "../armval";

const timeoutValue = 10000;

describe('ARM ValidationTests', () => {
    it('Unused ignorerule flags in CLI', async () => {
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

        const s = await getErrorsForFile("./test/testdata/azuredeploy.json", ignoreRules);
        expect(s.length).to.equal(0);

        const hasUnused = checkForUnusedIgnoreRules(ignoreRules);
        if (!hasUnused) {
            fail("Expected unused messages to be flagged");
        }

    }).timeout(timeoutValue);
});
