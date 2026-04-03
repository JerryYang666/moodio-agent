"use client";

import { useState, useCallback } from "react";
import { addToast } from "@heroui/toast";
import {
  PERMISSION_VIEWER,
  type SharePermission,
} from "@/lib/permissions";

export type { SharePermission } from "@/lib/permissions";

export interface ShareUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

export interface ShareEntry {
  id: string;
  sharedWithUserId: string;
  permission: SharePermission;
  sharedAt: Date;
  email: string;
}

interface UseShareModalOptions {
  shareApiPath: string;
  onShareChanged: () => Promise<void>;
}

export function useShareModal({ shareApiPath, onShareChanged }: UseShareModalOptions) {
  const [searchEmail, setSearchEmail] = useState("");
  const [searchedUser, setSearchedUser] = useState<ShareUser | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selectedPermission, setSelectedPermission] = useState<SharePermission>(PERMISSION_VIEWER);
  const [isSharing, setIsSharing] = useState(false);

  // Bulk selection state for team-based sharing
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [bulkPermission, setBulkPermission] = useState<SharePermission>(PERMISSION_VIEWER);
  const [isBulkSharing, setIsBulkSharing] = useState(false);

  const toggleUser = useCallback((userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }, []);

  const toggleTeam = useCallback(
    (memberUserIds: string[]) => {
      setSelectedUserIds((prev) => {
        const allSelected = memberUserIds.every((uid) => prev.has(uid));
        const next = new Set(prev);
        if (allSelected) {
          memberUserIds.forEach((uid) => next.delete(uid));
        } else {
          memberUserIds.forEach((uid) => next.add(uid));
        }
        return next;
      });
    },
    []
  );

  const clearSelection = useCallback(() => {
    setSelectedUserIds(new Set());
  }, []);

  const handleBulkShare = useCallback(async () => {
    if (selectedUserIds.size === 0) return;
    setIsBulkSharing(true);
    try {
      const res = await fetch(shareApiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sharedWithUserIds: Array.from(selectedUserIds),
          permission: bulkPermission,
        }),
      });
      if (res.ok) {
        await onShareChanged();
        setSelectedUserIds(new Set());
        addToast({
          title: "Shared",
          description: `Shared with ${selectedUserIds.size} member(s)`,
          color: "success",
        });
      }
    } catch {
      addToast({ title: "Error", description: "Failed to share", color: "danger" });
    } finally {
      setIsBulkSharing(false);
    }
  }, [selectedUserIds, bulkPermission, shareApiPath, onShareChanged]);

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
        setSelectedPermission(PERMISSION_VIEWER);
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
    setSelectedPermission(PERMISSION_VIEWER);
    setIsSharing(false);
    setSelectedUserIds(new Set());
    setBulkPermission(PERMISSION_VIEWER);
    setIsBulkSharing(false);
  }, []);

  return {
    // Email search (existing)
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
    // Bulk team sharing (new)
    selectedUserIds,
    toggleUser,
    toggleTeam,
    clearSelection,
    bulkPermission,
    setBulkPermission,
    isBulkSharing,
    handleBulkShare,
  };
}
