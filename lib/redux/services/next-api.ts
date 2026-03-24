import { createApi } from "@reduxjs/toolkit/query/react";
import { createBaseQueryWithReauth } from "./base-query";
import type { FeatureFlagsResponse } from "@/lib/feature-flags/types";
import type { Permission } from "@/lib/permissions";
import type { PersistentAssets } from "@/lib/chat/persistent-assets-types";

// Types for persistent assets (with derived imageUrl for display)
export interface PersistentAssetsResponse {
  persistentAssets: PersistentAssets & {
    referenceImages: Array<PersistentAssets["referenceImages"][number] & { imageUrl?: string }>;
  };
}

export interface UpdatePersistentAssetsRequest {
  chatId: string;
  referenceImages: PersistentAssets["referenceImages"];
  textChunk: string;
}

// Types for credits
export interface CreditsBalanceResponse {
  balance: number;
  accountType: string;
  accountId: string;
}

export interface CreditsBalanceRequest {
  accountType?: "personal" | "team";
  accountId?: string;
}

// Types for teams
export interface TeamMemberItem {
  id: string;
  userId: string;
  role: string;
  joinedAt: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface TeamInvitationItem {
  id: string;
  email: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export interface TeamItem {
  teamId: string;
  teamName: string;
  ownerId: string;
  role: string;
  createdAt: string;
}

export interface TeamDetailsResponse {
  id: string;
  name: string;
  ownerId: string;
  members: TeamMemberItem[];
  pendingInvitations: TeamInvitationItem[];
  balance: number;
}

// Types for video generation
export interface GenerateVideoRequest {
  modelId?: string;
  sourceImageId: string | null;
  endImageId?: string | null;
  params: Record<string, unknown>;
}

export interface GenerateVideoResponse {
  success: boolean;
  generationId: string;
  providerRequestId: string;
  status: string;
}

export interface GenerateVideoError {
  error: string;
  cost?: number;
}

// Types for collection tags
export interface CollectionTagItem {
  id: string;
  label: string;
  color: string;
}

// Types for collections
export interface CollectionItem {
  id: string;
  userId: string;
  projectId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  permission: Permission;
  isOwner: boolean;
  sharedAt?: Date;
  coverImageUrl?: string | null;
  tags: CollectionTagItem[];
}

/**
 * Next.js API slice
 */
export const nextApi = createApi({
  reducerPath: "nextApi",
  baseQuery: createBaseQueryWithReauth(""),
  tagTypes: ["FeatureFlags", "Credits", "Collections", "PersistentAssets", "Teams"],

  endpoints: (builder) => ({
    getFeatureFlags: builder.query<FeatureFlagsResponse, void>({
      query: () => "/api/users/feature-flags",
      keepUnusedDataFor: 300,
      providesTags: ["FeatureFlags"],
    }),

    getCreditsBalance: builder.query<CreditsBalanceResponse, CreditsBalanceRequest | void>({
      query: (params) => {
        const searchParams = new URLSearchParams();
        if (params?.accountType) searchParams.set("accountType", params.accountType);
        if (params?.accountId) searchParams.set("accountId", params.accountId);
        const qs = searchParams.toString();
        return `/api/users/credits/balance${qs ? `?${qs}` : ""}`;
      },
      providesTags: (_result, _error, params) => [
        { type: "Credits", id: params?.accountType === "team" ? `team:${params?.accountId}` : "personal" },
      ],
    }),

    generateVideo: builder.mutation<GenerateVideoResponse, GenerateVideoRequest>({
      query: (body) => ({
        url: "/api/video/generate",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Credits"],
    }),

    // Teams endpoints
    getUserTeams: builder.query<TeamItem[], void>({
      query: () => "/api/teams",
      transformResponse: (response: { teams: TeamItem[] }) => response.teams ?? [],
      providesTags: ["Teams"],
    }),

    getTeamDetails: builder.query<TeamDetailsResponse, string>({
      query: (teamId) => `/api/teams/${teamId}`,
      transformResponse: (response: { team: TeamDetailsResponse }) => response.team,
      providesTags: (_result, _error, teamId) => [{ type: "Teams", id: teamId }],
    }),

    createTeam: builder.mutation<{ team: { id: string; name: string } }, { name: string }>({
      query: (body) => ({
        url: "/api/teams",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Teams"],
    }),

    updateTeam: builder.mutation<void, { teamId: string; name: string }>({
      query: ({ teamId, ...body }) => ({
        url: `/api/teams/${teamId}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Teams"],
    }),

    deleteTeam: builder.mutation<void, string>({
      query: (teamId) => ({
        url: `/api/teams/${teamId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Teams"],
    }),

    inviteTeamMember: builder.mutation<void, { teamId: string; email: string }>({
      query: ({ teamId, ...body }) => ({
        url: `/api/teams/${teamId}/invite`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { teamId }) => [{ type: "Teams", id: teamId }],
    }),

    cancelInvitation: builder.mutation<void, { teamId: string; invitationId: string }>({
      query: ({ teamId, invitationId }) => ({
        url: `/api/teams/${teamId}/invite/${invitationId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { teamId }) => [{ type: "Teams", id: teamId }],
    }),

    updateMemberRole: builder.mutation<void, { teamId: string; memberId: string; role: string }>({
      query: ({ teamId, memberId, ...body }) => ({
        url: `/api/teams/${teamId}/members/${memberId}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_result, _error, { teamId }) => [{ type: "Teams", id: teamId }],
    }),

    removeMember: builder.mutation<void, { teamId: string; memberId: string }>({
      query: ({ teamId, memberId }) => ({
        url: `/api/teams/${teamId}/members/${memberId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { teamId }) => [{ type: "Teams", id: teamId }],
    }),

    acceptInvitation: builder.mutation<{ teamId: string }, { token: string }>({
      query: (body) => ({
        url: "/api/teams/accept-invite",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Teams"],
    }),

    getCollections: builder.query<CollectionItem[], void>({
      query: () => "/api/collection",
      transformResponse: (response: { collections: CollectionItem[] }) =>
        response.collections ?? [],
      providesTags: ["Collections"],
      keepUnusedDataFor: 120,
    }),

    createCollection: builder.mutation<
      CollectionItem,
      { name: string; projectId?: string; tags?: { label: string; color: string }[] }
    >({
      query: (body) => ({
        url: "/api/collection",
        method: "POST",
        body,
      }),
      transformResponse: (response: { collection: CollectionItem }) =>
        response.collection,
      invalidatesTags: ["Collections"],
    }),

    renameCollection: builder.mutation<
      CollectionItem,
      { collectionId: string; name?: string; tags?: { label: string; color: string }[] }
    >({
      query: ({ collectionId, ...body }) => ({
        url: `/api/collection/${collectionId}`,
        method: "PATCH",
        body,
      }),
      transformResponse: (response: { collection: CollectionItem }) =>
        response.collection,
      invalidatesTags: ["Collections"],
    }),

    deleteCollection: builder.mutation<void, string>({
      query: (collectionId) => ({
        url: `/api/collection/${collectionId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Collections"],
    }),

    getPersistentAssets: builder.query<PersistentAssetsResponse, string>({
      query: (chatId) => `/api/chat/${chatId}/persistent-assets`,
      providesTags: (_result, _error, chatId) => [
        { type: "PersistentAssets", id: chatId },
      ],
    }),

    updatePersistentAssets: builder.mutation<
      PersistentAssetsResponse,
      UpdatePersistentAssetsRequest
    >({
      query: ({ chatId, ...body }) => ({
        url: `/api/chat/${chatId}/persistent-assets`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_result, _error, { chatId }) => [
        { type: "PersistentAssets", id: chatId },
      ],
    }),
  }),
});

export const {
  useGetFeatureFlagsQuery,
  useGetCreditsBalanceQuery,
  useGenerateVideoMutation,
  useGetUserTeamsQuery,
  useGetTeamDetailsQuery,
  useCreateTeamMutation,
  useUpdateTeamMutation,
  useDeleteTeamMutation,
  useInviteTeamMemberMutation,
  useCancelInvitationMutation,
  useUpdateMemberRoleMutation,
  useRemoveMemberMutation,
  useAcceptInvitationMutation,
  useGetCollectionsQuery,
  useCreateCollectionMutation,
  useRenameCollectionMutation,
  useDeleteCollectionMutation,
  useGetPersistentAssetsQuery,
  useUpdatePersistentAssetsMutation,
} = nextApi;
