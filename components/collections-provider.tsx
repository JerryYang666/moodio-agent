"use client";

import React, { createContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { addToast } from "@heroui/toast";

// Custom event names for real-time sync
export const ASSETS_UPDATED_EVENT = "moodio-assets-updated";
export const COLLECTIONS_UPDATED_EVENT = "moodio-collections-updated";

export interface Collection {
  id: string;
  userId: string;
  projectId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  permission: "owner" | "collaborator" | "viewer";
  isOwner: boolean;
  sharedAt?: Date;
  coverImageUrl?: string | null;
}

export interface CollectionImage {
  id: string;
  projectId: string;
  collectionId: string | null;
  imageId: string; // Thumbnail/display image ID (for both images and videos)
  assetId: string; // Actual asset ID (same as imageId for images, video ID for videos)
  assetType: "image" | "video";
  chatId: string | null;
  generationDetails: {
    title: string;
    prompt: string;
    status: "loading" | "generated" | "error" | "pending" | "processing" | "completed" | "failed";
    imageUrl?: string; // Resolved thumbnail URL
    videoUrl?: string; // Resolved video URL (for videos only)
  };
  addedAt: Date;
}

export interface CollectionShare {
  id: string;
  collectionId: string;
  sharedWithUserId: string;
  permission: "viewer" | "collaborator";
  sharedAt: Date;
}

interface CollectionsContextValue {
  collections: Collection[];
  loading: boolean;
  error: string;
  refreshCollections: () => Promise<void>;
  createCollection: (name: string, projectId?: string) => Promise<Collection | null>;
  renameCollection: (collectionId: string, name: string) => Promise<boolean>;
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
  removeItemFromCollection: (
    collectionId: string,
    itemId: string
  ) => Promise<boolean>;
  shareCollection: (
    collectionId: string,
    userId: string,
    permission: "viewer" | "collaborator"
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
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
    if (!user) {
      setCollections([]);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/collection");
      if (!res.ok) {
        throw new Error("Failed to fetch collections");
      }

      const data = await res.json();
      setCollections(data.collections || []);
    } catch (err) {
      console.error("Error fetching collections:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch collections");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshCollections();
  }, [refreshCollections]);

  const createCollection = useCallback(
    async (name: string, projectId?: string) => {
      try {
        const payload: any = { name };
        if (projectId) payload.projectId = projectId;
        const res = await fetch("/api/collection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          throw new Error("Failed to create collection");
        }

        const data = await res.json();
        setCollections((prev) => [data.collection, ...prev]);
        
        // Dispatch event for real-time sync (e.g., assets sidebar)
        window.dispatchEvent(new CustomEvent(COLLECTIONS_UPDATED_EVENT));
        
        return data.collection;
      } catch (err) {
        console.error("Error creating collection:", err);
        return null;
      }
    },
    []
  );

  const renameCollection = useCallback(async (collectionId: string, name: string) => {
    try {
      const res = await fetch(`/api/collection/${collectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (!res.ok) {
        throw new Error("Failed to rename collection");
      }

      const data = await res.json();
      setCollections((prev) =>
        prev.map((col) =>
          col.id === collectionId ? { ...col, name: data.collection.name, updatedAt: data.collection.updatedAt } : col
        )
      );
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
  }, []);

  const deleteCollection = useCallback(async (collectionId: string) => {
    try {
      const res = await fetch(`/api/collection/${collectionId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete collection");
      }

      setCollections((prev) => prev.filter((col) => col.id !== collectionId));
      return true;
    } catch (err) {
      console.error("Error deleting collection:", err);
      return false;
    }
  }, []);

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

        // Update collection's updatedAt
        setCollections((prev) =>
          prev.map((col) =>
            col.id === collectionId ? { ...col, updatedAt: new Date() } : col
          )
        );
        
        // Dispatch event for real-time sync (e.g., assets sidebar)
        window.dispatchEvent(new CustomEvent(ASSETS_UPDATED_EVENT, { 
          detail: { collectionId } 
        }));
        
        return true;
      } catch (err) {
        console.error("Error adding image to collection:", err);
        return false;
      }
    },
    []
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
            imageId: thumbnailImageId, // Thumbnail for display
            assetId: videoId, // Actual video asset
            assetType: "video",
            chatId: null, // Videos don't come from chats
            generationDetails,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to add video to collection");
        }

        // Update collection's updatedAt
        setCollections((prev) =>
          prev.map((col) =>
            col.id === collectionId ? { ...col, updatedAt: new Date() } : col
          )
        );

        // Dispatch event for real-time sync (e.g., assets sidebar)
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
    []
  );

  const removeItemFromCollection = useCallback(
    async (collectionId: string, itemId: string) => {
      try {
        const res = await fetch(
          `/api/collection/${collectionId}/images/${itemId}`,
          {
            method: "DELETE",
          }
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
      permission: "viewer" | "collaborator"
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
          {
            method: "DELETE",
          }
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
    deleteCollection,
    addImageToCollection,
    addVideoToCollection,
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

