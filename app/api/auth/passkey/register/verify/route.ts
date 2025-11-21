import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getAuthChallenge, savePasskey, deleteAuthChallenge } from "@/lib/auth/passkeys";

export async function POST(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const payload = await verifyAccessToken(accessToken);
    if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    
    // Decode clientDataJSON to extract challenge
    // clientDataJSON is base64url encoded
    const clientDataJSON = body.response.clientDataJSON;
    const clientDataStr = Buffer.from(clientDataJSON, 'base64url').toString('utf-8');
    const clientData = JSON.parse(clientDataStr);
    const challenge = clientData.challenge;
    
    const challengeRecord = await getAuthChallenge(challenge);
    
    if (!challengeRecord || challengeRecord.userId !== payload.userId) {
      return NextResponse.json({ error: "Invalid or expired challenge" }, { status: 400 });
    }

    const rpID = request.nextUrl.hostname;
    const origin = request.headers.get("origin") || `http://${request.headers.get("host")}`;

    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: challengeRecord.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (verification.verified && verification.registrationInfo) {
      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
      
      // Save passkey
      await savePasskey({
        userId: payload.userId,
        credentialId: credential.id, 
        publicKey: Buffer.from(credential.publicKey).toString('base64'),
        counter: Number(credential.counter),
        transports: body.response.transports ? JSON.stringify(body.response.transports) : undefined,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
      });

      await deleteAuthChallenge(challengeRecord.challenge);

      return NextResponse.json({ verified: true });
    }
    
    return NextResponse.json({ verified: false, error: "Verification failed" }, { status: 400 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

