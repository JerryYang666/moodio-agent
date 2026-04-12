import { createApi } from "@reduxjs/toolkit/query/react";
import { createBaseQueryWithReauth } from "./base-query";
import type { FeatureFlagsResponse } from "@/lib/feature-flags/types";
import type { UserSettingsResponse, UserSettings } from "@/lib/user-settings/types";
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

// Types for active account
export interface SetActiveAccountRequest {
  accountType: "personal" | "team";
  accountId: string | null;
}

// Types for teams
export interface TeamMemberItem {
  id: string;
  userId: string;
  role: string;
  tag: string | null;
  joinedAt: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface TeamMemberLightItem {
  id: string;
  userId: string;
  role: string;
  tag: string | null;
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

// Types for folders
export interface FolderItem {
  id: string;
  collectionId: string;
  parentId: string | null;
  userId: string;
  name: string;
  path: string;
  depth: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface FolderDetailResponse {
  folder: FolderItem & { permission: string; isOwner: boolean };
  collection: { id: string; name: string; projectId: string } | null;
  childFolders: FolderItem[];
  images: unknown[];
  shares: unknown[];
}

export interface FolderBreadcrumbsResponse {
  projectId: string;
  breadcrumbs: Array<{ id: string; name: string; type: "collection" | "folder" }>;
}

export interface FolderTreeItem {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
}

export interface SharedFolderItem {
  id: string;
  name: string;
  collectionId: string;
  collectionName: string;
  permission: string;
  sharedAt: string;
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
  tagTypes: ["FeatureFlags", "Credits", "Collections", "PersistentAssets", "Teams", "Folders", "UserSettings"],

  endpoints: (builder) => ({
    getFeatureFlags: builder.query<FeatureFlagsResponse, void>({
      query: () => "/api/users/feature-flags",
      keepUnusedDataFor: 300,
      providesTags: ["FeatureFlags"],
    }),

    getUserSettings: builder.query<UserSettingsResponse, void>({
      query: () => "/api/users/settings",
      keepUnusedDataFor: 3600,
      providesTags: ["UserSettings"],
    }),

    updateUserSettings: builder.mutation<UserSettingsResponse, Partial<UserSettings>>({
      query: (body) => ({
        url: "/api/users/settings",
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["UserSettings"],
    }),

    setActiveAccount: builder.mutation<void, SetActiveAccountRequest>({
      query: (body) => ({
        url: "/api/users/active-account",
        method: "PUT",
        body,
      }),
      invalidatesTags: ["Credits"],
    }),

    getCreditsBalance: builder.query<CreditsBalanceResponse, void>({
      query: () => "/api/users/credits/balance",
      providesTags: ["Credits"],
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

    updateMemberRole: builder.mutation<void, { teamId: string; memberId: string; role?: string; tag?: string | null }>({
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

    getTeamMembers: builder.query<TeamMemberLightItem[], string>({
      query: (teamId) => `/api/teams/${teamId}/members`,
      transformResponse: (response: { members: TeamMemberLightItem[] }) =>
        response.members ?? [],
      providesTags: (_result, _error, teamId) => [{ type: "Teams", id: `members-${teamId}` }],
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

    // Folder endpoints
    getFolders: builder.query<FolderItem[], { collectionId: string; parentId?: string }>({
      query: ({ collectionId, parentId }) => {
        const params = parentId ? `?parentId=${parentId}` : "";
        return `/api/collection/${collectionId}/folders${params}`;
      },
      transformResponse: (response: { folders: FolderItem[] }) =>
        response.folders ?? [],
      providesTags: (_result, _error, { collectionId }) => [
        { type: "Folders", id: collectionId },
      ],
    }),

    createFolder: builder.mutation<
      FolderItem,
      { collectionId: string; name: string; parentId?: string }
    >({
      query: ({ collectionId, ...body }) => ({
        url: `/api/collection/${collectionId}/folders`,
        method: "POST",
        body,
      }),
      transformResponse: (response: { folder: FolderItem }) =>
        response.folder,
      invalidatesTags: ["Folders", "Collections"],
    }),

    getFolderDetail: builder.query<FolderDetailResponse, string>({
      query: (folderId) => `/api/folders/${folderId}`,
      providesTags: (_result, _error, folderId) => [
        { type: "Folders", id: folderId },
      ],
    }),

    renameFolder: builder.mutation<FolderItem, { folderId: string; name: string }>({
      query: ({ folderId, ...body }) => ({
        url: `/api/folders/${folderId}`,
        method: "PATCH",
        body,
      }),
      transformResponse: (response: { folder: FolderItem }) =>
        response.folder,
      invalidatesTags: ["Folders"],
    }),

    deleteFolder: builder.mutation<void, string>({
      query: (folderId) => ({
        url: `/api/folders/${folderId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Folders", "Collections"],
    }),

    moveFolder: builder.mutation<
      void,
      { folderId: string; targetFolderId?: string; targetCollectionId?: string }
    >({
      query: ({ folderId, ...body }) => ({
        url: `/api/folders/${folderId}/move`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["Folders", "Collections"],
    }),

    shareFolder: builder.mutation<
      void,
      { folderId: string; sharedWithUserId: string; permission: string }
    >({
      query: ({ folderId, ...body }) => ({
        url: `/api/folders/${folderId}/share`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { folderId }) => [
        { type: "Folders", id: folderId },
      ],
    }),

    revokeFolderShare: builder.mutation<void, { folderId: string; userId: string }>({
      query: ({ folderId, userId }) => ({
        url: `/api/folders/${folderId}/share/${userId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { folderId }) => [
        { type: "Folders", id: folderId },
      ],
    }),

    getFolderBreadcrumbs: builder.query<FolderBreadcrumbsResponse, string>({
      query: (folderId) => `/api/folders/${folderId}/breadcrumbs`,
    }),

    getFolderTree: builder.query<FolderTreeItem[], string>({
      query: (collectionId) => `/api/collection/${collectionId}/folders/tree`,
      transformResponse: (response: { folders: FolderTreeItem[] }) =>
        response.folders ?? [],
      providesTags: (_result, _error, collectionId) => [
        { type: "Folders", id: `tree-${collectionId}` },
      ],
    }),

    getSharedFolders: builder.query<SharedFolderItem[], void>({
      query: () => `/api/folders/shared`,
      transformResponse: (response: { folders: SharedFolderItem[] }) =>
        response.folders ?? [],
      providesTags: [{ type: "Folders", id: "shared" }],
    }),
  }),
});

export const {
  useGetFeatureFlagsQuery,
  useGetUserSettingsQuery,
  useUpdateUserSettingsMutation,
  useSetActiveAccountMutation,
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
  useGetTeamMembersQuery,
  useGetCollectionsQuery,
  useCreateCollectionMutation,
  useRenameCollectionMutation,
  useDeleteCollectionMutation,
  useGetPersistentAssetsQuery,
  useUpdatePersistentAssetsMutation,
  useGetFoldersQuery,
  useCreateFolderMutation,
  useGetFolderDetailQuery,
  useRenameFolderMutation,
  useDeleteFolderMutation,
  useMoveFolderMutation,
  useShareFolderMutation,
  useRevokeFolderShareMutation,
  useGetFolderBreadcrumbsQuery,
  useGetFolderTreeQuery,
  useGetSharedFoldersQuery,
} = nextApi;
