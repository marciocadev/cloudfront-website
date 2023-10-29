import * as cdk from 'aws-cdk-lib';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { Distribution, OriginAccessIdentity } from 'aws-cdk-lib/aws-cloudfront';
import { S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { CanonicalUserPrincipal, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { CfnRecordSet } from 'aws-cdk-lib/aws-route53';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import { join } from 'path';

export class CloudfrontWebsiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const bucket = new Bucket(this, "Bucket", {
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      publicReadAccess: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    new BucketDeployment(this, "BucketDeployment", {
      destinationBucket: bucket,
      sources: [Source.asset(join(__dirname, "/website"))],
    });

    const cfOAI = new OriginAccessIdentity(this, "OriginAccessIdentity");

    bucket.addToResourcePolicy(
      new PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [bucket.arnForObjects("*")],
        principals: [
          new CanonicalUserPrincipal(cfOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId)
        ]
      })
    );

    const certificateArn = process.env.CERTIFICATE_ARN!;
    const certificate = Certificate.fromCertificateArn(this, "DomainCertificate", certificateArn);

    const recordName = "site";
    const domainName = "lazinessdevs.com";

    const distribution = new Distribution(this, "Distribution", {
      certificate: certificate,
      defaultBehavior: {
        origin: new S3Origin(bucket, {
          originAccessIdentity: cfOAI,
        }),
      },
      domainNames: [[recordName, domainName].join(".")],
      defaultRootObject: "index.html",
    });

    const hostedZoneId = process.env.HOSTED_ZONE_ID!;

    // const hostedZone = HostedZone.fromHostedZoneAttributes(this, "HostedZone", {
    //   hostedZoneId: hostedZoneId,
    //   zoneName: domainName,
    // });

    // new ARecord(this, "ARecord", {
    //   recordName: recordName,
    //   zone: hostedZone,
    //   target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
    // });

    new CfnRecordSet(this, "ARecord", {
      hostedZoneId: hostedZoneId,
      type: "A",
      name: [recordName, domainName].join("."),
      aliasTarget: {
        dnsName: distribution.distributionDomainName,
        // CloudFront distribution - Specify Z2FDTNDATAQYW2 .
        // This is always the hosted zone ID when you create an alias record that routes traffic to a CloudFront distribution.
        hostedZoneId: "Z2FDTNDATAQYW2",
        evaluateTargetHealth: false,
      }
    })
  }
}
