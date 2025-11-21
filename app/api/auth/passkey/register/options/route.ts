import { generateRegistrationOptions } from "@simplewebauthn/server";
import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getUserPasskeys, saveAuthChallenge, rpName } from "@/lib/auth/passkeys";

export async function POST(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const payload = await verifyAccessToken(accessToken);
    if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const userPasskeys = await getUserPasskeys(user.id);

    const rpID = request.nextUrl.hostname;
    
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: new TextEncoder().encode(user.id),
      userName: user.email,
      // Don't allow user to register same authenticator twice
      excludeCredentials: userPasskeys.map(passkey => ({
        id: passkey.credentialId,
        // transports: passkey.transports ? JSON.parse(passkey.transports) : undefined,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform', 
      },
    });

    await saveAuthChallenge(options.challenge, user.id);

    return NextResponse.json(options);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

