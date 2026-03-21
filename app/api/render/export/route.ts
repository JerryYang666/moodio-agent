import { NextResponse } from "next/server";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  buildRenderRequest,
  type ExportRequest,
} from "@/lib/timeline/export";

const LAMBDA_FUNCTION = process.env.VIDEO_RENDER_LAMBDA_ARN;
const AWS_REGION = process.env.AWS_REGION || "us-east-2";
const S3_BUCKET = process.env.AWS_S3_BUCKET_NAME!;

const lambdaClient = new LambdaClient({
  region: AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function POST(request: Request) {
  try {
    const exportReq: ExportRequest = await request.json();

    if (
      !exportReq.segments ||
      !Array.isArray(exportReq.segments) ||
      exportReq.segments.length === 0
    ) {
      return NextResponse.json(
        { success: false, error: "segments must be a non-empty array" },
        { status: 400 }
      );
    }

    if (!LAMBDA_FUNCTION) {
      return NextResponse.json(
        {
          success: false,
          error:
            "VIDEO_RENDER_LAMBDA_ARN not configured. Export is not available until the Lambda is deployed.",
        },
        { status: 503 }
      );
    }

    const renderRequest = buildRenderRequest(exportReq, S3_BUCKET);

    console.log(
      "[render/export] Lambda payload:",
      JSON.stringify(renderRequest, null, 2)
    );

    const command = new InvokeCommand({
      FunctionName: LAMBDA_FUNCTION,
      Payload: new TextEncoder().encode(JSON.stringify(renderRequest)),
    });

    const response = await lambdaClient.send(command);

    if (response.FunctionError) {
      const errorPayload = response.Payload
        ? JSON.parse(new TextDecoder().decode(response.Payload))
        : null;
      return NextResponse.json(
        {
          success: false,
          error: `Lambda execution error: ${response.FunctionError}`,
          details: errorPayload,
        },
        { status: 500 }
      );
    }

    const result = response.Payload
      ? JSON.parse(new TextDecoder().decode(response.Payload))
      : null;

    if (!result || result.statusCode !== 200) {
      return NextResponse.json(
        {
          success: false,
          error: result?.body?.error || "Render failed",
          details: result,
        },
        { status: 500 }
      );
    }

    const { output_bucket, output_key } = result.body;

    const downloadUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: output_bucket,
        Key: output_key,
      }),
      { expiresIn: 3600 }
    );

    return NextResponse.json({
      success: true,
      downloadUrl,
      outputBucket: output_bucket,
      outputKey: output_key,
      outputSize: result.body.output_size_bytes,
      segmentCount: result.body.segment_count,
    });
  } catch (error) {
    console.error("[render/export] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}
