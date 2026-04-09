"use client";

import { useState, useEffect, useCallback } from "react";
import { addToast } from "@heroui/toast";

interface PublicShareStatus {
  exists: boolean;
  token?: string;
  isActive?: boolean;
  url?: string;
}

interface PublicShareConfig {
  resourceType: "collection" | "folder";
  resourceId: string;
}

export function usePublicShare(config: PublicShareConfig | undefined) {
  const [status, setStatus] = useState<PublicShareStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!config) return;

    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/public-share?resourceType=${config.resourceType}&resourceId=${config.resourceId}`
      );
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      } else if (res.status === 403) {
        setStatus(null);
      }
    } catch {
      // Silently fail — status will remain null
    } finally {
      setIsLoading(false);
    }
  }, [config?.resourceType, config?.resourceId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleToggle = useCallback(async () => {
    if (!config) return;

    setIsToggling(true);
    try {
      const res = await fetch("/api/public-share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceType: config.resourceType,
          resourceId: config.resourceId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setStatus({
          exists: true,
          token: data.token,
          isActive: data.isActive,
          url: data.url,
        });
      }
    } catch {
      addToast({
        title: "Error",
        description: "Failed to update public share",
        color: "danger",
      });
    } finally {
      setIsToggling(false);
    }
  }, [config?.resourceType, config?.resourceId]);

  const handleCopyLink = useCallback(async () => {
    if (!status?.url) return;

    try {
      await navigator.clipboard.writeText(status.url);
      addToast({
        title: "Link copied!",
        color: "success",
      });
    } catch {
      addToast({
        title: "Failed to copy",
        description: "Please copy the link manually",
        color: "warning",
      });
    }
  }, [status?.url]);

  return {
    status,
    isLoading,
    isToggling,
    handleToggle,
    handleCopyLink,
  };
}
