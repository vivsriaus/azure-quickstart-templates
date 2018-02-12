var assert = require('assert');
var util = require('./util');
const filesFolder = './';
var path = require('path');
var chai = require('chai');
var assert = chai.assert; // Using Assert style
var expect = chai.expect; // Using Expect style
var should = chai.should(); // Using Should style

require('it-each')({ testPerIteration: true });

var folder = process.env.npm_config_folder || filesFolder;

var mainTemplateFileJSONObject = util.getMainTemplateFile(folder).jsonObject;
var mainTemplateFile = util.getMainTemplateFile(folder).file;
var createUiDefFileJSONObject = util.getCreateUiDefFile(folder).jsonObject;
var createUiDefFile = util.getCreateUiDefFile(folder).file;
var templateFiles = util.getTemplateFiles(folder).files;
var templateFileJSONObjects = util.getTemplateFiles(folder).fileJSONObjects;

chai.use(function(_chai, _) {
    _chai.Assertion.addMethod('withMessage', function(msg) {
        _.flag(this, 'message', msg);
    });
});

function getErrorMessage(obj, file, message) {
    return 'json object with \'name\' at line number ' + util.getPosition(obj, file) + ' ' + message;
}

describe('mainTemplate.json file - ', () => {
    describe('parameters tests - ', () => {
        it('each parameter that does not have a defaultValue, must have a corresponding output in createUIDef', () => {
            var currentDir = path.dirname(mainTemplateFile);
            // assert create ui def exists in the above directory
            util.assertCreateUiDefExists(currentDir);

            // get the corresponding create ui def
            var createUiDefJSONObject = util.getCreateUiDefFile(currentDir).jsonObject;

            // get output keys in main template
            var outputsInCreateUiDef = Object.keys(createUiDefJSONObject.parameters.outputs);

            // convert to lowercase
            for (var i in outputsInCreateUiDef) {
                outputsInCreateUiDef[i] = outputsInCreateUiDef[i].toLowerCase();
            }

            // validate each parameter in main template has a value in outputs
            mainTemplateFileJSONObject.should.have.property('parameters');
            var parametersInMainTemplate = Object.keys(mainTemplateFileJSONObject.parameters);
            parametersInMainTemplate.forEach(parameter => {
                if (typeof(mainTemplateFileJSONObject.parameters[parameter].defaultValue) === 'undefined') {
                    outputsInCreateUiDef.should.withMessage('in file:mainTemplate.json. outputs in createUiDefinition is missing the parameter ' + parameter).contain(parameter.toLowerCase());
                }
            });
        });

        // TODO: should it be non null, or should all secure strings not contain default value?
        it('non-null default values must not be provided for secureStrings', () => {
            templateFileJSONObjects.forEach(templateJSONObject => {
                var templateObject = templateJSONObject.value;
                Object.keys(templateObject.parameters).forEach(parameter => {
                    if (templateObject.parameters[parameter].type.toLowerCase() == 'securestring') {
                        // get default value if one exists
                        var defaultVal = templateObject.parameters[parameter].defaultValue;
                        if (defaultVal && defaultVal.length > 0) {
                            expect(templateObject.parameters[parameter], 'in file:' + templateJSONObject.filename + parameter + ' should not have defaultValue').to.not.have.property('defaultValue');
                        }
                    }
                });
            });

        });

        // The location parameter MUST NOT have allowedValues property and MUST have defaultValue property whose value MUST be '[resourceGroup().location]'
        it('a parameter named "location" must exist and must be used on all resource "location" properties', () => {
            mainTemplateFileJSONObject.should.withMessage('file:mainTemplate.json is missing parameters property').have.property('parameters');
            mainTemplateFileJSONObject.parameters.should.withMessage('file:mainTemplate.json is missing location property in parameters').have.property('location');

            // The location parameter must have a defaultValue property, and its value must be '[resourceGroup().location]'
            var location = mainTemplateFileJSONObject.parameters.location;
            location.should.withMessage('file:mainTemplate.json location property must have a default value').have.property('defaultValue');
            location.defaultValue.should.withMessage('file:mainTemplate.json location property default value MUST be [resourceGroup().location]').be.eql('[resourceGroup().location]');
            location.should.withMessage('file:mainTemplate.json location property must NOT have allowedValues property').not.have.property('allowedValues');
        });

        it('the template must not contain any unused parameters', () => {
            mainTemplateFileJSONObject.should.have.property('parameters');
            var parametersInMainTemplate = Object.keys(mainTemplateFileJSONObject.parameters);
            parametersInMainTemplate.forEach(parameter => {
                var paramString = 'parameters(\'' + parameter.toLowerCase() + '\')';
                JSON.stringify(mainTemplateFileJSONObject).toLowerCase().should.withMessage('file:mainTemplate.json. unused parameter ' + parameter + ' in mainTemplate').contain(paramString);
            });
        });
    });

    describe('resources tests - ', () => {
        describe('resource object location property tests - ', () => {
            var expectedLocation1 = '[parameters(\'location\')]';
            var expectedLocation2 = '[variables(\'location\')]';
            templateFileJSONObjects.forEach(templateJSONObject => {
                var templateObject = templateJSONObject.value;
                templateObject.should.have.property('resources');
                var resources = Object.keys(templateObject.resources);
                // each resource location should be "location": "[parameters('location')]" or ""[variables('location')]""
                it.each(resources, 'resource location should be location: [parameters(location)] or [variables(location)]', function(element, next) {
                    var val = templateObject.resources[element];
                    var message = 'in json files should have location set to [parameters(\'location\')] or [variables(\'location\')]';
                    if (val.location) {
                        val.location.split(' ').join('').should.withMessage(getErrorMessage(val, templateJSONObject.filepath, message)).be.eql(expectedLocation1, expectedLocation2);
                    }
                    next();
                });
                // resourceGroup().location can only be as a defaultValue for the location parameter
                it.each(resources, 'resourceGroup().location must not be used in the solution template except as a defaultValue for the location parameter', function(element, next) {
                    var val = templateObject.resources[element];
                    var valStr = JSON.stringify(val);
                    var locationString = '[resourceGroup().location]';
                    var message = 'in file:' + templateJSONObject.filename + ' should NOT have location set to [resourceGroup().location]';
                    valStr.should.withMessage(getErrorMessage(val, templateJSONObject.filepath, message)).not.contain(locationString);
                    next();
                });
            });
        });

        it('apiVersions must NOT be retrieved using providers().apiVersions[n].  This function is non-deterministic', () => {
            templateFileJSONObjects.forEach(templateJSONObject => {
                var templateObject = templateJSONObject.value;
                templateObject.should.have.property('resources');
                var message = 'in file:' + templateJSONObject.filename + ' should NOT have api version determined by providers().';
                Object.keys(templateObject.resources).forEach(resource => {
                    var val = templateObject.resources[resource];
                    if (val.apiVersion) {
                        val.apiVersion.should.withMessage(getErrorMessage(val, templateJSONObject.filepath, message)).not.contain('providers(');
                    }
                });
            });
        });

        it('template must contain only approved resources', () => {
            // Add allowed types here
            // NOTE that the property name is the lower case resource provider portion of the type
            // and the array can either be a single entry of '*' for all types for that provider
            // or it can be one or more elements which are the resource type names to allow
            var allowedResourceTypes = {
                'microsoft.compute' : ['*'],
                'microsoft.storage' : ['*'],
                'microsoft.network' : ['*'],
                'microsoft.resources' : ['*'],
                'microsoft.insights' : ['autoscalesettings'],
                'microsoft.authorization' : ['roleassignments']
            };
            templateFileJSONObjects.forEach(templateJSONObject => {
                var templateObject = templateJSONObject.value;
                templateObject.should.have.property('resources');
                var message = 'in file:' + templateJSONObject.filename + ' is NOT an approved resource type (' + JSON.stringify(allowedResourceTypes) + ')';
                Object.keys(templateObject.resources).forEach(resource => {
                    var val = templateObject.resources[resource];
                    if (val.type) {
                        var rType = val.type.toLowerCase().split('/');
                        var providerLower = rType[0];
                        var typeLower = rType[1];
                        var condition = allowedResourceTypes[providerLower] &&
                                    (allowedResourceTypes[providerLower][0] == '*' || (typeLower && allowedResourceTypes[providerLower].indexOf(typeLower) > -1));
                        expect(condition, getErrorMessage(val, templateJSONObject.filepath, message + '. The resource object: ' + JSON.stringify(val))).to.be.true;
                    }
                });
            });
        });
    });
});