
import * as dl from '@randyridgley/cdk-datalake-constructs';
import { LakeKind } from '@randyridgley/cdk-datalake-constructs';
import { Stack, StackProps, Tags } from 'aws-cdk-lib';
import { GatewayVpcEndpointAwsService, InterfaceVpcEndpointAwsService, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface DataProductStackProps extends StackProps {
  readonly dataProducts: dl.DataProduct[];
  readonly lakeName: string;
  readonly stageName: dl.Stage;
  readonly crossAccountAccess?: dl.CrossAccountProperties;
  readonly policyTags: { [name: string]: string };
}

export class DataProductStack extends Stack {

  constructor(scope: Construct, id: string, props: DataProductStackProps) {
    super(scope, id, props);

    const vpc = this.createVpc();

    // create the local data lake with their own Glue Data catalog and IAM Role to act as data lake administrator
    const datalake = new dl.DataLake(this, 'LocalDataLake', {
      name: props.lakeName,
      lakeKind: LakeKind.DATA_PRODUCT,
      stageName: props.stageName,
      crossAccountAccess: props.crossAccountAccess ? props.crossAccountAccess : undefined,
      vpc: vpc,
      dataProducts: props.dataProducts,
      policyTags: props.policyTags,      
    });

    datalake.createDownloaderCustomResource(props.stageName);
  }

  private createVpc() : Vpc {
    const vpc = new Vpc(this, 'lake-vpc', {
      maxAzs: 3,
      subnetConfiguration: [
        {
          name: 'isolated',
          subnetType: SubnetType.PRIVATE_ISOLATED,
          cidrMask: 26,
        },
        {
          name: 'public',
          subnetType: SubnetType.PUBLIC,
          cidrMask: 26,
        },
      ],
      natGateways: 0,
    });

    Tags.of(vpc).add('Name', 'DemoVPC');

    // add endpoints for S3 and Glue private access on the VPC
    vpc.addGatewayEndpoint('s3-endpoint', {
      service: GatewayVpcEndpointAwsService.S3,
      subnets: [
        {
          subnetType: SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    vpc.addInterfaceEndpoint('glue-endpoint', {
      service: InterfaceVpcEndpointAwsService.GLUE,
      subnets: {
        subnetType: SubnetType.PRIVATE_ISOLATED,
      },
    });

    return vpc;
  }
}
