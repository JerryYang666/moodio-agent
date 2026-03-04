"use client";

import { useState, useCallback } from "react";
import { addToast } from "@heroui/toast";

export interface ShareUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

export interface ShareEntry {
  id: string;
  sharedWithUserId: string;
  permission: "viewer" | "collaborator";
  sharedAt: Date;
  email: string;
}

export type SharePermission = "viewer" | "collaborator";

interface UseShareModalOptions {
  shareApiPath: string;
  onShareChanged: () => Promise<void>;
}

export function useShareModal({ shareApiPath, onShareChanged }: UseShareModalOptions) {
  const [searchEmail, setSearchEmail] = useState("");
  const [searchedUser, setSearchedUser] = useState<ShareUser | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selectedPermission, setSelectedPermission] = useState<SharePermission>("viewer");
  const [isSharing, setIsSharing] = useState(false);

  const handleSearchUser = useCallback(async () => {
    if (!searchEmail.trim()) return;
    setIsSearching(true);
    setSearchError("");
    setSearchedUser(null);
    try {
      const res = await fetch(
        `/api/users/search?email=${encodeURIComponent(searchEmail.trim())}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setSearchedUser(data.user);
        } else {
          setSearchError("User not found");
        }
      } else {
        setSearchError("Failed to search user");
      }
    } catch {
      setSearchError("Error searching user");
    } finally {
      setIsSearching(false);
    }
  }, [searchEmail]);

  const handleShare = useCallback(async () => {
    if (!searchedUser) return;
    setIsSharing(true);
    try {
      const res = await fetch(shareApiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sharedWithUserId: searchedUser.id,
          permission: selectedPermission,
        }),
      });
      if (res.ok) {
        await onShareChanged();
        setSearchEmail("");
        setSearchedUser(null);
        setSelectedPermission("viewer");
        addToast({ title: "Shared", description: "Shared successfully", color: "success" });
      }
    } catch {
      addToast({ title: "Error", description: "Failed to share", color: "danger" });
    } finally {
      setIsSharing(false);
    }
  }, [searchedUser, selectedPermission, shareApiPath, onShareChanged]);

  const handleRemoveShare = useCallback(
    async (userId: string) => {
      try {
        const res = await fetch(`${shareApiPath}/${userId}`, {
          method: "DELETE",
        });
        if (res.ok) {
          await onShareChanged();
        }
      } catch {
        console.error("Error removing share:", shareApiPath);
      }
    },
    [shareApiPath, onShareChanged]
  );

  const reset = useCallback(() => {
    setSearchEmail("");
    setSearchedUser(null);
    setIsSearching(false);
    setSearchError("");
    setSelectedPermission("viewer");
    setIsSharing(false);
  }, []);

  return {
    searchEmail,
    setSearchEmail,
    searchedUser,
    isSearching,
    searchError,
    selectedPermission,
    setSelectedPermission,
    isSharing,
    handleSearchUser,
    handleShare,
    handleRemoveShare,
    reset,
  };
}
