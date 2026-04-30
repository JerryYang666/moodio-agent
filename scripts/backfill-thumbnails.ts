/**
 * Backfill sm/md thumbnails for every object under `images/` in S3.
 *
 * Idempotent and re-runnable:
 *   - HEAD-probes `thumbnails/sm/{id}` and skips already-thumbed images.
 *   - Invokes the image-thumbnail Lambda asynchronously (fire-and-forget) at a
 *     bounded concurrency, so the script itself stays lightweight.
 *
 * Run:
 *   AWS_PROFILE=moodio \
 *   AWS_REGION=us-east-2 \
 *   AWS_S3_BUCKET_NAME=... \
 *   IMAGE_THUMBNAIL_LAMBDA_ARN=arn:aws:lambda:us-east-2:...:function:image-thumbnail \
 *   npx tsx scripts/backfill-thumbnails.ts [--limit N]
 *
 * Flags:
 *   --limit N    Stop after processing N batches, where one batch is
 *                CONCURRENCY images processed in parallel. `--limit 1` with
 *                the default concurrency of 100 processes 100 images, then
 *                exits. Useful for smoke-testing before a full run.
 */
import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

function parseLimit(argv: string[]): number | undefined {
  const idx = argv.findIndex((a) => a === "--limit");
  if (idx === -1) return undefined;
  const value = argv[idx + 1];
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    console.error("--limit requires a positive number");
    process.exit(1);
  }
  return Math.floor(n);
}

const BUCKET = process.env.AWS_S3_BUCKET_NAME;
const LAMBDA_ARN = process.env.IMAGE_THUMBNAIL_LAMBDA_ARN;
const REGION = process.env.AWS_REGION || "us-east-2";
const CONCURRENCY = Number(process.env.BACKFILL_CONCURRENCY || 100);
const LIMIT = parseLimit(process.argv.slice(2));

const SOURCE_PREFIX = "images/";
const SM_PREFIX = "thumbnails/sm/";
const MD_PREFIX = "thumbnails/md/";

if (!BUCKET) {
  console.error("AWS_S3_BUCKET_NAME is required");
  process.exit(1);
}
if (!LAMBDA_ARN) {
  console.error("IMAGE_THUMBNAIL_LAMBDA_ARN is required");
  process.exit(1);
}

const s3 = new S3Client({ region: REGION });
const lambda = new LambdaClient({ region: REGION });

let scanned = 0;
let skipped = 0;
let invoked = 0;
let failed = 0;

async function headExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch (err: unknown) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e.name === "NotFound" || e.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw err;
  }
}

async function invokeAsync(imageId: string): Promise<void> {
  const payload = {
    bucket: BUCKET,
    image_key: `${SOURCE_PREFIX}${imageId}`,
    sm_key: `${SM_PREFIX}${imageId}`,
    md_key: `${MD_PREFIX}${imageId}`,
  };
  await lambda.send(
    new InvokeCommand({
      FunctionName: LAMBDA_ARN,
      InvocationType: "Event", // async, fire-and-forget
      Payload: new TextEncoder().encode(JSON.stringify(payload)),
    })
  );
}

async function processOne(imageId: string): Promise<void> {
  scanned++;
  try {
    if (await headExists(`${SM_PREFIX}${imageId}`)) {
      skipped++;
      return;
    }
    await invokeAsync(imageId);
    invoked++;
  } catch (err) {
    failed++;
    console.warn(`[backfill] failed ${imageId}:`, err);
  }
}

/**
 * Fan out with a bounded worker pool. Shares an iterator across workers so
 * work is distributed evenly and the first batch doesn't stall the last.
 * Stops early when the shared `stop` flag flips (used by --limit).
 */
async function runPool<T>(
  items: Iterable<T>,
  worker: (item: T) => Promise<void>,
  concurrency: number,
  stop: { flag: boolean }
): Promise<void> {
  const iterator = items[Symbol.iterator]();
  const runners = Array.from({ length: concurrency }, async () => {
    for (;;) {
      if (stop.flag) return;
      const { value, done } = iterator.next();
      if (done) return;
      await worker(value as T);
    }
  });
  await Promise.all(runners);
}

async function main() {
  console.log(
    `[backfill] bucket=${BUCKET} region=${REGION} concurrency=${CONCURRENCY}${
      LIMIT ? ` limitBatches=${LIMIT} (≈${LIMIT * CONCURRENCY} images)` : ""
    }`
  );
  const start = Date.now();
  const stop = { flag: false };

  let batchesDone = 0;
  let continuationToken: string | undefined;
  outer: do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: SOURCE_PREFIX,
        ContinuationToken: continuationToken,
      })
    );

    const keys = (page.Contents || [])
      .map((o) => o.Key || "")
      .filter((k) => k.startsWith(SOURCE_PREFIX) && k.length > SOURCE_PREFIX.length);
    const imageIds = keys.map((k) => k.slice(SOURCE_PREFIX.length));

    // Process this page CONCURRENCY images at a time; each inner loop is one
    // "batch". --limit caps how many batches we run in total.
    for (let i = 0; i < imageIds.length; i += CONCURRENCY) {
      const batch = imageIds.slice(i, i + CONCURRENCY);
      await runPool(batch, processOne, CONCURRENCY, stop);
      batchesDone++;
      if (batchesDone % 10 === 0) {
        console.log(
          `[backfill] batches=${batchesDone} scanned=${scanned} invoked=${invoked} skipped=${skipped} failed=${failed}`
        );
      }
      if (LIMIT && batchesDone >= LIMIT) {
        stop.flag = true;
        break outer;
      }
      // Gentle pacing so bursts of 100+ concurrent invokes don't stack up in
      // the Lambda async queue faster than the reserved concurrency can drain.
      await new Promise((r) => setTimeout(r, 1000));
    }

    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  const seconds = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `[backfill] done in ${seconds}s — batches=${batchesDone} scanned=${scanned} invoked=${invoked} skipped=${skipped} failed=${failed}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
