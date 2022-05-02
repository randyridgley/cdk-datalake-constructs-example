const { awscdk } = require('projen');
const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: '2.13.0',
  defaultReleaseBranch: 'main',
  name: 'central-governance',

  deps: [
    'aws-cdk-lib',
    '@randyridgley/cdk-datalake-constructs',
  ],
  devDeps: [
    'cdk-nag'
  ] 
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // devDeps: [],             /* Build dependencies for this module. */
  // packageName: undefined,  /* The "name" in package.json. */
  // release: undefined,      /* Add release management to this project. */
});
project.synth();