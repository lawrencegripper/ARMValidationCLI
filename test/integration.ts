/* tslint:disable:mocha-no-side-effect-code */

import { expect } from 'chai';
import { getErrorsForFile } from "../armval";

const timeoutValue = 10000;

describe('ARM ValidationTests', () => {
    it('doesnt report errors in correct file', async () => {
        const s = await getErrorsForFile("./test/testdata/azuredeploy.json");
        expect(s.length).to.equal(0);
    }).timeout(timeoutValue);

    it('finds error in file with non-existant function', async () => {
        const s = await getErrorsForFile("./test/testdata/azuredeploy.arm.1error.json");
        expect(s.length).to.equal(1);
    }).timeout(timeoutValue);
});

describe('Schema ValidationTests', () => {
    it('reports error in invalid schema doc', async () => {
        const s = await getErrorsForFile("./test/testdata/azuredeploy.schema.invalid.json");
        expect(s.length).to.equal(1);
    }).timeout(timeoutValue);

    it('reports error in non json doc ', async () => {
        const s = await getErrorsForFile("./test/testdata/azuredeploy.schema.nonjson.json");
        expect(s.length).to.equal(1);
    }).timeout(timeoutValue);

    it('finds error in file with incorrect schema', async () => {
        const s = await getErrorsForFile("./test/testdata/azuredeploy.schema.1error.json");
        expect(s.length).to.equal(1);
    }).timeout(timeoutValue);
});

describe('JSON ValidationTests', () => {

    it('finds error in file with missing comma', async () => {
        const s = await getErrorsForFile("./test/testdata/azuredeploy.json.1error.json");
        expect(s.length).to.equal(1);
    }).timeout(timeoutValue);
});
