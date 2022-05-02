import * as dl from '@randyridgley/cdk-datalake-constructs';
import { LakeType } from '@randyridgley/cdk-datalake-constructs';
import { RemovalPolicy, Stack, StackProps, Tags } from 'aws-cdk-lib';
import { CfnDataCatalog, CfnNamedQuery } from 'aws-cdk-lib/aws-athena';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { CfnApplication } from 'aws-cdk-lib/aws-sam';
import { Construct } from 'constructs';

export interface DataConsumerStackProps extends StackProps {
  readonly stageName: dl.Stage;
  readonly lakeName: string;
  readonly policyTags: { [name: string]: string };
}

export class DataConsumerStack extends Stack {
  constructor(scope: Construct, id: string, props: DataConsumerStackProps) {
    super(scope, id, props);
    let region = Stack.of(this).region;
    let accountId = Stack.of(this).account;

    if (props.env) {
      region = props.env.region!;
      accountId = props.env.account!;
    }

    const vpc = new Vpc(this, 'StudioVPC', {
      maxAzs: 3,
      natGateways: 0,
    });

    Tags.of(vpc).add('Name', 'DemoVPC');

    const datalake = new dl.DataLake(this, 'ConsumerDataLake', {
      name: props.lakeName,
      lakeType: LakeType.CONSUMER,
      stageName: props.stageName,
      policyTags: props.policyTags,
      vpc: vpc,
      createDefaultDatabase: true,
      createAthenaWorkgroup: true,
    });

    // UDF defined in the Serverless Application Repository for the Athena Text Analysis UDF
    new CfnApplication(this, 'sam-text-analytics-udf', {
      location: {
        applicationId: 'arn:aws:serverlessrepo:us-east-1:912625584728:applications/TextAnalyticsUDFHandler',
        semanticVersion: '0.2.1',
      },
      parameters: {
        LambdaFunctionName: 'textanalytics-udf',
        LambdaMemory: '3008',
        LambdaTimeout: '900',
      },
    });

    const namedQuery = new CfnNamedQuery(this, 'text-udf-named-query', {
      database: datalake.databases[props.lakeName].databaseName,
      workGroup: datalake.athenaWorkgroup!.name,
      name: 'TextAnalyticsUDFDemo',
      queryString: `SELECT * FROM central_reviews limit 10;
SELECT AVG(LENGTH(review_body)) AS average_review_length FROM central_reviews;

USING EXTERNAL FUNCTION detect_sentiment(text_col VARCHAR, lang VARCHAR) RETURNS VARCHAR LAMBDA 'textanalytics-udf' 
SELECT detect_sentiment('I am very happy', 'en') as sentiment;

-- it takes just over 1 minute to run and costs $2
CREATE TABLE amazon_reviews_with_language WITH (format='parquet') AS
USING EXTERNAL FUNCTION detect_dominant_language(col1 VARCHAR) RETURNS VARCHAR LAMBDA 'textanalytics-udf'
SELECT *, detect_dominant_language(review_body) AS language
FROM central_reviews
LIMIT 5000;

-- find languages in the reviews based on comprehend detect language
SELECT language, count(*) AS count FROM amazon_reviews_with_language GROUP BY language ORDER BY count DESC;

-- it uses two text analytics functions, takes around 1 minute to run, and costs $4
CREATE TABLE amazon_reviews_with_text_analysis WITH (format='parquet') AS
USING
    EXTERNAL FUNCTION detect_sentiment_all(col1 VARCHAR, lang VARCHAR) RETURNS VARCHAR LAMBDA 'textanalytics-udf',
    EXTERNAL FUNCTION detect_entities_all(col1 VARCHAR, lang VARCHAR) RETURNS VARCHAR LAMBDA 'textanalytics-udf'
SELECT *, 
    detect_sentiment_all(review_body, language) AS sentiment,
    detect_entities_all(review_body, language) AS entities
FROM amazon_reviews_with_language
WHERE language IN ('ar', 'hi', 'ko', 'zh-TW', 'ja', 'zh', 'de', 'pt', 'en', 'it', 'fr', 'es')

-- this creates table with sentiment and sentiment scores in own columns
CREATE TABLE sentiment_results_final WITH (format='parquet') AS
SELECT 
    review_date, year, product_title, star_rating, language, 
    CAST(JSON_EXTRACT(sentiment,'$.sentiment') AS VARCHAR) AS sentiment,
    CAST(JSON_EXTRACT(sentiment,'$.sentimentScore.positive') AS DOUBLE ) AS positive_score,
    CAST(JSON_EXTRACT(sentiment,'$.sentimentScore.negative') AS DOUBLE ) AS negative_score,
    CAST(JSON_EXTRACT(sentiment,'$.sentimentScore.neutral') AS DOUBLE ) AS neutral_score,
    CAST(JSON_EXTRACT(sentiment,'$.sentimentScore.mixed') AS DOUBLE ) AS mixed_score,
    review_headline, review_body
FROM amazon_reviews_with_text_analysis;

select * from amazon_reviews_with_text_analysis limit 10;`,
    });
    namedQuery.node.addDependency(datalake.athenaWorkgroup!);

    const yellowNamedQuery = new CfnNamedQuery(this, 'yellow-named-query', {
      database: datalake.databases[props.lakeName].databaseName,
      workGroup: datalake.athenaWorkgroup!.name,
      name: 'YellowTaxiDDBDemo',
      queryString: `SELECT pl.borough as pickup_borough, pl.zone as pickup_zone, do.borough as dropoff_borough, do.zone as dropoff_zone, y.trip_distance, p.name as payment_name, y.fare_amount 
FROM "consumer-lake"."central_yellow" y
LEFT JOIN "dynamodb-catalog"."default"."payment-type" p
on y.payment_type = cast(p.id as integer)
LEFT JOIN "dynamodb-catalog"."default"."zone-lookup" pl
on y.pulocationid = pl.locationid
LEFT JOIN "dynamodb-catalog"."default"."zone-lookup" do
on y.pulocationid = do.locationid
limit 50;`,
    });
    yellowNamedQuery.node.addDependency(datalake.athenaWorkgroup!);

    const athenaDataSource = new CfnDataCatalog(this, 'athena-source', {
      name: 'dynamodb-catalog',
      description: 'catalog for dynamodb',
      type: 'LAMBDA',
      parameters: {
        function: `arn:aws:lambda:${region}:${accountId}:function:dynamodb-catalog`,
      },
    });

    const athenaSpillBucket = new Bucket(this, 'bucket-ath-spill', {
      bucketName: 'demo-cdk-datalake-spill-bucket',
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    new CfnApplication(this, 'sam-ddb-connector', {
      location: {
        applicationId: 'arn:aws:serverlessrepo:us-east-1:292517598671:applications/AthenaDynamoDBConnector',
        semanticVersion: '2021.14.1',
      },
      parameters: {
        AthenaCatalogName: athenaDataSource.name,
        LambdaMemory: '3008',
        LambdaTimeout: '900',
        SpillBucket: athenaSpillBucket.bucketName,
      },
    });

    // todo: add the needed permissions for athena UDFs s3 location for workgroup, workgroup, and lambda invoke
    new dl.DataLakeAnalyst(this, 'datalake-analyst-user', {
      name: 'datalakeAnalyst',
      readAccessBuckets: [
        datalake.logBucket,
      ],
      writeAccessBuckets: [
        datalake.logBucket,
      ],
    });
  }
}
