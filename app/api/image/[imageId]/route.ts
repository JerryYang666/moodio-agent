import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getSignedImageUrl } from "@/lib/storage/s3";

/**
 * GET /api/image/[imageId]
 * Returns a signed URL for an image
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  // Verify authentication
  const accessToken = getAccessToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = await verifyAccessToken(accessToken);
  if (!payload) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const { imageId } = await params;

  if (!imageId) {
    return NextResponse.json({ error: "Image ID required" }, { status: 400 });
  }

  try {
    const imageUrl = getSignedImageUrl(imageId);
    return NextResponse.json({ imageId, imageUrl });
  } catch (error) {
    console.error("[Image] Error getting signed URL:", error);
    return NextResponse.json(
      { error: "Failed to get image URL" },
      { status: 500 }
    );
  }
}
