import * as dl from '@randyridgley/cdk-datalake-constructs';
import { App, RemovalPolicy } from 'aws-cdk-lib';
import { DataCentralStack } from './data-central-stack';
import { DataConsumerStack } from './data-consumer-stack';
import { DataProductStack } from './data-product-stack';

import * as pipelines from './pipelines';

const app = new App();
const region = app.node.tryGetContext('region');
const lakeAccountId = app.node.tryGetContext('lakeAccountId');
const centralAccountId = app.node.tryGetContext('centralAccountId');
const consumerAccountId = app.node.tryGetContext('consumerAccountId');
const stage = dl.Stage.PROD; // pass in a var

const taxiPipes: Array<dl.Pipeline> = [
  pipelines.YellowPipeline(),
  pipelines.GreenPipeline(),
];

const reviewPipes: Array<dl.Pipeline> = [
  pipelines.ReviewsPipeline(),
];

const dataProducts: Array<dl.DataProduct> = [{
  pipelines: taxiPipes,
  accountId: lakeAccountId,
  dataCatalogAccountId: centralAccountId,
  databaseName: 'taxi-product',
  s3BucketProps: {
    autoDeleteObjects: false,
    removalPolicy: RemovalPolicy.RETAIN,
  },
},
{
  pipelines: reviewPipes,
  accountId: lakeAccountId,
  dataCatalogAccountId: centralAccountId,
  databaseName: 'reviews-product',
  s3BucketProps: {
    autoDeleteObjects: false,
    removalPolicy: RemovalPolicy.RETAIN,
  },
}];

// Central catalog stack
new DataCentralStack(app, 'DataCentralStack', {
  env: {
    region: region,
    account: centralAccountId,
  },
  lakeName: 'central-lake',
  stageName: stage,
  policyTags: {
    admin_andon: 'true,false',
    classification: 'public,confidential,highlyconfidential,restricted,critical',
    owner: 'product,central,consumer',
  },
  crossAccountAccess: {
    consumerAccountIds: [consumerAccountId, lakeAccountId],
    dataCatalogOwnerAccountId: centralAccountId,
  },
  dataProducts: dataProducts,
});

// Data Product stack containing all ETL and S3 data
new DataProductStack(app, 'DataProductStack', {
  env: {
    region: region,
    account: lakeAccountId,
  },
  lakeName: 'product-lake',
  stageName: stage,
  dataProducts: dataProducts,
});

// Consumer stack for all compute made available through LF
new DataConsumerStack(app, 'DataConsumerStack', {
  env: {
    region: region,
    account: consumerAccountId,
  },
  lakeName: 'consumer-lake',
  stageName: stage,
  policyTags: {
    access: 'analyst,engineer,marketing',
  },
});


app.synth();