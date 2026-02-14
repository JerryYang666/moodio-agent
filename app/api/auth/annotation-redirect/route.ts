/**
 * GET /api/auth/annotation-redirect
 * Issues new auth tokens scoped to .moodio.art domain and redirects to the annotation platform.
 * Only accessible to users with "admin" or "annotator" role.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken, generateAccessToken } from "@/lib/auth/jwt";
import { generateRefreshToken, createRefreshToken } from "@/lib/auth/tokens";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { siteConfig } from "@/config/site";

const ANNOTATION_PLATFORM_URL =
  process.env.ANNOTATION_PLATFORM_URL || "https://admin.moodio.art/admin/browse-shots-admin";

/** Parent domain for cross-subdomain cookies (e.g. ".moodio.art") */
const PARENT_COOKIE_DOMAIN = process.env.PARENT_COOKIE_DOMAIN || ".moodio.art";

export async function GET(request: NextRequest) {
  try {
    // 1. Verify current access token
    const accessToken = getAccessToken(request);

    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);

    if (!payload) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    // 2. Fetch user from database to confirm roles
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userRoles = user.roles as string[];
    const hasAccess =
      userRoles.includes("admin") || userRoles.includes("annotator");

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Forbidden: insufficient role" },
        { status: 403 }
      );
    }

    // 3. Generate new tokens
    const newAccessToken = await generateAccessToken(
      user.id,
      user.email,
      userRoles,
      user.firstName || undefined,
      user.lastName || undefined
    );

    const newRefreshToken = generateRefreshToken();
    await createRefreshToken(user.id, newRefreshToken);

    // 4. Build redirect response
    const response = NextResponse.redirect(ANNOTATION_PLATFORM_URL);

    // Cookie options scoped to the parent domain (.moodio.art)
    const parentCookieBase = {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
      domain: PARENT_COOKIE_DOMAIN,
    };

    // Clear old app-scoped cookies (no domain = current host only)
    response.cookies.set(siteConfig.auth.accessToken.cookieName, "", {
      ...siteConfig.auth.cookie,
      maxAge: 0,
    });
    response.cookies.set(siteConfig.auth.refreshToken.cookieName, "", {
      ...siteConfig.auth.cookie,
      maxAge: 0,
    });

    // Set new cookies at the parent domain level
    response.cookies.set(siteConfig.auth.accessToken.cookieName, newAccessToken, {
      ...parentCookieBase,
      maxAge: siteConfig.auth.accessToken.maxAge,
    });
    response.cookies.set(
      siteConfig.auth.refreshToken.cookieName,
      newRefreshToken,
      {
        ...parentCookieBase,
        maxAge: siteConfig.auth.refreshToken.maxAge,
      }
    );

    return response;
  } catch (error) {
    console.error("Error in annotation-redirect:", error);
    return NextResponse.json(
      { error: "Failed to process annotation redirect" },
      { status: 500 }
    );
  }
}
