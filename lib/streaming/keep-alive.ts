// Wraps a streaming Uint8Array source with a periodic ping line so that
// intermediaries (Vercel edge, CDNs, corporate proxies) don't drop a long-
// running streamed response when the producer goes silent for minutes at a
// time (e.g. while polling a slow image-generation provider).
//
// The ping is `{"type":"ping"}\n`, which the chat client filters out.

const DEFAULT_INTERVAL_MS = 20_000;

export function withKeepAlive(
  source: ReadableStream<Uint8Array>,
  intervalMs: number = DEFAULT_INTERVAL_MS
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const pingChunk = encoder.encode(JSON.stringify({ type: "ping" }) + "\n");

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let lastEnqueueAt = Date.now();
      let closed = false;

      const heartbeat = setInterval(() => {
        if (closed) return;
        if (Date.now() - lastEnqueueAt < intervalMs) return;
        try {
          controller.enqueue(pingChunk);
          lastEnqueueAt = Date.now();
        } catch {
          // controller may already be closed
        }
      }, Math.max(1000, Math.floor(intervalMs / 2)));

      const reader = source.getReader();

      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
            lastEnqueueAt = Date.now();
          }
          closed = true;
          clearInterval(heartbeat);
          controller.close();
        } catch (err) {
          closed = true;
          clearInterval(heartbeat);
          try {
            controller.error(err);
          } catch {
            // already errored
          }
        }
      })();
    },
    cancel(reason) {
      return source.cancel(reason);
    },
  });
}

export const STREAM_KEEPALIVE_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
  Connection: "keep-alive",
} as const;
