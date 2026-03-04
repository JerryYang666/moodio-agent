import { db } from "@/lib/db";
import { projects, projectShares } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export type ProjectPermission = "owner" | "collaborator" | "viewer" | null;

/**
 * Check user's permission for a project
 */
export async function getProjectPermission(
  projectId: string,
  userId: string
): Promise<ProjectPermission> {
  // Check if user owns the project
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);

  if (project) {
    return "owner";
  }

  // Check if project is shared with user
  const [share] = await db
    .select()
    .from(projectShares)
    .where(
      and(
        eq(projectShares.projectId, projectId),
        eq(projectShares.sharedWithUserId, userId)
      )
    )
    .limit(1);

  if (share) {
    return share.permission as "collaborator" | "viewer";
  }

  return null;
}

/**
 * Check if user has write permission (owner or collaborator)
 */
export function hasProjectWritePermission(permission: ProjectPermission): boolean {
  return permission === "owner" || permission === "collaborator";
}
