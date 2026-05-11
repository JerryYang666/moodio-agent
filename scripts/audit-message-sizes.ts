/**
 * Audit the byte size of every chat message in S3 to evaluate whether we
 * can migrate to DynamoDB with a "one message = one item" schema.
 *
 * DynamoDB's hard item-size limit is 400 KB. We report:
 *   - the largest single message found
 *   - how many messages (if any) exceed 400 KB
 *   - the top-N largest messages with enough detail to locate them
 *   - a size histogram across all messages
 *
 * Size proxy: UTF-8 byte length of JSON.stringify(message). DynamoDB's actual
 * item size counts attribute names + UTF-8 value bytes + per-attribute
 * overhead, so the real DDB size will be a bit larger (roughly
 * sum(len(attr_name) + len(value))). Treat this proxy as a tight lower bound
 * — if JSON size is already near 400 KB, assume the item won't fit.
 *
 * Reads raw S3 JSON rather than going through getChatHistory(), because
 * getChatHistory re-hydrates derived URLs that aren't persisted. The raw
 * bytes in S3 are what we'd actually migrate.
 *
 * Run:
 *   AWS_PROFILE=moodio \
 *   AWS_REGION=us-east-2 \
 *   AWS_S3_BUCKET_NAME=... \
 *   npx tsx scripts/audit-message-sizes.ts [--top N] [--concurrency N]
 */
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

const BUCKET = process.env.AWS_S3_BUCKET_NAME;
const REGION = process.env.AWS_REGION || "us-east-2";

const DDB_ITEM_LIMIT_BYTES = 400 * 1024;
const CHAT_PREFIX = "chats/";

function parseIntFlag(argv: string[], name: string, fallback: number): number {
  const idx = argv.findIndex((a) => a === name);
  if (idx === -1) return fallback;
  const n = Number(argv[idx + 1]);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`${name} requires a positive number`);
    process.exit(1);
  }
  return Math.floor(n);
}

const TOP_N = parseIntFlag(process.argv.slice(2), "--top", 20);
const CONCURRENCY = parseIntFlag(process.argv.slice(2), "--concurrency", 32);

if (!BUCKET) {
  console.error("AWS_S3_BUCKET_NAME is required");
  process.exit(1);
}

const s3 = new S3Client({ region: REGION });

interface SampledMessage {
  chatId: string;
  messageIndex: number;
  bytes: number;
  role: string;
  contentSummary: string;
}

// Histogram buckets in bytes — chosen to bracket the 400 KB DynamoDB limit.
const HISTOGRAM_BUCKETS: Array<{ label: string; limit: number }> = [
  { label: "<1 KB", limit: 1 * 1024 },
  { label: "1-10 KB", limit: 10 * 1024 },
  { label: "10-50 KB", limit: 50 * 1024 },
  { label: "50-100 KB", limit: 100 * 1024 },
  { label: "100-200 KB", limit: 200 * 1024 },
  { label: "200-400 KB", limit: 400 * 1024 },
  { label: ">=400 KB (EXCEEDS DDB LIMIT)", limit: Infinity },
];

function bucketFor(bytes: number): string {
  for (const b of HISTOGRAM_BUCKETS) {
    if (bytes < b.limit) return b.label;
  }
  return HISTOGRAM_BUCKETS[HISTOGRAM_BUCKETS.length - 1].label;
}

function summarizeContent(content: unknown): string {
  if (typeof content === "string") {
    return `string(len=${content.length})`;
  }
  if (Array.isArray(content)) {
    const counts: Record<string, number> = {};
    for (const part of content) {
      const t =
        part && typeof part === "object" && "type" in part
          ? String((part as { type: unknown }).type)
          : "unknown";
      counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([t, n]) => `${t}×${n}`)
      .join(",");
  }
  return typeof content;
}

async function listAllChatKeys(): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: CHAT_PREFIX,
        ContinuationToken: continuationToken,
      })
    );
    for (const obj of page.Contents || []) {
      if (obj.Key && obj.Key.endsWith(".json")) keys.push(obj.Key);
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

async function fetchChatJson(key: string): Promise<string | null> {
  try {
    const res = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: key })
    );
    if (!res.Body) return null;
    return await res.Body.transformToString();
  } catch (err) {
    console.warn(`[audit] failed to fetch ${key}:`, err);
    return null;
  }
}

async function runPool<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  concurrency: number
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      await worker(items[i]);
    }
  });
  await Promise.all(runners);
}

async function main() {
  console.log(
    `[audit] bucket=${BUCKET} region=${REGION} concurrency=${CONCURRENCY} topN=${TOP_N}`
  );
  const start = Date.now();

  const keys = await listAllChatKeys();
  console.log(`[audit] found ${keys.length} chat files under ${CHAT_PREFIX}`);

  let chatsProcessed = 0;
  let chatsFailed = 0;
  let totalMessages = 0;
  let totalBytes = 0;
  let maxBytes = 0;
  let overLimitCount = 0;

  const histogram: Record<string, number> = {};
  for (const b of HISTOGRAM_BUCKETS) histogram[b.label] = 0;

  // Maintain a min-heap-ish bounded list of the largest N messages. Simple
  // sorted array is fine at N=20 and ~2600 chats.
  const top: SampledMessage[] = [];
  function considerTop(sample: SampledMessage) {
    if (top.length < TOP_N) {
      top.push(sample);
      top.sort((a, b) => b.bytes - a.bytes);
      return;
    }
    if (sample.bytes > top[top.length - 1].bytes) {
      top[top.length - 1] = sample;
      top.sort((a, b) => b.bytes - a.bytes);
    }
  }

  await runPool(
    keys,
    async (key) => {
      const body = await fetchChatJson(key);
      if (body === null) {
        chatsFailed++;
        return;
      }
      let data: { messages?: unknown[] };
      try {
        data = JSON.parse(body);
      } catch (err) {
        chatsFailed++;
        console.warn(`[audit] invalid JSON in ${key}:`, err);
        return;
      }
      const chatId = key
        .slice(CHAT_PREFIX.length)
        .replace(/\.json$/, "");
      const messages = Array.isArray(data.messages) ? data.messages : [];
      messages.forEach((message, idx) => {
        const bytes = Buffer.byteLength(JSON.stringify(message), "utf8");
        totalMessages++;
        totalBytes += bytes;
        if (bytes > maxBytes) maxBytes = bytes;
        if (bytes >= DDB_ITEM_LIMIT_BYTES) overLimitCount++;
        histogram[bucketFor(bytes)]++;
        const m = message as { role?: unknown; content?: unknown };
        considerTop({
          chatId,
          messageIndex: idx,
          bytes,
          role: typeof m.role === "string" ? m.role : "unknown",
          contentSummary: summarizeContent(m.content),
        });
      });
      chatsProcessed++;
      if (chatsProcessed % 200 === 0) {
        console.log(
          `[audit] progress chats=${chatsProcessed}/${keys.length} messages=${totalMessages} maxBytes=${maxBytes}`
        );
      }
    },
    CONCURRENCY
  );

  const seconds = ((Date.now() - start) / 1000).toFixed(1);
  const meanBytes = totalMessages > 0 ? Math.round(totalBytes / totalMessages) : 0;

  console.log("");
  console.log("=".repeat(72));
  console.log(`[audit] done in ${seconds}s`);
  console.log(
    `[audit] chats: processed=${chatsProcessed} failed=${chatsFailed} total=${keys.length}`
  );
  console.log(
    `[audit] messages: total=${totalMessages} mean=${meanBytes}B max=${maxBytes}B (${(maxBytes / 1024).toFixed(1)} KB)`
  );
  console.log(
    `[audit] DynamoDB 400 KB check: ${overLimitCount === 0 ? "PASS (all messages fit)" : `FAIL (${overLimitCount} messages exceed 400 KB)`}`
  );
  console.log("");
  console.log("Size histogram (by message):");
  for (const b of HISTOGRAM_BUCKETS) {
    const n = histogram[b.label];
    const pct = totalMessages > 0 ? ((n / totalMessages) * 100).toFixed(2) : "0.00";
    console.log(`  ${b.label.padEnd(32)} ${String(n).padStart(8)}  ${pct}%`);
  }
  console.log("");
  console.log(`Top ${top.length} largest messages:`);
  console.log(
    "  rank  bytes      KB       role       chatId  idx  content"
  );
  top.forEach((m, i) => {
    console.log(
      `  ${String(i + 1).padStart(4)}  ${String(m.bytes).padStart(9)}  ${(m.bytes / 1024).toFixed(1).padStart(7)}  ${m.role.padEnd(10)} ${m.chatId}  ${String(m.messageIndex).padStart(3)}  ${m.contentSummary}`
    );
  });
  console.log("");
  console.log(
    "Note: size proxy = UTF-8 byte length of JSON.stringify(message). DynamoDB's"
  );
  console.log(
    "actual item size adds attribute-name bytes and per-attribute overhead, so"
  );
  console.log(
    "real item size will be slightly larger than the numbers above."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
