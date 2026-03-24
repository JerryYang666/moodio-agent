"use client";

import { useAuth } from "@/hooks/use-auth";
import { useGetUserTeamsQuery } from "@/lib/redux/services/next-api";

export function useTeams() {
  const { user } = useAuth();

  const { data: teams = [], isLoading, refetch } = useGetUserTeamsQuery(undefined, {
    skip: !user,
  });

  const isInAnyTeam = teams.length > 0;

  function getTeamRole(teamId: string) {
    return teams.find((t) => t.teamId === teamId)?.role ?? null;
  }

  function isOwnerOrAdmin(teamId: string) {
    const role = getTeamRole(teamId);
    return role === "owner" || role === "admin";
  }

  return {
    teams,
    isInAnyTeam,
    loading: isLoading,
    getTeamRole,
    isOwnerOrAdmin,
    refreshTeams: refetch,
  };
}
