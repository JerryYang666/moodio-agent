import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { creditPackages } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

/**
 * GET /api/admin/credit-packages
 * Returns all credit packages (active and inactive).
 */
export async function GET(request: NextRequest) {
  const accessToken = getAccessToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = await verifyAccessToken(accessToken);
  if (!payload || !payload.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const packages = await db
    .select()
    .from(creditPackages)
    .orderBy(asc(creditPackages.sortOrder));
  return NextResponse.json(packages);
}

/**
 * POST /api/admin/credit-packages
 * Create a new credit package.
 */
export async function POST(request: NextRequest) {
  const accessToken = getAccessToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = await verifyAccessToken(accessToken);
  if (!payload || !payload.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { name, credits, priceCents, stripePriceId, sortOrder } = body;

    if (!name || credits == null || priceCents == null || !stripePriceId) {
      return NextResponse.json(
        { error: "name, credits, priceCents, and stripePriceId are required" },
        { status: 400 }
      );
    }

    const [pkg] = await db
      .insert(creditPackages)
      .values({
        name,
        credits: Number(credits),
        priceCents: Number(priceCents),
        stripePriceId,
        sortOrder: sortOrder ?? 0,
      })
      .returning();

    return NextResponse.json(pkg, { status: 201 });
  } catch (error: any) {
    console.error("[Admin Credit Packages] Create error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create package" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/credit-packages
 * Update an existing credit package.
 */
export async function PUT(request: NextRequest) {
  const accessToken = getAccessToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = await verifyAccessToken(accessToken);
  if (!payload || !payload.roles?.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const allowedFields: Record<string, string> = {
      name: "name",
      credits: "credits",
      priceCents: "priceCents",
      stripePriceId: "stripePriceId",
      isActive: "isActive",
      sortOrder: "sortOrder",
    };

    const setValues: Record<string, any> = {};
    for (const [key, col] of Object.entries(allowedFields)) {
      if (updates[key] !== undefined) {
        setValues[col] = updates[key];
      }
    }

    if (Object.keys(setValues).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const [pkg] = await db
      .update(creditPackages)
      .set(setValues)
      .where(eq(creditPackages.id, id))
      .returning();

    if (!pkg) {
      return NextResponse.json({ error: "Package not found" }, { status: 404 });
    }

    return NextResponse.json(pkg);
  } catch (error: any) {
    console.error("[Admin Credit Packages] Update error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update package" },
      { status: 500 }
    );
  }
}
