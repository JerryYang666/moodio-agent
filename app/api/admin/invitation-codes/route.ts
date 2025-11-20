import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { invitationCodes } from "@/lib/db/schema";
import { customAlphabet } from "nanoid";

// Create a custom nanoid generator for the code
// 6 characters, uppercase letters and numbers
const generateCode = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 6);

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const payload = await verifyAccessToken(accessToken);
    if (!payload || !payload.roles?.includes("admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { count = 1 } = body;
    const numCount = Math.max(1, Math.min(100, parseInt(count))); // Limit to 1-100 codes at once

    const codesToInsert: { code: string; createdBy: string }[] = [];
    
    for (let i = 0; i < numCount; i++) {
      codesToInsert.push({
        code: generateCode(),
        createdBy: payload.userId,
      });
    }

    // Bulk insert
    const result = await db.insert(invitationCodes).values(codesToInsert).returning();

    return NextResponse.json({
      success: true,
      codes: result,
    });

  } catch (error) {
    console.error("Error in invitation-codes:", error);
    return NextResponse.json({ error: "Failed to generate codes" }, { status: 500 });
  }
}

