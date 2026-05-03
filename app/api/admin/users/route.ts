import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { users, userCredits, subscriptions } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const payload = await verifyAccessToken(accessToken);
    if (!payload || !payload.roles?.includes("admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        roles: users.roles,
        testingGroups: users.testingGroups,
        authProvider: users.authProvider,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        credits: userCredits.balance,
        subscriptionStatus: subscriptions.status,
        subscriptionEnd: subscriptions.currentPeriodEnd,
        stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      })
      .from(users)
      .leftJoin(userCredits, eq(users.id, userCredits.userId))
      .leftJoin(subscriptions, eq(users.id, subscriptions.userId))
      .orderBy(desc(users.createdAt));

    const now = new Date();
    const usersWithCredits = allUsers.map((user) => {
      const hasStripeSubscription =
        !!user.stripeSubscriptionId &&
        !user.stripeSubscriptionId.startsWith("admin_grant_") &&
        user.subscriptionStatus !== "canceled" &&
        user.subscriptionStatus !== "incomplete_expired";
      const { stripeSubscriptionId: _sid, ...rest } = user;
      return {
        ...rest,
        credits: user.credits ?? 0,
        isProSubscriber:
          (user.subscriptionStatus === "active" ||
            user.subscriptionStatus === "trialing" ||
            user.subscriptionStatus === "admin_granted") &&
          user.subscriptionEnd != null &&
          new Date(user.subscriptionEnd) > now,
        subscriptionEnd: user.subscriptionEnd?.toISOString() ?? null,
        hasStripeSubscription,
      };
    });

    return NextResponse.json({ users: usersWithCredits });
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

