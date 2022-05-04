import * as dl from '@randyridgley/cdk-datalake-constructs';
import { LakeKind } from '@randyridgley/cdk-datalake-constructs';
import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface DataCentralStackProps extends StackProps {
  readonly lakeName: string;
  readonly policyTags: { [name: string]: string };
  readonly stageName: dl.Stage;
  readonly crossAccountAccess?: dl.CrossAccountProperties;
  readonly dataProducts: dl.DataProduct[];
}

export interface ManagedDataSet {
  ownerAccountId: string;
  ownerRegion: string;
  pipelines: dl.Pipeline[];
}

export class DataCentralStack extends Stack {
  constructor(scope: Construct, id: string, props: DataCentralStackProps) {
    super(scope, id, props);

    new dl.DataLake(this, 'CentralDataLake', {
      name: props.lakeName,
      lakeKind: LakeKind.CENTRAL_CATALOG,
      stageName: props.stageName,
      policyTags: props.policyTags,
      crossAccountAccess: props.crossAccountAccess ? props.crossAccountAccess : undefined,
      dataProducts: props.dataProducts,
    });
  }
}
