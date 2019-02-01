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

});
