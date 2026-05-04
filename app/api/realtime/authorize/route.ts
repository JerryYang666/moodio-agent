import { NextRequest, NextResponse } from "next/server";
import { verifyInternalToken } from "@/lib/auth/jwt";
import { authorizeTopic } from "@/lib/realtime/authorize";

/**
 * GET /api/realtime/authorize?topic=<namespace>:<id>
 *
 * Called by the Go realtime relay. The relay mints a short-lived internal
 * JWT (aud=realtime-internal) from its cached user Claims and presents it
 * here as a Bearer token. User cookie JWTs do NOT carry that audience, so
 * this endpoint is effectively relay-only even though it's mounted on the
 * public Next.js server.
 */
export async function GET(req: NextRequest) {
  const topic = req.nextUrl.searchParams.get("topic") ?? "";
  if (!topic) {
    return NextResponse.json({ error: "missing topic" }, { status: 400 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    console.error("[realtime/authorize] missing bearer header");
    return NextResponse.json({ error: "missing bearer" }, { status: 401 });
  }
  const bearer = authHeader.slice(7).trim();

  const payload = await verifyInternalToken(bearer);
  if (!payload) {
    console.error("[realtime/authorize] invalid bearer token");
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  const result = await authorizeTopic(topic, payload.userId);
  if ("error" in result) {
    const status =
      result.error === "bad_request"
        ? 400
        : result.error === "not_found"
        ? 404
        : 403;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ permission: result.permission });
}
