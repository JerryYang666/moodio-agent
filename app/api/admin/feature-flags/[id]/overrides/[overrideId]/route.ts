import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { featureFlags, groupFlagOverrides } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; overrideId: string }> }
) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const payload = await verifyAccessToken(accessToken);
    if (!payload || !payload.roles?.includes("admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id: flagId, overrideId } = await params;
    const body = await request.json();
    const { value } = body;

    if (value === undefined || value === null) {
      return NextResponse.json({ error: "value is required" }, { status: 400 });
    }

    // Verify flag exists and get its type
    const [flag] = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.id, flagId));

    if (!flag) {
      return NextResponse.json({ error: "Flag not found" }, { status: 404 });
    }

    // Validate value matches flag type
    const stringValue = String(value);
    if (flag.valueType === "boolean" && !["true", "false"].includes(stringValue)) {
      return NextResponse.json(
        { error: "value must be 'true' or 'false' for boolean flag" },
        { status: 400 }
      );
    }
    if (flag.valueType === "number" && isNaN(Number(stringValue))) {
      return NextResponse.json(
        { error: "value must be a valid number for number flag" },
        { status: 400 }
      );
    }

    const [updatedOverride] = await db
      .update(groupFlagOverrides)
      .set({
        value: stringValue,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(groupFlagOverrides.id, overrideId),
          eq(groupFlagOverrides.flagId, flagId)
        )
      )
      .returning();

    if (!updatedOverride) {
      return NextResponse.json({ error: "Override not found" }, { status: 404 });
    }

    return NextResponse.json({ override: updatedOverride });
  } catch (error) {
    console.error("Error updating flag override:", error);
    return NextResponse.json(
      { error: "Failed to update flag override" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; overrideId: string }> }
) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const payload = await verifyAccessToken(accessToken);
    if (!payload || !payload.roles?.includes("admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id: flagId, overrideId } = await params;

    const [deletedOverride] = await db
      .delete(groupFlagOverrides)
      .where(
        and(
          eq(groupFlagOverrides.id, overrideId),
          eq(groupFlagOverrides.flagId, flagId)
        )
      )
      .returning();

    if (!deletedOverride) {
      return NextResponse.json({ error: "Override not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting flag override:", error);
    return NextResponse.json(
      { error: "Failed to delete flag override" },
      { status: 500 }
    );
  }
}
