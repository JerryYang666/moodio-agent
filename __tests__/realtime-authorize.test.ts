import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SignJWT } from "jose";

// Shared HS256 secret for the test. Matches JWT_ACCESS_SECRET.
const TEST_SECRET = "realtime-test-secret";

// We must set the env var before any import pulls `verifyInternalToken`.
process.env.JWT_ACCESS_SECRET = TEST_SECRET;

// Mock the DB-backed permission helpers so this test is fully local.
vi.mock("@/lib/desktop/permissions", () => ({
  getDesktopPermission: vi.fn(),
}));

vi.mock("@/lib/production-table/permissions", () => ({
  getTablePermission: vi.fn(),
  getEditableGrants: vi.fn(),
}));

import * as desktopPerms from "@/lib/desktop/permissions";
import * as tablePerms from "@/lib/production-table/permissions";
import {
  REALTIME_INTERNAL_AUDIENCE,
  verifyInternalToken,
} from "@/lib/auth/jwt";
import {
  authorizeTopic,
  parseTopic,
} from "@/lib/realtime/authorize";

// ------------------------------------------------------------
// parseTopic
// ------------------------------------------------------------

describe("parseTopic", () => {
  it("accepts valid desktop and production-table topics", () => {
    expect(parseTopic("desktop:abc")).toEqual({
      namespace: "desktop",
      id: "abc",
    });
    expect(parseTopic("production-table:T_1-2")).toEqual({
      namespace: "production-table",
      id: "T_1-2",
    });
  });

  it("rejects unknown namespaces", () => {
    expect(parseTopic("user:x")).toBeNull();
  });

  it("rejects malformed topics", () => {
    const cases = [
      "",
      "   ",
      "desktop",
      ":abc",
      "desktop:",
      "desktop:has spaces",
      "desktop:has!chars",
      "desktop:" + "a".repeat(129),
    ];
    for (const c of cases) {
      expect(parseTopic(c), `"${c}" should be null`).toBeNull();
    }
  });
});

// ------------------------------------------------------------
// authorizeTopic dispatch
// ------------------------------------------------------------

describe("authorizeTopic", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns bad_request for unknown namespace", async () => {
    const res = await authorizeTopic("user:abc", "user-1");
    expect(res).toEqual({ error: "bad_request" });
  });

  it("returns forbidden when desktop permission is null", async () => {
    vi.mocked(desktopPerms.getDesktopPermission).mockResolvedValue(null);
    const res = await authorizeTopic("desktop:d1", "user-1");
    expect(res).toEqual({ error: "forbidden" });
  });

  it("returns the desktop permission when granted", async () => {
    vi.mocked(desktopPerms.getDesktopPermission).mockResolvedValue("editor" as any);
    const res = await authorizeTopic("desktop:d1", "user-1");
    expect(res).toEqual({ permission: "editor" });
  });

  it("returns forbidden when production-table permission is null", async () => {
    vi.mocked(tablePerms.getTablePermission).mockResolvedValue(null);
    const res = await authorizeTopic("production-table:t1", "user-1");
    expect(res).toEqual({ error: "forbidden" });
  });

  it("promotes viewer to editor when column grants exist", async () => {
    vi.mocked(tablePerms.getTablePermission).mockResolvedValue("viewer" as any);
    vi.mocked(tablePerms.getEditableGrants).mockResolvedValue({
      columnIds: ["c1"],
      rowIds: [],
    });
    const res = await authorizeTopic("production-table:t1", "user-1");
    expect(res).toEqual({ permission: "editor" });
  });

  it("promotes viewer to editor when row grants exist", async () => {
    vi.mocked(tablePerms.getTablePermission).mockResolvedValue("viewer" as any);
    vi.mocked(tablePerms.getEditableGrants).mockResolvedValue({
      columnIds: [],
      rowIds: ["r1"],
    });
    const res = await authorizeTopic("production-table:t1", "user-1");
    expect(res).toEqual({ permission: "editor" });
  });

  it("keeps viewer when no grants", async () => {
    vi.mocked(tablePerms.getTablePermission).mockResolvedValue("viewer" as any);
    vi.mocked(tablePerms.getEditableGrants).mockResolvedValue({
      columnIds: [],
      rowIds: [],
    });
    const res = await authorizeTopic("production-table:t1", "user-1");
    expect(res).toEqual({ permission: "viewer" });
  });

  it("passes owner permission through", async () => {
    vi.mocked(tablePerms.getTablePermission).mockResolvedValue("owner" as any);
    const res = await authorizeTopic("production-table:t1", "user-1");
    expect(res).toEqual({ permission: "owner" });
  });
});

// ------------------------------------------------------------
// verifyInternalToken
// ------------------------------------------------------------

describe("verifyInternalToken", () => {
  const secret = new TextEncoder().encode(TEST_SECRET);

  async function mint(payload: Record<string, unknown>, opts?: {
    audience?: string;
    expSecondsFromNow?: number;
    secret?: Uint8Array;
  }) {
    const builder = new SignJWT(payload as any)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${opts?.expSecondsFromNow ?? 60}s`);
    if (opts?.audience) builder.setAudience(opts.audience);
    return builder.sign(opts?.secret ?? secret);
  }

  it("accepts a fresh token with the right audience", async () => {
    const token = await mint(
      { userId: "user-1" },
      { audience: REALTIME_INTERNAL_AUDIENCE }
    );
    const res = await verifyInternalToken(token);
    expect(res).toEqual({ userId: "user-1" });
  });

  it("rejects a token missing the audience", async () => {
    const token = await mint({ userId: "user-1" });
    expect(await verifyInternalToken(token)).toBeNull();
  });

  it("rejects a token with the wrong audience", async () => {
    const token = await mint(
      { userId: "user-1" },
      { audience: "something-else" }
    );
    expect(await verifyInternalToken(token)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await mint(
      { userId: "user-1" },
      {
        audience: REALTIME_INTERNAL_AUDIENCE,
        secret: new TextEncoder().encode("other-secret"),
      }
    );
    expect(await verifyInternalToken(token)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await mint(
      { userId: "user-1" },
      { audience: REALTIME_INTERNAL_AUDIENCE, expSecondsFromNow: -120 }
    );
    expect(await verifyInternalToken(token)).toBeNull();
  });

  it("rejects a token missing userId", async () => {
    const token = await mint(
      {},
      { audience: REALTIME_INTERNAL_AUDIENCE }
    );
    expect(await verifyInternalToken(token)).toBeNull();
  });

  it("rejects garbage", async () => {
    expect(await verifyInternalToken("not-a-jwt")).toBeNull();
    expect(await verifyInternalToken("")).toBeNull();
    expect(await verifyInternalToken("a.b.c")).toBeNull();
  });
});

// ------------------------------------------------------------
// /api/realtime/authorize — full route handler
// ------------------------------------------------------------

describe("GET /api/realtime/authorize", () => {
  let GET: (req: any) => Promise<Response>;
  const secret = new TextEncoder().encode(TEST_SECRET);

  beforeEach(async () => {
    vi.resetAllMocks();
    // Re-import after mock reset so the handler picks up fresh mocks.
    const mod = await import("@/app/api/realtime/authorize/route");
    GET = mod.GET;
  });

  afterEach(() => {
    vi.resetModules();
  });

  async function mintBearer(opts: {
    userId?: string;
    audience?: string;
    expSecondsFromNow?: number;
    secret?: Uint8Array;
  } = {}) {
    const builder = new SignJWT({ userId: opts.userId ?? "user-1" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${opts.expSecondsFromNow ?? 60}s`);
    if (opts.audience !== undefined) builder.setAudience(opts.audience);
    return builder.sign(opts.secret ?? secret);
  }

  function makeReq(topic: string, headers: Record<string, string> = {}) {
    const url = new URL(
      `http://test/api/realtime/authorize?topic=${encodeURIComponent(topic)}`
    );
    return {
      nextUrl: url,
      headers: {
        get(name: string) {
          return headers[name.toLowerCase()] ?? null;
        },
      },
    };
  }

  it("returns 400 when topic is missing", async () => {
    const bearer = await mintBearer({ audience: REALTIME_INTERNAL_AUDIENCE });
    const res = await GET({
      nextUrl: new URL("http://test/api/realtime/authorize"),
      headers: { get: (n: string) => n === "authorization" ? `Bearer ${bearer}` : null },
    });
    expect(res.status).toBe(400);
  });

  it("returns 401 when Authorization header is missing", async () => {
    const res = await GET(makeReq("desktop:abc"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when bearer lacks realtime-internal audience", async () => {
    const bearer = await mintBearer({ audience: "random" });
    const res = await GET(makeReq("desktop:abc", {
      authorization: `Bearer ${bearer}`,
    }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when bearer is expired", async () => {
    const bearer = await mintBearer({
      audience: REALTIME_INTERNAL_AUDIENCE,
      expSecondsFromNow: -120,
    });
    const res = await GET(makeReq("desktop:abc", {
      authorization: `Bearer ${bearer}`,
    }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for unknown namespace", async () => {
    const bearer = await mintBearer({ audience: REALTIME_INTERNAL_AUDIENCE });
    const res = await GET(makeReq("user:x", {
      authorization: `Bearer ${bearer}`,
    }));
    expect(res.status).toBe(400);
  });

  it("returns 403 when permission denied", async () => {
    vi.mocked(desktopPerms.getDesktopPermission).mockResolvedValue(null);
    const bearer = await mintBearer({ audience: REALTIME_INTERNAL_AUDIENCE });
    const res = await GET(makeReq("desktop:d1", {
      authorization: `Bearer ${bearer}`,
    }));
    expect(res.status).toBe(403);
  });

  it("returns 200 with permission for granted desktop", async () => {
    vi.mocked(desktopPerms.getDesktopPermission).mockResolvedValue("editor" as any);
    const bearer = await mintBearer({ audience: REALTIME_INTERNAL_AUDIENCE });
    const res = await GET(makeReq("desktop:d1", {
      authorization: `Bearer ${bearer}`,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ permission: "editor" });
  });

  it("returns 200 with promoted permission for PT viewer with grants", async () => {
    vi.mocked(tablePerms.getTablePermission).mockResolvedValue("viewer" as any);
    vi.mocked(tablePerms.getEditableGrants).mockResolvedValue({
      columnIds: ["c1"],
      rowIds: [],
    });
    const bearer = await mintBearer({ audience: REALTIME_INTERNAL_AUDIENCE });
    const res = await GET(makeReq("production-table:t1", {
      authorization: `Bearer ${bearer}`,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ permission: "editor" });
  });

  it("uses userId from the token, ignoring any userId query param", async () => {
    // The handler must never read a userId query param. Mock to assert the
    // exact userId passed through the dispatch.
    const getPerm = vi.mocked(desktopPerms.getDesktopPermission);
    getPerm.mockResolvedValue("editor" as any);
    const bearer = await mintBearer({
      audience: REALTIME_INTERNAL_AUDIENCE,
      userId: "from-token",
    });

    // Craft a URL with a rogue userId query — it must not be honored.
    const req = {
      nextUrl: new URL(
        "http://test/api/realtime/authorize?topic=desktop:d&userId=from-query"
      ),
      headers: {
        get: (n: string) =>
          n === "authorization" ? `Bearer ${bearer}` : null,
      },
    };
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(getPerm).toHaveBeenCalledWith("d", "from-token");
  });
});
