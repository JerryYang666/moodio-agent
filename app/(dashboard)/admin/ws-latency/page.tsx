"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@heroui/spinner";
import { Progress } from "@heroui/progress";
import { Chip } from "@heroui/chip";

const WS_BASE_URL =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_WS_URL || `ws://${window.location.hostname}:8081`
    : "";

const DEFAULT_PING_COUNT = 20;

interface PingResult {
  seq: number;
  rtt: number;
}

type TestStatus = "idle" | "running" | "done" | "error";

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function rttColor(ms: number): "success" | "warning" | "danger" {
  if (ms < 50) return "success";
  if (ms < 150) return "warning";
  return "danger";
}

export default function WsLatencyPage() {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<TestStatus>("idle");
  const [results, setResults] = useState<PingResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [pingCount, setPingCount] = useState(DEFAULT_PING_COUNT);
  const [errorMsg, setErrorMsg] = useState("");
  const [outOfOrder, setOutOfOrder] = useState(false);
  const abortRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);

  const runTest = useCallback(() => {
    abortRef.current = false;
    setResults([]);
    setProgress(0);
    setStatus("running");
    setErrorMsg("");
    setOutOfOrder(false);

    const url = `${WS_BASE_URL}/ws/ping`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    const sendTimes = new Map<number, number>();
    const collected: PingResult[] = [];
    let nextExpectedSeq = 0;
    let orderViolated = false;

    ws.onopen = () => {
      for (let i = 0; i < pingCount; i++) {
        if (abortRef.current) break;
        const ts = performance.now();
        sendTimes.set(i, ts);
        ws.send(JSON.stringify({ seq: i, ts }));
      }
    };

    ws.onmessage = (event) => {
      if (abortRef.current) return;

      try {
        const data = JSON.parse(event.data);
        const seq: number = data.seq;
        const sentAt = sendTimes.get(seq);
        if (sentAt == null) return;

        const rtt = performance.now() - sentAt;

        if (seq !== nextExpectedSeq) {
          orderViolated = true;
          setOutOfOrder(true);
        }
        nextExpectedSeq = seq + 1;

        collected.push({ seq, rtt });
        setResults([...collected]);
        setProgress(Math.round((collected.length / pingCount) * 100));

        if (collected.length >= pingCount) {
          ws.close();
          setStatus("done");
        }
      } catch {
        // ignore malformed echo
      }
    };

    ws.onerror = () => {
      setStatus("error");
      setErrorMsg(
        "Could not connect to the WebSocket relay. Make sure the realtime server is running.",
      );
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (collected.length > 0 && collected.length < pingCount && !abortRef.current) {
        setStatus("done");
      } else if (collected.length === 0 && !abortRef.current) {
        setStatus("error");
        setErrorMsg("Connection closed before any pings completed.");
      }
    };
  }, [pingCount]);

  const handleStop = useCallback(() => {
    abortRef.current = true;
    wsRef.current?.close();
    setStatus("done");
  }, []);

  if (authLoading) {
    return <Spinner size="lg" className="flex justify-center mt-10" />;
  }

  if (!user || !user.roles.includes("admin")) {
    return <div className="p-8 text-center">Unauthorized</div>;
  }

  const rtts = results.map((r) => r.rtt);
  const sortedRtts = [...rtts].sort((a, b) => a - b);
  const avg = rtts.length > 0 ? rtts.reduce((a, b) => a + b, 0) / rtts.length : 0;
  const min = sortedRtts[0] ?? 0;
  const max = sortedRtts[sortedRtts.length - 1] ?? 0;
  const p50 = sortedRtts.length > 0 ? percentile(sortedRtts, 50) : 0;
  const p95 = sortedRtts.length > 0 ? percentile(sortedRtts, 95) : 0;
  const p99 = sortedRtts.length > 0 ? percentile(sortedRtts, 99) : 0;
  const jitter =
    rtts.length > 1
      ? rtts.slice(1).reduce((sum, rtt, i) => sum + Math.abs(rtt - rtts[i]), 0) /
        (rtts.length - 1)
      : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">WebSocket Latency Test</h1>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Round-trip Ping Test</h2>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-default-500">
              Opens a WebSocket connection to the realtime relay and sends all
              ping messages in a burst. Each echo is verified to arrive in the
              correct sequence order, and round-trip latency is measured per
              message then averaged.
            </p>
            <p className="text-xs text-default-400 font-mono">
              Target: {WS_BASE_URL}/ws/ping
            </p>

            <div className="flex items-center gap-4">
              <label className="text-sm font-medium whitespace-nowrap">
                Ping count:
              </label>
              <input
                type="number"
                min={5}
                max={100}
                value={pingCount}
                onChange={(e) => setPingCount(Math.max(5, Math.min(100, Number(e.target.value))))}
                disabled={status === "running"}
                className="w-20 px-2 py-1 rounded border border-default-300 bg-default-100 text-sm"
              />
              <Button
                color="primary"
                variant="flat"
                onPress={runTest}
                isLoading={status === "running"}
                isDisabled={status === "running"}
              >
                {status === "idle" ? "Start Test" : "Run Again"}
              </Button>
              {status === "running" && (
                <Button color="danger" variant="light" size="sm" onPress={handleStop}>
                  Stop
                </Button>
              )}
            </div>

            {status === "running" && (
              <Progress
                aria-label="Ping progress"
                value={progress}
                size="sm"
                color="primary"
                className="max-w-md"
              />
            )}

            {status === "error" && (
              <div className="p-3 rounded-lg bg-danger-50 dark:bg-danger-50/10 text-danger text-sm">
                {errorMsg}
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {results.length > 0 && (
        <>
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Statistics</h2>
            </CardHeader>
            <CardBody>
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">Message ordering:</span>
                  {outOfOrder ? (
                    <Chip color="danger" variant="flat" size="sm">
                      Out of order detected
                    </Chip>
                  ) : (
                    <Chip color="success" variant="flat" size="sm">
                      All {results.length} messages in order
                    </Chip>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <StatBox label="Min" value={min} />
                  <StatBox label="Avg" value={avg} />
                  <StatBox label="Max" value={max} />
                  <StatBox label="Jitter" value={jitter} />
                  <StatBox label="P50" value={p50} />
                  <StatBox label="P95" value={p95} />
                  <StatBox label="P99" value={p99} />
                  <div className="flex flex-col items-center justify-center p-3 rounded-lg bg-default-100">
                    <span className="text-xs text-default-500 uppercase tracking-wide">
                      Samples
                    </span>
                    <span className="text-xl font-bold">{results.length}</span>
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Individual Pings</h2>
            </CardHeader>
            <CardBody>
              <div className="flex flex-wrap gap-2">
                {results.map((r, i) => {
                  const isReordered = i > 0 && r.seq < results[i - 1].seq;
                  return (
                    <Chip
                      key={`${r.seq}-${i}`}
                      size="sm"
                      variant={isReordered ? "solid" : "flat"}
                      color={isReordered ? "danger" : rttColor(r.rtt)}
                    >
                      #{r.seq + 1}: {r.rtt.toFixed(1)}ms
                      {isReordered && " ⚠"}
                    </Chip>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center justify-center p-3 rounded-lg bg-default-100">
      <span className="text-xs text-default-500 uppercase tracking-wide">
        {label}
      </span>
      <span className={`text-xl font-bold`}>
        {value.toFixed(1)}
        <span className="text-xs text-default-400 ml-0.5">ms</span>
      </span>
    </div>
  );
}
