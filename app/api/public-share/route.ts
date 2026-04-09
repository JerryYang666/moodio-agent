import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { publicShareLinks, collections, folders } from "@/lib/db/schema";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { eq, and } from "drizzle-orm";
import { getUserPermission } from "@/lib/collection-utils";
import { getFolderPermission } from "@/lib/folder-utils";
import { hasWriteAccess } from "@/lib/permissions";
import { siteConfig } from "@/config/site";

const VALID_RESOURCE_TYPES = ["collection", "folder"] as const;
type ResourceType = (typeof VALID_RESOURCE_TYPES)[number];

function isValidResourceType(value: unknown): value is ResourceType {
  return typeof value === "string" && VALID_RESOURCE_TYPES.includes(value as ResourceType);
}

function isValidUUID(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function getResourcePermission(resourceType: ResourceType, resourceId: string, userId: string) {
  if (resourceType === "collection") {
    return getUserPermission(resourceId, userId);
  }
  return getFolderPermission(resourceId, userId);
}

async function resourceExists(resourceType: ResourceType, resourceId: string): Promise<boolean> {
  if (resourceType === "collection") {
    const [row] = await db.select({ id: collections.id }).from(collections).where(eq(collections.id, resourceId)).limit(1);
    return !!row;
  }
  const [row] = await db.select({ id: folders.id }).from(folders).where(eq(folders.id, resourceId)).limit(1);
  return !!row;
}

function buildShareUrl(token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "";
  return `${baseUrl}/share/${token}`;
}

/**
 * GET /api/public-share?resourceType=collection&resourceId=xxx
 * Check public share status for a resource (auth required, write-access only).
 */
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

    const url = new URL(req.url);
    const resourceType = url.searchParams.get("resourceType");
    const resourceId = url.searchParams.get("resourceId");

    if (!isValidResourceType(resourceType) || !isValidUUID(resourceId)) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const permission = await getResourcePermission(resourceType, resourceId, payload.userId);
    if (!hasWriteAccess(permission)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [existing] = await db
      .select()
      .from(publicShareLinks)
      .where(
        and(
          eq(publicShareLinks.resourceType, resourceType),
          eq(publicShareLinks.resourceId, resourceId)
        )
      )
      .limit(1);

    if (!existing) {
      return NextResponse.json({ exists: false });
    }

    return NextResponse.json({
      exists: true,
      token: existing.token,
      isActive: existing.isActive,
      url: buildShareUrl(existing.token),
    });
  } catch (error) {
    console.error("Error checking public share status:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/public-share
 * Create or toggle a public share link (auth required, write-access only).
 */
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

    const origin = req.headers.get("origin");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    if (origin && appUrl && !appUrl.startsWith(origin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { resourceType, resourceId } = body as { resourceType?: string; resourceId?: string };

    if (!isValidResourceType(resourceType) || !isValidUUID(resourceId)) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    if (!(await resourceExists(resourceType, resourceId))) {
      return NextResponse.json({ error: "Resource not found" }, { status: 404 });
    }

    const permission = await getResourcePermission(resourceType, resourceId, payload.userId);
    if (!hasWriteAccess(permission)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [existing] = await db
      .select()
      .from(publicShareLinks)
      .where(
        and(
          eq(publicShareLinks.resourceType, resourceType),
          eq(publicShareLinks.resourceId, resourceId)
        )
      )
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(publicShareLinks)
        .set({ isActive: !existing.isActive })
        .where(eq(publicShareLinks.id, existing.id))
        .returning();

      return NextResponse.json({
        token: updated.token,
        isActive: updated.isActive,
        url: buildShareUrl(updated.token),
      });
    }

    const token = randomBytes(32).toString("hex");
    const [created] = await db
      .insert(publicShareLinks)
      .values({
        token,
        resourceType,
        resourceId,
        userId: payload.userId,
      })
      .returning();

    return NextResponse.json({
      token: created.token,
      isActive: created.isActive,
      url: buildShareUrl(created.token),
    });
  } catch (error) {
    console.error("Error creating/toggling public share:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
