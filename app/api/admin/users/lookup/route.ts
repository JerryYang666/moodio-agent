import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

interface LookupResult {
  email: string;
  found: boolean;
  user?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
}

/**
 * POST /api/admin/users/lookup
 * Batch lookup users by email addresses
 * Body: { emails: string[] }
 * Returns: { results: LookupResult[] }
 */
export async function POST(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const payload = await verifyAccessToken(accessToken);
    if (!payload || !payload.roles?.includes("admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { emails } = body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json(
        { error: "emails array is required" },
        { status: 400 }
      );
    }

    // Normalize and dedupe emails
    const normalizedEmails = Array.from(new Set(
      emails
        .map((e: string) => e.trim().toLowerCase())
        .filter((e: string) => e.length > 0)
    ));

    if (normalizedEmails.length === 0) {
      return NextResponse.json(
        { error: "No valid emails provided" },
        { status: 400 }
      );
    }

    // Batch lookup users
    const foundUsers = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(inArray(users.email, normalizedEmails));

    // Create lookup map
    const userMap = new Map(foundUsers.map((u) => [u.email.toLowerCase(), u]));

    // Build results preserving original order
    const results: LookupResult[] = normalizedEmails.map((email) => {
      const user = userMap.get(email);
      return {
        email,
        found: !!user,
        user: user || undefined,
      };
    });

    return NextResponse.json({
      results,
      summary: {
        total: normalizedEmails.length,
        found: foundUsers.length,
        notFound: normalizedEmails.length - foundUsers.length,
      },
    });
  } catch (error) {
    console.error("Error looking up users:", error);
    return NextResponse.json(
      { error: "Failed to lookup users" },
      { status: 500 }
    );
  }
}
