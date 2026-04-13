import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { userFeedback, users } from "@/lib/db/schema";
import { desc, eq, and, count, like } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload || !payload.roles?.includes("admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const entityType = searchParams.get("entityType");
    const thumbs = searchParams.get("thumbs");
    const userId = searchParams.get("userId");

    const offset = (page - 1) * limit;

    const conditions = [];
    if (entityType) conditions.push(eq(userFeedback.entityType, entityType));
    if (userId) conditions.push(eq(userFeedback.userId, userId));
    if (thumbs) {
      conditions.push(
        like(userFeedback.feedback, `%"thumbs":"${thumbs}"%`)
      );
    }

    const whereClause =
      conditions.length > 0 ? and(...conditions) : undefined;

    const dataPromise = db
      .select({
        id: userFeedback.id,
        userId: userFeedback.userId,
        entityType: userFeedback.entityType,
        entityId: userFeedback.entityId,
        feedback: userFeedback.feedback,
        createdAt: userFeedback.createdAt,
        updatedAt: userFeedback.updatedAt,
        userEmail: users.email,
        userFirstName: users.firstName,
        userLastName: users.lastName,
      })
      .from(userFeedback)
      .leftJoin(users, eq(userFeedback.userId, users.id))
      .orderBy(desc(userFeedback.updatedAt))
      .$dynamic();

    const countQuery = db
      .select({ count: count() })
      .from(userFeedback)
      .$dynamic();

    const dataWithWhere = whereClause
      ? dataPromise.where(whereClause)
      : dataPromise;
    const countWithWhere = whereClause
      ? countQuery.where(whereClause)
      : countQuery;

    const [data, totalResult] = await Promise.all([
      dataWithWhere.limit(limit).offset(offset),
      countWithWhere,
    ]);

    const total = totalResult[0].count;
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      data,
      pagination: { page, limit, total, totalPages },
    });
  } catch (error) {
    console.error("Error fetching admin feedback:", error);
    return NextResponse.json(
      { error: "Failed to fetch feedback" },
      { status: 500 }
    );
  }
}
