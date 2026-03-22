import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const LAMBDA_FUNCTION = process.env.VIDEO_FRAME_EXTRACT_LAMBDA_ARN;
const AWS_REGION = process.env.AWS_REGION || "us-east-2";
const S3_BUCKET = process.env.AWS_S3_BUCKET_NAME!;

const lambdaClient = new LambdaClient({
  region: AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

/**
 * Invoke the video-frame-extract Lambda to extract the first frame
 * from a video in S3 and upload it as a JPEG image.
 *
 * @param videoId - The video ID (used as S3 key under videos/)
 * @param imageId - The output image ID (used as S3 key under images/)
 */
export async function extractFirstFrameViaLambda(
  videoId: string,
  imageId: string
): Promise<void> {
  if (!LAMBDA_FUNCTION) {
    throw new Error(
      "VIDEO_FRAME_EXTRACT_LAMBDA_ARN not configured. First-frame extraction is not available."
    );
  }

  const payload = {
    bucket: S3_BUCKET,
    video_key: `videos/${videoId}`,
    output_key: `images/${imageId}`,
  };

  console.log("[FrameExtract] Invoking Lambda:", JSON.stringify(payload));

  const command = new InvokeCommand({
    FunctionName: LAMBDA_FUNCTION,
    Payload: new TextEncoder().encode(JSON.stringify(payload)),
  });

  const response = await lambdaClient.send(command);

  if (response.FunctionError) {
    const errorBody = response.Payload
      ? JSON.parse(new TextDecoder().decode(response.Payload))
      : {};
    throw new Error(
      `Frame extract Lambda error (${response.FunctionError}): ${JSON.stringify(errorBody)}`
    );
  }

  const result = response.Payload
    ? JSON.parse(new TextDecoder().decode(response.Payload))
    : {};

  if (result.statusCode !== 200 || !result.body?.success) {
    throw new Error(
      `Frame extract Lambda failed: ${result.body?.error || "Unknown error"}`
    );
  }

  console.log(
    `[FrameExtract] OK — extracted frame: ${result.body.output_key} (${result.body.output_size_bytes} bytes)`
  );
}
