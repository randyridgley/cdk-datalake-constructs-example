import * as dl from '@randyridgley/cdk-datalake-constructs';
import { DataTier } from '@randyridgley/cdk-datalake-constructs';

export function GreenPipeline() {
  return new dl.Pipeline({
    type: dl.DataPipelineType.S3,
    name: 'taxi-green',
    destinationPrefix: 'green/',
    dataDropTier: DataTier.RAW,
    tiers: [DataTier.RAW, DataTier.REFINED],
    s3Properties: {
      sourceBucketName: 'nyc-tlc',
      sourceKeys: [
        'trip data/green_tripdata_2020-11.csv',
        'trip data/green_tripdata_2020-12.csv',
      ],
    },
  });
}