"use client";

import React, { createContext, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { addToast } from "@heroui/toast";
import { type SharePermission } from "@/lib/permissions";
import {
  useGetCollectionsQuery,
  useCreateCollectionMutation,
  useRenameCollectionMutation,
  useDeleteCollectionMutation,
  nextApi,
} from "@/lib/redux/services/next-api";
import type { CollectionItem } from "@/lib/redux/services/next-api";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "@/lib/redux/store";

export const ASSETS_UPDATED_EVENT = "moodio-assets-updated";

export type Collection = CollectionItem;

export interface CollectionImage {
  id: string;
  projectId: string;
  collectionId: string | null;
  imageId: string;
  assetId: string;
  assetType: "image" | "video" | "public_video" | "public_image";
  chatId: string | null;
  generationDetails: {
    title: string;
    prompt: string;
    status: "loading" | "generated" | "error" | "pending" | "processing" | "completed" | "failed";
    imageUrl?: string;
    videoUrl?: string;
    source?: "browse";
    storageKey?: string;
  };
  addedAt: Date;
}

export interface CollectionShare {
  id: string;
  collectionId: string;
  sharedWithUserId: string;
  permission: SharePermission;
  sharedAt: Date;
}

interface CollectionsContextValue {
  collections: Collection[];
  loading: boolean;
  error: string;
  refreshCollections: () => Promise<void>;
  createCollection: (name: string, projectId?: string, tags?: { label: string; color: string }[]) => Promise<Collection | null>;
  renameCollection: (collectionId: string, name: string) => Promise<boolean>;
  updateCollectionTags: (collectionId: string, tags: { label: string; color: string }[]) => Promise<boolean>;
  deleteCollection: (collectionId: string) => Promise<boolean>;
  addImageToCollection: (
    collectionId: string,
    imageId: string,
    chatId: string | null,
    generationDetails: any
  ) => Promise<boolean>;
  addVideoToCollection: (
    collectionId: string,
    thumbnailImageId: string,
    videoId: string,
    generationDetails: any
  ) => Promise<boolean>;
  addPublicVideoToCollection: (
    collectionId: string,
    storageKey: string,
    contentUuid: string,
    title: string
  ) => Promise<boolean>;
  addPublicImageToCollection: (
    collectionId: string,
    storageKey: string,
    contentUuid: string,
    title: string
  ) => Promise<boolean>;
  removeItemFromCollection: (
    collectionId: string,
    itemId: string
  ) => Promise<boolean>;
  shareCollection: (
    collectionId: string,
    userId: string,
    permission: SharePermission
  ) => Promise<boolean>;
  removeShare: (collectionId: string, userId: string) => Promise<boolean>;
  getDefaultCollectionName: () => string;
}

export const CollectionsContext = createContext<
  CollectionsContextValue | undefined
>(undefined);

export function CollectionsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const dispatch = useDispatch<AppDispatch>();

  const {
    data: collections = [],
    isLoading,
    error: queryError,
    refetch,
  } = useGetCollectionsQuery(undefined, { skip: !user });

  const [createCollectionMutation] = useCreateCollectionMutation();
  const [renameCollectionMutation] = useRenameCollectionMutation();
  const [deleteCollectionMutation] = useDeleteCollectionMutation();

  const invalidateCollections = useCallback(() => {
    dispatch(nextApi.util.invalidateTags(["Collections"]));
  }, [dispatch]);

  const loading = isLoading;
  const error = queryError
    ? "status" in queryError
      ? "Failed to fetch collections"
      : queryError.message ?? ""
    : "";

  const getDefaultCollectionName = useCallback(() => {
    if (!user) return "My Collection";

    let baseName = "";
    if (user.firstName) {
      baseName = user.firstName.length > 32
        ? user.firstName.substring(0, 32)
        : user.firstName;
    } else {
      const emailPrefix = user.email.split("@")[0];
      baseName = emailPrefix.length > 32
        ? emailPrefix.substring(0, 32)
        : emailPrefix;
    }

    return `${baseName}'s Collection`;
  }, [user]);

  const refreshCollections = useCallback(async () => {
    if (!user) return;
    refetch();
  }, [user, refetch]);

  const createCollection = useCallback(
    async (name: string, projectId?: string, tags?: { label: string; color: string }[]) => {
      try {
        const payload: { name: string; projectId?: string; tags?: { label: string; color: string }[] } = { name };
        if (projectId) payload.projectId = projectId;
        if (tags && tags.length > 0) payload.tags = tags;
        const result = await createCollectionMutation(payload).unwrap();
        return result;
      } catch (err) {
        console.error("Error creating collection:", err);
        return null;
      }
    },
    [createCollectionMutation]
  );

  const renameCollection = useCallback(
    async (collectionId: string, name: string) => {
      try {
        await renameCollectionMutation({ collectionId, name }).unwrap();
        addToast({
          title: "Collection renamed",
          description: "The collection has been renamed successfully",
          color: "success",
        });
        return true;
      } catch (err) {
        console.error("Error renaming collection:", err);
        addToast({
          title: "Error",
          description: "Failed to rename collection",
          color: "danger",
        });
        return false;
      }
    },
    [renameCollectionMutation]
  );

  const updateCollectionTags = useCallback(
    async (collectionId: string, tags: { label: string; color: string }[]) => {
      try {
        await renameCollectionMutation({ collectionId, tags }).unwrap();
        return true;
      } catch (err) {
        console.error("Error updating collection tags:", err);
        return false;
      }
    },
    [renameCollectionMutation]
  );

  const deleteCollection = useCallback(
    async (collectionId: string) => {
      try {
        await deleteCollectionMutation(collectionId).unwrap();
        return true;
      } catch (err) {
        console.error("Error deleting collection:", err);
        return false;
      }
    },
    [deleteCollectionMutation]
  );

  const addImageToCollection = useCallback(
    async (
      collectionId: string,
      imageId: string,
      chatId: string | null,
      generationDetails: any
    ) => {
      try {
        const res = await fetch(`/api/collection/${collectionId}/images`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageId, chatId, generationDetails }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to add image to collection");
        }

        invalidateCollections();

        window.dispatchEvent(
          new CustomEvent(ASSETS_UPDATED_EVENT, {
            detail: { collectionId },
          })
        );

        return true;
      } catch (err) {
        console.error("Error adding image to collection:", err);
        return false;
      }
    },
    [invalidateCollections]
  );

  const addVideoToCollection = useCallback(
    async (
      collectionId: string,
      thumbnailImageId: string,
      videoId: string,
      generationDetails: any
    ) => {
      try {
        const res = await fetch(`/api/collection/${collectionId}/images`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageId: thumbnailImageId,
            assetId: videoId,
            assetType: "video",
            chatId: null,
            generationDetails,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to add video to collection");
        }

        invalidateCollections();

        window.dispatchEvent(
          new CustomEvent(ASSETS_UPDATED_EVENT, {
            detail: { collectionId },
          })
        );

        return true;
      } catch (err) {
        console.error("Error adding video to collection:", err);
        return false;
      }
    },
    [invalidateCollections]
  );

  const addPublicVideoToCollection = useCallback(
    async (
      collectionId: string,
      storageKey: string,
      contentUuid: string,
      title: string
    ) => {
      try {
        const res = await fetch(`/api/collection/${collectionId}/images`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageId: contentUuid,
            assetId: storageKey,
            assetType: "public_video",
            chatId: null,
            generationDetails: {
              title,
              status: "generated",
              prompt: "",
              source: "browse",
              storageKey,
            },
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to add video to collection");
        }

        invalidateCollections();

        window.dispatchEvent(
          new CustomEvent(ASSETS_UPDATED_EVENT, {
            detail: { collectionId },
          })
        );

        return true;
      } catch (err) {
        console.error("Error adding public video to collection:", err);
        return false;
      }
    },
    [invalidateCollections]
  );

  const addPublicImageToCollection = useCallback(
    async (
      collectionId: string,
      storageKey: string,
      contentUuid: string,
      title: string
    ) => {
      try {
        const res = await fetch(`/api/collection/${collectionId}/images`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageId: contentUuid,
            assetId: storageKey,
            assetType: "public_image",
            chatId: null,
            generationDetails: {
              title,
              status: "generated",
              prompt: "",
              source: "browse",
              storageKey,
            },
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to add image to collection");
        }

        invalidateCollections();

        window.dispatchEvent(
          new CustomEvent(ASSETS_UPDATED_EVENT, {
            detail: { collectionId },
          })
        );

        return true;
      } catch (err) {
        console.error("Error adding public image to collection:", err);
        return false;
      }
    },
    [invalidateCollections]
  );

  const removeItemFromCollection = useCallback(
    async (collectionId: string, itemId: string) => {
      try {
        const res = await fetch(
          `/api/collection/${collectionId}/images/${itemId}`,
          { method: "DELETE" }
        );

        if (!res.ok) {
          throw new Error("Failed to remove item from collection");
        }

        return true;
      } catch (err) {
        console.error("Error removing item from collection:", err);
        return false;
      }
    },
    []
  );

  const shareCollection = useCallback(
    async (
      collectionId: string,
      userId: string,
      permission: SharePermission
    ) => {
      try {
        const res = await fetch(`/api/collection/${collectionId}/share`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sharedWithUserId: userId, permission }),
        });

        if (!res.ok) {
          throw new Error("Failed to share collection");
        }

        return true;
      } catch (err) {
        console.error("Error sharing collection:", err);
        return false;
      }
    },
    []
  );

  const removeShare = useCallback(
    async (collectionId: string, userId: string) => {
      try {
        const res = await fetch(
          `/api/collection/${collectionId}/share/${userId}`,
          { method: "DELETE" }
        );

        if (!res.ok) {
          throw new Error("Failed to remove share");
        }

        return true;
      } catch (err) {
        console.error("Error removing share:", err);
        return false;
      }
    },
    []
  );

  const value: CollectionsContextValue = {
    collections,
    loading,
    error,
    refreshCollections,
    createCollection,
    renameCollection,
    updateCollectionTags,
    deleteCollection,
    addImageToCollection,
    addVideoToCollection,
    addPublicVideoToCollection,
    addPublicImageToCollection,
    removeItemFromCollection,
    shareCollection,
    removeShare,
    getDefaultCollectionName,
  };

  return (
    <CollectionsContext.Provider value={value}>
      {children}
    </CollectionsContext.Provider>
  );
}

