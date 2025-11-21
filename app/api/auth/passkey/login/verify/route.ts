import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { NextRequest, NextResponse } from "next/server";
import { getAuthChallenge, deleteAuthChallenge, getPasskeyByCredentialId, updatePasskeyCounter } from "@/lib/auth/passkeys";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateAccessToken } from "@/lib/auth/jwt";
import { generateRefreshToken, createRefreshToken } from "@/lib/auth/tokens";
import { setAuthCookies } from "@/lib/auth/cookies";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, response } = body;

    // Extract challenge
    const clientDataJSON = response.clientDataJSON;
    const clientDataStr = Buffer.from(clientDataJSON, 'base64url').toString('utf-8');
    const clientData = JSON.parse(clientDataStr);
    const challenge = clientData.challenge;

    const challengeRecord = await getAuthChallenge(challenge);
    
    if (!challengeRecord) {
       return NextResponse.json({ error: "Invalid or expired challenge" }, { status: 400 });
    }

    const passkey = await getPasskeyByCredentialId(id);
    if (!passkey) {
      return NextResponse.json({ error: "Passkey not found" }, { status: 400 });
    }
    
    // Check if challenge was meant for this user (if we knew the user)
    if (challengeRecord.userId && challengeRecord.userId !== passkey.userId) {
       return NextResponse.json({ error: "Challenge mismatch" }, { status: 400 });
    }

    const [user] = await db.select().from(users).where(eq(users.id, passkey.userId)).limit(1);
    if (!user) {
       return NextResponse.json({ error: "User not found" }, { status: 400 });
    }

    const rpID = request.nextUrl.hostname;
    const origin = request.headers.get("origin") || `http://${request.headers.get("host")}`;

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: challengeRecord.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator: {
        credentialID: passkey.credentialId,
        credentialPublicKey: Buffer.from(passkey.publicKey, 'base64'), // stored as base64
        counter: Number(passkey.counter),
        transports: passkey.transports ? JSON.parse(passkey.transports) : undefined,
      },
    });

    if (verification.verified) {
       const { newCounter } = verification.authenticationInfo;
       
       await updatePasskeyCounter(passkey.id, newCounter);
       await deleteAuthChallenge(challengeRecord.challenge);
       
       // Generate tokens
       const accessToken = await generateAccessToken(
         user.id,
         user.email,
         user.roles as string[],
         user.firstName || undefined,
         user.lastName || undefined
       );

       const refreshToken = generateRefreshToken();
       await createRefreshToken(user.id, refreshToken);
       
       const res = NextResponse.json({ verified: true });
       return setAuthCookies(res, accessToken, refreshToken);
    }

    return NextResponse.json({ verified: false, error: "Verification failed" }, { status: 400 });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

