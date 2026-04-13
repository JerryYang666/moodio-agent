import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { userFeedback } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await request.json();
    const { entityType, entityId, feedback } = body;

    if (
      !entityType ||
      typeof entityType !== "string" ||
      !entityId ||
      typeof entityId !== "string"
    ) {
      return NextResponse.json(
        { error: "entityType and entityId are required" },
        { status: 400 }
      );
    }

    if (!feedback || typeof feedback !== "object") {
      return NextResponse.json(
        { error: "feedback object is required" },
        { status: 400 }
      );
    }

    if (
      feedback.thumbs !== undefined &&
      feedback.thumbs !== "up" &&
      feedback.thumbs !== "down"
    ) {
      return NextResponse.json(
        { error: 'feedback.thumbs must be "up" or "down"' },
        { status: 400 }
      );
    }

    if (
      feedback.comment !== undefined &&
      (typeof feedback.comment !== "string" || feedback.comment.length > 1000)
    ) {
      return NextResponse.json(
        { error: "feedback.comment must be a string (max 1000 chars)" },
        { status: 400 }
      );
    }

    const [result] = await db
      .insert(userFeedback)
      .values({
        userId: payload.userId,
        entityType,
        entityId,
        feedback,
      })
      .onConflictDoUpdate({
        target: [
          userFeedback.userId,
          userFeedback.entityType,
          userFeedback.entityId,
        ],
        set: {
          feedback,
          updatedAt: new Date(),
        },
      })
      .returning({ id: userFeedback.id });

    return NextResponse.json({ success: true, id: result.id });
  } catch (error) {
    console.error("Error saving feedback:", error);
    return NextResponse.json(
      { error: "Failed to save feedback" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await request.json();
    const { entityType, entityId } = body;

    if (!entityType || !entityId) {
      return NextResponse.json(
        { error: "entityType and entityId are required" },
        { status: 400 }
      );
    }

    await db
      .delete(userFeedback)
      .where(
        and(
          eq(userFeedback.userId, payload.userId),
          eq(userFeedback.entityType, entityType),
          eq(userFeedback.entityId, entityId)
        )
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting feedback:", error);
    return NextResponse.json(
      { error: "Failed to delete feedback" },
      { status: 500 }
    );
  }
}
