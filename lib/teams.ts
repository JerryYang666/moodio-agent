import { db } from "@/lib/db";
import {
  teams,
  teamMembers,
  teamCredits,
  teamInvitations,
  users,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { TeamMembership } from "@/lib/auth/jwt";

type DbOrTx = typeof db | any;

export type TeamRole = "owner" | "admin" | "member";

const ROLE_HIERARCHY: Record<TeamRole, number> = {
  owner: 3,
  admin: 2,
  member: 1,
};

/**
 * Lightweight query for JWT embedding.
 * Returns [{id, name, role}] for all teams a user belongs to.
 */
export async function getUserTeamMemberships(
  userId: string,
  tx: DbOrTx = db
): Promise<TeamMembership[]> {
  const rows = await tx
    .select({
      id: teams.id,
      name: teams.name,
      role: teamMembers.role,
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(eq(teamMembers.userId, userId));

  return rows.map((r: { id: string; name: string; role: string }) => ({
    id: r.id,
    name: r.name,
    role: r.role as TeamMembership["role"],
  }));
}

/**
 * Get all teams a user belongs to, with full team info and member's role.
 */
export async function getUserTeams(userId: string, tx: DbOrTx = db) {
  const rows = await tx
    .select({
      teamId: teams.id,
      teamName: teams.name,
      ownerId: teams.ownerId,
      role: teamMembers.role,
      createdAt: teams.createdAt,
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(eq(teamMembers.userId, userId));

  return rows;
}

/**
 * Get full team details with all members.
 */
export async function getTeamWithMembers(teamId: string, tx: DbOrTx = db) {
  const team = await tx
    .select()
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  if (team.length === 0) return null;

  const members = await tx
    .select({
      id: teamMembers.id,
      userId: teamMembers.userId,
      role: teamMembers.role,
      tag: teamMembers.tag,
      joinedAt: teamMembers.joinedAt,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamId));

  const pendingInvites = await tx
    .select()
    .from(teamInvitations)
    .where(
      and(
        eq(teamInvitations.teamId, teamId),
        eq(teamInvitations.status, "pending")
      )
    );

  const [credits] = await tx
    .select()
    .from(teamCredits)
    .where(eq(teamCredits.teamId, teamId));

  return {
    ...team[0],
    members,
    pendingInvitations: pendingInvites,
    balance: credits?.balance ?? 0,
  };
}

/**
 * Create a new team. The creator becomes the owner.
 */
export async function createTeam(userId: string, name: string) {
  return await db.transaction(async (tx) => {
    const [team] = await tx
      .insert(teams)
      .values({ name, ownerId: userId })
      .returning();

    await tx.insert(teamMembers).values({
      teamId: team.id,
      userId,
      role: "owner",
    });

    await tx.insert(teamCredits).values({
      teamId: team.id,
      balance: 0,
    });

    return team;
  });
}

/**
 * Get the requester's role in a team, or null if not a member.
 */
export async function getMemberRole(
  teamId: string,
  userId: string,
  tx: DbOrTx = db
): Promise<TeamRole | null> {
  const [row] = await tx
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(
      and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId))
    );
  return (row?.role as TeamRole) ?? null;
}

/**
 * Invite a user by email to a team. Only owner/admin can invite.
 */
export async function inviteMember(
  teamId: string,
  email: string,
  invitedBy: string
) {
  const role = await getMemberRole(teamId, invitedBy);
  if (!role || ROLE_HIERARCHY[role] < ROLE_HIERARCHY.admin) {
    throw new Error("Only team owner or admin can invite members");
  }

  const existingUser = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser.length > 0) {
    const existingMember = await db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, existingUser[0].id)
        )
      );
    if (existingMember.length > 0) {
      throw new Error("User is already a member of this team");
    }
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const [invitation] = await db
    .insert(teamInvitations)
    .values({
      teamId,
      email,
      invitedBy,
      token,
      expiresAt,
    })
    .returning();

  return invitation;
}

/**
 * Accept an invitation by token. The accepting user must be logged in.
 */
export async function acceptInvitation(token: string, userId: string) {
  return await db.transaction(async (tx) => {
    const [invitation] = await tx
      .select()
      .from(teamInvitations)
      .where(
        and(
          eq(teamInvitations.token, token),
          eq(teamInvitations.status, "pending")
        )
      );

    if (!invitation) throw new Error("Invitation not found or already used");
    if (new Date() > invitation.expiresAt) {
      await tx
        .update(teamInvitations)
        .set({ status: "expired" })
        .where(eq(teamInvitations.id, invitation.id));
      throw new Error("Invitation has expired");
    }

    const user = await tx
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user.length) throw new Error("User not found");
    if (user[0].email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw new Error(
        "This invitation was sent to a different email address"
      );
    }

    const existingMember = await tx
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, invitation.teamId),
          eq(teamMembers.userId, userId)
        )
      );

    if (existingMember.length > 0) {
      await tx
        .update(teamInvitations)
        .set({ status: "accepted" })
        .where(eq(teamInvitations.id, invitation.id));
      return { teamId: invitation.teamId, alreadyMember: true };
    }

    await tx.insert(teamMembers).values({
      teamId: invitation.teamId,
      userId,
      role: "member",
    });

    await tx
      .update(teamInvitations)
      .set({ status: "accepted" })
      .where(eq(teamInvitations.id, invitation.id));

    return { teamId: invitation.teamId, alreadyMember: false };
  });
}

/**
 * Remove a member from a team. Owner can remove anyone; admin can remove members.
 */
export async function removeMember(
  teamId: string,
  targetUserId: string,
  requestedBy: string
) {
  const requesterRole = await getMemberRole(teamId, requestedBy);
  if (!requesterRole || ROLE_HIERARCHY[requesterRole] < ROLE_HIERARCHY.admin) {
    throw new Error("Only team owner or admin can remove members");
  }

  const targetRole = await getMemberRole(teamId, targetUserId);
  if (!targetRole) throw new Error("Target user is not a member");

  if (targetRole === "owner") {
    throw new Error("Cannot remove the team owner");
  }
  if (
    requesterRole === "admin" &&
    ROLE_HIERARCHY[targetRole] >= ROLE_HIERARCHY.admin
  ) {
    throw new Error("Admins can only remove members, not other admins");
  }

  await db
    .delete(teamMembers)
    .where(
      and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId))
    );
}

/**
 * Change a member's role within a team. Respects role hierarchy.
 */
export async function updateMemberRole(
  teamId: string,
  targetUserId: string,
  newRole: TeamRole,
  requestedBy: string
) {
  const requesterRole = await getMemberRole(teamId, requestedBy);
  if (!requesterRole || ROLE_HIERARCHY[requesterRole] < ROLE_HIERARCHY.admin) {
    throw new Error("Only team owner or admin can change roles");
  }

  const targetRole = await getMemberRole(teamId, targetUserId);
  if (!targetRole) throw new Error("Target user is not a member");

  if (targetRole === "owner") {
    throw new Error("Cannot change the owner's role");
  }

  if (newRole === "owner") {
    throw new Error("Cannot promote to owner");
  }

  if (
    requesterRole === "admin" &&
    ROLE_HIERARCHY[targetRole] >= ROLE_HIERARCHY.admin
  ) {
    throw new Error("Admins can only modify members, not other admins");
  }

  await db
    .update(teamMembers)
    .set({ role: newRole })
    .where(
      and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId))
    );
}

/**
 * Delete a team entirely. Only the owner can do this.
 */
export async function deleteTeam(teamId: string, requestedBy: string) {
  const role = await getMemberRole(teamId, requestedBy);
  if (role !== "owner") {
    throw new Error("Only the team owner can delete the team");
  }

  await db.delete(teams).where(eq(teams.id, teamId));
}

/**
 * Cancel a pending invitation. Only owner/admin can cancel.
 */
export async function cancelInvitation(
  invitationId: string,
  teamId: string,
  requestedBy: string
) {
  const role = await getMemberRole(teamId, requestedBy);
  if (!role || ROLE_HIERARCHY[role] < ROLE_HIERARCHY.admin) {
    throw new Error("Only team owner or admin can cancel invitations");
  }

  const [invitation] = await db
    .select()
    .from(teamInvitations)
    .where(
      and(
        eq(teamInvitations.id, invitationId),
        eq(teamInvitations.teamId, teamId),
        eq(teamInvitations.status, "pending")
      )
    );

  if (!invitation) throw new Error("Invitation not found or already resolved");

  await db
    .update(teamInvitations)
    .set({ status: "cancelled" })
    .where(eq(teamInvitations.id, invitationId));
}

/**
 * Update team name. Owner or admin only.
 */
export async function updateTeamName(
  teamId: string,
  name: string,
  requestedBy: string
) {
  const role = await getMemberRole(teamId, requestedBy);
  if (!role || ROLE_HIERARCHY[role] < ROLE_HIERARCHY.admin) {
    throw new Error("Only team owner or admin can update the team name");
  }

  const [updated] = await db
    .update(teams)
    .set({ name, updatedAt: new Date() })
    .where(eq(teams.id, teamId))
    .returning();

  return updated;
}

/**
 * Get team members only (lightweight, no invitations/credits).
 * Any team member can call this.
 */
export async function getTeamMembersLightweight(
  teamId: string,
  tx: DbOrTx = db
) {
  return tx
    .select({
      id: teamMembers.id,
      userId: teamMembers.userId,
      role: teamMembers.role,
      tag: teamMembers.tag,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamId));
}

/**
 * Update a member's tag. Only owner/admin can do this.
 * Pass null or empty string to clear.
 */
export async function updateMemberTag(
  teamId: string,
  targetUserId: string,
  tag: string | null,
  requestedBy: string
) {
  const requesterRole = await getMemberRole(teamId, requestedBy);
  if (!requesterRole || ROLE_HIERARCHY[requesterRole] < ROLE_HIERARCHY.admin) {
    throw new Error("Only team owner or admin can update member tags");
  }

  const targetRole = await getMemberRole(teamId, targetUserId);
  if (!targetRole) throw new Error("Target user is not a member");

  const sanitized = tag && tag.trim().length > 0 ? tag.trim().slice(0, 50) : null;

  await db
    .update(teamMembers)
    .set({ tag: sanitized })
    .where(
      and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId))
    );
}
