import { NextRequest, NextResponse } from "next/server";
import { PERMISSION_OWNER } from "@/lib/permissions";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { listTablesForUser, createTable } from "@/lib/production-table/queries";

export async function GET(req: NextRequest) {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { owned, shared } = await listTablesForUser(payload.userId);
    return NextResponse.json({ tables: [...owned, ...shared] });
  } catch (error) {
    console.error("Error listing production tables:", error);
    return NextResponse.json(
      { error: "Failed to list tables" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await req.json();
    const { name, teamId } = body as { name?: unknown; teamId?: unknown };

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Table name is required" },
        { status: 400 }
      );
    }

    const table = await createTable(
      payload.userId,
      name.trim(),
      typeof teamId === "string" ? teamId : undefined
    );

    return NextResponse.json({
      table: { ...table, permission: PERMISSION_OWNER, isOwner: true },
    });
  } catch (error) {
    console.error("Error creating production table:", error);
    return NextResponse.json(
      { error: "Failed to create table" },
      { status: 500 }
    );
  }
}
