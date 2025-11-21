import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getUserPasskeys, saveAuthChallenge } from "@/lib/auth/passkeys";

export async function POST(request: NextRequest) {
  try {
    // Optional: email provided?
    let body = {};
    try {
      body = await request.json();
    } catch (e) {}
    
    const { email } = body as { email?: string };
    
    let userPasskeys: any[] = [];
    let user = null;

    if (email) {
      [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (user) {
        userPasskeys = await getUserPasskeys(user.id);
      }
    }

    const rpID = request.nextUrl.hostname;
    
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: userPasskeys.map(passkey => ({
        id: passkey.credentialId,
        transports: passkey.transports ? JSON.parse(passkey.transports) : undefined,
      })),
      userVerification: 'preferred',
    });

    // Save challenge. If we don't know the user yet, userId is null.
    await saveAuthChallenge(options.challenge, user ? user.id : undefined);

    return NextResponse.json(options);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

