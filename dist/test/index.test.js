"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// tslint:disable:no-var-requires
const chai_1 = require("chai");
const index_1 = __importDefault(require("../lib/index"));
const Serverless = require('serverless/lib/Serverless');
const funcWithIamTemplate = require('../../src/test/funcs-with-iam.json');
const lodash_1 = __importDefault(require("lodash"));
const os_1 = __importDefault(require("os"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
describe('plugin tests', function () {
    this.timeout(15000);
    let serverless;
    before(() => {
        const dir = path_1.default.join(os_1.default.tmpdir(), '.serverless');
        try {
            fs_1.default.mkdirSync(dir);
        }
        catch (error) {
            if (error.code !== 'EEXIST') {
                console.log('failed to create dir: %s, error: ', dir, error);
                throw error;
            }
        }
        const packageFile = path_1.default.join(dir, funcWithIamTemplate.package.artifact);
        fs_1.default.writeFileSync(packageFile, "test123");
        console.log('### serverless version: %s ###', (new Serverless()).version);
    });
    beforeEach(() => __awaiter(this, void 0, void 0, function* () {
        serverless = new Serverless();
        serverless.cli = new serverless.classes.CLI();
        Object.assign(serverless.service, lodash_1.default.cloneDeep(funcWithIamTemplate));
        serverless.service.provider.compiledCloudFormationTemplate = {
            Resources: {},
            Outputs: {},
        };
        serverless.config.servicePath = os_1.default.tmpdir();
        serverless.pluginManager.loadAllPlugins();
        let compile_hooks = serverless.pluginManager.getHooks('package:setupProviderConfiguration');
        compile_hooks = compile_hooks.concat(serverless.pluginManager.getHooks('package:compileFunctions'), serverless.pluginManager.getHooks('package:compileEvents'));
        for (const ent of compile_hooks) {
            try {
                yield ent.hook();
            }
            catch (error) {
                console.log("failed running compileFunction hook: [%s] with error: ", ent, error);
                chai_1.assert.fail();
            }
        }
    }));
    function assertFunctionRoleName(name, roleNameObj) {
        chai_1.assert.isArray(roleNameObj['Fn::Join']);
        chai_1.assert.isTrue(roleNameObj['Fn::Join'][1].indexOf(name) >= 0, 'role name contains function name');
    }
    describe('defaultInherit not set', () => {
        let plugin;
        beforeEach(() => __awaiter(this, void 0, void 0, function* () {
            plugin = new index_1.default(serverless);
        }));
        describe('#constructor()', () => {
            it('should initialize the plugin', () => {
                chai_1.assert.instanceOf(plugin, index_1.default);
            });
            it('defaultInherit shuuld be false', () => {
                chai_1.assert.isFalse(plugin.defaultInherit);
            });
        });
        const statements = [{
                Effect: "Allow",
                Action: [
                    'xray:PutTelemetryRecords',
                    'xray:PutTraceSegments',
                ],
                Resource: "*",
            }];
        describe('#validateStatements', () => {
            it('should validate valid statement', () => {
                chai_1.assert.doesNotThrow(() => { plugin.validateStatements(statements); });
            });
            it('should throw an error for invalid statement', () => {
                const bad_statement = [{
                        Action: [
                            'xray:PutTelemetryRecords',
                            'xray:PutTraceSegments',
                        ],
                        Resource: "*",
                    }];
                chai_1.assert.throws(() => { plugin.validateStatements(bad_statement); });
            });
            it('should throw error if no awsPackage plugin', () => {
                const indx = serverless.pluginManager.plugins.findIndex((p) => p.constructor.name === "AwsPackage");
                chai_1.assert.isAtLeast(indx, 0);
                serverless.pluginManager.plugins.splice(indx, 1);
                chai_1.assert.throws(() => {
                    plugin.validateStatements(statements);
                });
            });
        });
        describe('#getFunctionRoleName', () => {
            it('should return a name with the function name', () => {
                const name = 'test-name';
                const roleName = plugin.getFunctionRoleName(name);
                assertFunctionRoleName(name, roleName);
                const name_parts = roleName['Fn::Join'][1];
                chai_1.assert.equal(name_parts[name_parts.length - 1], 'lambdaRole');
            });
            it('should throw an error on long name', () => {
                const long_name = 'long-long-long-long-long-long-long-long-long-long-long-name';
                chai_1.assert.throws(() => { plugin.getFunctionRoleName(long_name); });
                try {
                    plugin.getFunctionRoleName(long_name);
                }
                catch (error) {
                    //some validation that the error we throw is what we expect
                    const msg = error.message;
                    chai_1.assert.isString(msg);
                    chai_1.assert.isTrue(msg.startsWith('serverless-iam-roles-per-function: ERROR:'));
                    chai_1.assert.isTrue(msg.includes(long_name));
                    chai_1.assert.isTrue(msg.endsWith('iamRoleStatementsName.'));
                }
            });
            it('should return a name without "lambdaRole"', () => {
                let name = 'test-name';
                let roleName = plugin.getFunctionRoleName(name);
                const len = plugin.getRoleNameLength(roleName['Fn::Join'][1]);
                //create a name which causes role name to be longer than 64 chars by 1. Will cause then lambdaRole to be removed
                name += 'a'.repeat(64 - len + 1);
                roleName = plugin.getFunctionRoleName(name);
                assertFunctionRoleName(name, roleName);
                const name_parts = roleName['Fn::Join'][1];
                chai_1.assert.notEqual(name_parts[name_parts.length - 1], 'lambdaRole');
            });
        });
        describe('#createRolesPerFunction', () => {
            it('should create role per function', () => {
                plugin.createRolesPerFunction();
                const helloRole = serverless.service.provider.compiledCloudFormationTemplate.Resources.HelloIamRoleLambdaExecution;
                chai_1.assert.isNotEmpty(helloRole);
                assertFunctionRoleName('hello', helloRole.Properties.RoleName);
                chai_1.assert.isEmpty(helloRole.Properties.ManagedPolicyArns, 'function resource role has no managed policy');
                //check depends and role is set properlly
                const helloFunctionResource = serverless.service.provider.compiledCloudFormationTemplate.Resources.HelloLambdaFunction;
                chai_1.assert.isTrue(helloFunctionResource.DependsOn.indexOf('HelloIamRoleLambdaExecution') >= 0, 'function resource depends on role');
                chai_1.assert.equal(helloFunctionResource.Properties.Role["Fn::GetAtt"][0], 'HelloIamRoleLambdaExecution', "function resource role is set properly");
                const helloInheritRole = serverless.service.provider.compiledCloudFormationTemplate.Resources.HelloInheritIamRoleLambdaExecution;
                assertFunctionRoleName('helloInherit', helloInheritRole.Properties.RoleName);
                let policy_statements = helloInheritRole.Properties.Policies[0].PolicyDocument.Statement;
                chai_1.assert.isObject(policy_statements.find((s) => s.Action[0] === "xray:PutTelemetryRecords"), 'global statements imported upon inherit');
                chai_1.assert.isObject(policy_statements.find((s) => s.Action[0] === "dynamodb:GetItem"), 'per function statements imported upon inherit');
                const streamHandlerRole = serverless.service.provider.compiledCloudFormationTemplate.Resources.StreamHandlerIamRoleLambdaExecution;
                assertFunctionRoleName('streamHandler', streamHandlerRole.Properties.RoleName);
                policy_statements = streamHandlerRole.Properties.Policies[0].PolicyDocument.Statement;
                chai_1.assert.isObject(policy_statements.find((s) => lodash_1.default.isEqual(s.Action, [
                    "dynamodb:GetRecords",
                    "dynamodb:GetShardIterator",
                    "dynamodb:DescribeStream",
                    "dynamodb:ListStreams"
                ]) &&
                    lodash_1.default.isEqual(s.Resource, [
                        "arn:aws:dynamodb:us-east-1:1234567890:table/test/stream/2017-10-09T19:39:15.151"
                    ])), 'stream statements included');
                chai_1.assert.isObject(policy_statements.find((s) => s.Action[0] === "sns:Publish"), 'sns dlq statements included');
                const streamMapping = serverless.service.provider.compiledCloudFormationTemplate.Resources.StreamHandlerEventSourceMappingDynamodbTest;
                chai_1.assert.equal(streamMapping.DependsOn, "StreamHandlerIamRoleLambdaExecution");
                //verify sqsHandler should have SQS permissions
                const sqsHandlerRole = serverless.service.provider.compiledCloudFormationTemplate.Resources.SqsHandlerIamRoleLambdaExecution;
                assertFunctionRoleName('sqsHandler', sqsHandlerRole.Properties.RoleName);
                policy_statements = sqsHandlerRole.Properties.Policies[0].PolicyDocument.Statement;
                JSON.stringify(policy_statements);
                chai_1.assert.isObject(policy_statements.find((s) => lodash_1.default.isEqual(s.Action, [
                    "sqs:ReceiveMessage",
                    "sqs:DeleteMessage",
                    "sqs:GetQueueAttributes"
                ]) &&
                    lodash_1.default.isEqual(s.Resource, [
                        "arn:aws:sqs:us-east-1:1234567890:MyQueue",
                        "arn:aws:sqs:us-east-1:1234567890:MyOtherQueue"
                    ])), 'sqs statements included');
                chai_1.assert.isObject(policy_statements.find((s) => s.Action[0] === "sns:Publish"), 'sns dlq statements included');
                const sqsMapping = serverless.service.provider.compiledCloudFormationTemplate.Resources.SqsHandlerEventSourceMappingSQSMyQueue;
                chai_1.assert.equal(sqsMapping.DependsOn, "SqsHandlerIamRoleLambdaExecution");
                //verify helloNoPerFunction should have global role
                const helloNoPerFunctionResource = serverless.service.provider.compiledCloudFormationTemplate.Resources.HelloNoPerFunctionLambdaFunction;
                chai_1.assert.isTrue(helloNoPerFunctionResource.DependsOn.indexOf('IamRoleLambdaExecution') >= 0, 'function resource depends on global role');
                chai_1.assert.equal(helloNoPerFunctionResource.Properties.Role["Fn::GetAtt"][0], 'IamRoleLambdaExecution', "function resource role is set to global role");
                //verify helloEmptyIamStatements
                const helloEmptyIamStatementsRole = serverless.service.provider.compiledCloudFormationTemplate.Resources.HelloEmptyIamStatementsIamRoleLambdaExecution;
                assertFunctionRoleName('helloEmptyIamStatements', helloEmptyIamStatementsRole.Properties.RoleName);
                chai_1.assert.equal(helloEmptyIamStatementsRole.Properties.ManagedPolicyArns[0], 'arn:${AWS::Partition}:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole');
                const helloEmptyFunctionResource = serverless.service.provider.compiledCloudFormationTemplate.Resources.HelloEmptyIamStatementsLambdaFunction;
                chai_1.assert.isTrue(helloEmptyFunctionResource.DependsOn.indexOf('HelloEmptyIamStatementsIamRoleLambdaExecution') >= 0, 'function resource depends on role');
                chai_1.assert.equal(helloEmptyFunctionResource.Properties.Role["Fn::GetAtt"][0], 'HelloEmptyIamStatementsIamRoleLambdaExecution', "function resource role is set properly");
            });
            it('should do nothing when no functions defined', () => {
                serverless.service.functions = {};
                serverless.service.resources = {};
                plugin.createRolesPerFunction();
                for (const key in serverless.service.provider.compiledCloudFormationTemplate.Resources) {
                    if (key !== 'IamRoleLambdaExecution' && serverless.service.provider.compiledCloudFormationTemplate.Resources.hasOwnProperty(key)) {
                        const resource = serverless.service.provider.compiledCloudFormationTemplate.Resources[key];
                        if (resource.Type === "AWS::IAM::Role") {
                            chai_1.assert.fail(resource, undefined, "There shouldn't be extra roles beyond IamRoleLambdaExecution");
                        }
                    }
                }
            });
            it('should throw when external role is defined', () => {
                lodash_1.default.set(serverless.service, "functions.hello.role", "arn:${AWS::Partition}:iam::0123456789:role/Test");
                chai_1.assert.throws(() => {
                    plugin.createRolesPerFunction();
                });
            });
        });
        describe('#throwErorr', () => {
            it('should throw formated error', () => {
                try {
                    plugin.throwError('msg :%s', 'testing');
                    chai_1.assert.fail('expected error to be thrown');
                }
                catch (error) {
                    const msg = error.message;
                    chai_1.assert.isString(msg);
                    chai_1.assert.isTrue(msg.startsWith('serverless-iam-roles-per-function: ERROR:'));
                    chai_1.assert.isTrue(msg.endsWith('testing'));
                }
            });
        });
    });
    describe('defaultInherit set', () => {
        let plugin;
        beforeEach(() => {
            //set defaultInherit
            lodash_1.default.set(serverless.service, "custom.serverless-iam-roles-per-function.defaultInherit", true);
            //change helloInherit to false for testing
            lodash_1.default.set(serverless.service, "functions.helloInherit.iamRoleStatementsInherit", false);
            plugin = new index_1.default(serverless);
        });
        describe('#constructor()', () => {
            it('defaultInherit shuuld be true', () => {
                chai_1.assert.isTrue(plugin.defaultInherit);
            });
        });
        describe('#createRolesPerFunction', () => {
            it('should create role per function', () => {
                plugin.createRolesPerFunction();
                const helloRole = serverless.service.provider.compiledCloudFormationTemplate.Resources.HelloIamRoleLambdaExecution;
                chai_1.assert.isNotEmpty(helloRole);
                assertFunctionRoleName('hello', helloRole.Properties.RoleName);
                //check depends and role is set properlly
                const helloFunctionResource = serverless.service.provider.compiledCloudFormationTemplate.Resources.HelloLambdaFunction;
                chai_1.assert.isTrue(helloFunctionResource.DependsOn.indexOf('HelloIamRoleLambdaExecution') >= 0, 'function resource depends on role');
                chai_1.assert.equal(helloFunctionResource.Properties.Role["Fn::GetAtt"][0], 'HelloIamRoleLambdaExecution', "function resource role is set properly");
                let statements = helloRole.Properties.Policies[0].PolicyDocument.Statement;
                chai_1.assert.isObject(statements.find((s) => s.Action[0] === "xray:PutTelemetryRecords"), 'global statements imported as defaultInherit is set');
                chai_1.assert.isObject(statements.find((s) => s.Action[0] === "dynamodb:GetItem"), 'per function statements imported upon inherit');
                const helloInheritRole = serverless.service.provider.compiledCloudFormationTemplate.Resources.HelloInheritIamRoleLambdaExecution;
                assertFunctionRoleName('helloInherit', helloInheritRole.Properties.RoleName);
                statements = helloInheritRole.Properties.Policies[0].PolicyDocument.Statement;
                chai_1.assert.isObject(statements.find((s) => s.Action[0] === "dynamodb:GetItem"), 'per function statements imported');
                chai_1.assert.isTrue(statements.find((s) => s.Action[0] === "xray:PutTelemetryRecords") === undefined, 'global statements not imported as iamRoleStatementsInherit is false');
            });
        });
    });
});
//# sourceMappingURL=index.test.js.map