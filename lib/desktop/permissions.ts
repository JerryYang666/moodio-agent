import { db } from "@/lib/db";
import { desktops, desktopShares } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function getDesktopPermission(
  desktopId: string,
  userId: string
): Promise<"owner" | "collaborator" | "viewer" | null> {
  const [desktop] = await db
    .select()
    .from(desktops)
    .where(and(eq(desktops.id, desktopId), eq(desktops.userId, userId)))
    .limit(1);

  if (desktop) {
    return "owner";
  }

  const [share] = await db
    .select()
    .from(desktopShares)
    .where(
      and(
        eq(desktopShares.desktopId, desktopId),
        eq(desktopShares.sharedWithUserId, userId)
      )
    )
    .limit(1);

  if (share) {
    return share.permission as "collaborator" | "viewer";
  }

  return null;
}
