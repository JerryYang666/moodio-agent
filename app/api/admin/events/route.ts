import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { desc, eq, count } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload || !payload.roles?.includes("admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const eventType = searchParams.get("type");

    const offset = (page - 1) * limit;

    const dataPromise = eventType
      ? db
          .select()
          .from(events)
          .where(eq(events.eventType, eventType))
          .orderBy(desc(events.timestamp))
          .limit(limit)
          .offset(offset)
      : db
          .select()
          .from(events)
          .orderBy(desc(events.timestamp))
          .limit(limit)
          .offset(offset);

    const countPromise = eventType
      ? db
          .select({ count: count() })
          .from(events)
          .where(eq(events.eventType, eventType))
      : db.select({ count: count() }).from(events);

    const [data, totalResult] = await Promise.all([dataPromise, countPromise]);

    const total = totalResult[0].count;
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (error) {
    console.error("Failed to fetch events:", error);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 }
    );
  }
}
