import { db } from "@/lib/db";
import { desktops, desktopShares } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  PERMISSION_OWNER,
  type PermissionOrNull,
  type SharePermission,
} from "@/lib/permissions";

export async function getDesktopPermission(
  desktopId: string,
  userId: string
): Promise<PermissionOrNull> {
  const [desktop] = await db
    .select()
    .from(desktops)
    .where(and(eq(desktops.id, desktopId), eq(desktops.userId, userId)))
    .limit(1);

  if (desktop) {
    return PERMISSION_OWNER;
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
    return share.permission as SharePermission;
  }

  return null;
}
