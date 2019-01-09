# ARM Validation CLI

[![Build Status](https://dev.azure.com/lawrencegripper/githubbuilds/_apis/build/status/lawrencegripper.ARMValidationCLI?branchName=master)](https://dev.azure.com/lawrencegripper/githubbuilds/_build/latest?definitionId=3?branchName=master)

## About

The aim is to create a simple CLI which can be run during CI to validate ARM templates and catch issues early. 

## Usage 

To install use: (Note: Node v8 or higher is required)

```
    npm install -g armval
```

To validate ARM templates `armval` in a folder structure containing `azuredeploy.json` files. 

You can specify a custom [glob](https://en.wikipedia.org/wiki/Glob_%28programming%29) to match you file naming convention like this `armval "**/*mytemplate.json"`

If you have errors which you want to ignore add an `armvalconfig.json` with the following structure in the directory:

```
{
    "ignore": {
        "test/testdata/azuredeploy.arm.1error.json": [
            {
                "message": "Unrecognized function name 'nonfunction'.",
                "jsonPath": "resources.1.dependsOn.1"
            }
        ]
    }
}

```

## Sample output

The tool will highlight JSON Language, ARM syntax and schema issues. The output is as follows:

```
Using default glob '**/*azuredeploy*.json' as none provided
-----------------------------
Files to be checked based on Glob '**/*azuredeploy*.json'
[ 'test/testdata/azuredeploy.arm.1error.json',
  'test/testdata/azuredeploy.json',
  'test/testdata/azuredeploy.json.1error.json',
  'test/testdata/azuredeploy.schema.1error.json',
  'test/testdata/azuredeploy.schema.invalid.json',
  'test/testdata/azuredeploy.schema.nonjson.json' ]
-----------------------------

 --> Checking file test/testdata/azuredeploy.arm.1error.json 

Found 1 issues 

Error: Unrecognized function name 'nonfunction'. 
 Location: { line: 60 char: 11 } 
 Type: Error 
 From: VSCodeARMValidation 
 File: test/testdata/azuredeploy.arm.1error.json 
 JsonPath: resources.1.dependsOn.1


-----------------------------

 --> Checking file test/testdata/azuredeploy.json 

Found 0 issues 

-----------------------------

 --> Checking file test/testdata/azuredeploy.json.1error.json 

Found 1 issues 

Error: Expected comma 
 Location: { line: 17 char: 5 } 
 Type: Error 
 From: VSCodeJSONLanguageServer 
 File: test/testdata/azuredeploy.json.1error.json 
 JsonPath: parameters.containerInstanceLocation


-----------------------------

 --> Checking file test/testdata/azuredeploy.schema.1error.json 

Found 1 issues 

Error: Value is not accepted. Valid values: "2017-06-01". 
 Location: { line: 45 char: 23 } 
 Type: Warning 
 From: VSCodeJSONLanguageServer 
 File: test/testdata/azuredeploy.schema.1error.json 
 JsonPath: resources.0.apiVersion


-----------------------------

 --> Checking file test/testdata/azuredeploy.schema.invalid.json 

Found 1 issues 

Error: JSON Document may not be an ARM template, it's missing the '$schema' field of the value in invalid 
 Location: { line: 1 char: 1 } 
 Type: Error 
 From: SchemaValidation 
 File: test/testdata/azuredeploy.schema.invalid.json 
 JsonPath: undefined


-----------------------------

 --> Checking file test/testdata/azuredeploy.schema.nonjson.json 

Found 1 issues 

Error: JSON Document may not be an ARM template, it's missing the '$schema' field of the value in invalid 
 Location: { line: 1 char: 1 } 
 Type: Error 
 From: SchemaValidation 
 File: test/testdata/azuredeploy.schema.nonjson.json 
 JsonPath: undefined


-----------------------------

```



## Dev 

First clone the repository using `--recurse-submodules` to ensure the nested repositories are restored. Then:

1. `npm install && npm build && nodejs ./index.js` 
