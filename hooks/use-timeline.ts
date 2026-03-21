"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { TimelineClip, TimelineState } from "@/components/timeline/types";
import { getTimelineStorageKey } from "@/components/timeline/types";

function loadTimeline(desktopId: string): TimelineClip[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getTimelineStorageKey(desktopId));
    if (!raw) return [];
    const parsed: TimelineState = JSON.parse(raw);
    return Array.isArray(parsed.clips) ? parsed.clips : [];
  } catch {
    return [];
  }
}

function saveTimeline(desktopId: string, clips: TimelineClip[]): void {
  if (typeof window === "undefined") return;
  const state: TimelineState = { desktopId, clips };
  localStorage.setItem(getTimelineStorageKey(desktopId), JSON.stringify(state));
}

function probeDuration(videoUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve(video.duration);
      video.remove();
    };
    video.onerror = () => {
      video.remove();
      reject(new Error("Failed to load video metadata"));
    };
    video.src = videoUrl;
  });
}

export function useTimeline(desktopId: string) {
  const [clips, setClips] = useState<TimelineClip[]>(() =>
    loadTimeline(desktopId)
  );
  const [isExpanded, setIsExpanded] = useState(false);

  // Persist on every clips change
  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  useEffect(() => {
    saveTimeline(desktopId, clipsRef.current);
  }, [clips, desktopId]);

  // Probe duration for any clip with duration=0 (newly added or loaded from storage)
  const probedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const zeroDurationClips = clips.filter(
      (c) => (!c.duration || c.duration <= 0) && c.videoUrl && !probedIdsRef.current.has(c.id)
    );
    if (zeroDurationClips.length === 0) return;

    zeroDurationClips.forEach((clip) => {
      probedIdsRef.current.add(clip.id);
      probeDuration(clip.videoUrl!)
        .then((dur) => {
          setClips((prev) =>
            prev.map((c) => (c.id === clip.id ? { ...c, duration: dur } : c))
          );
        })
        .catch(() => {});
    });
  }, [clips]);

  const addClip = useCallback((clip: TimelineClip) => {
    setClips((prev) => {
      if (prev.some((c) => c.assetId === clip.assetId)) return prev;
      return [...prev, clip];
    });
  }, []);

  const removeClip = useCallback((clipId: string) => {
    setClips((prev) => prev.filter((c) => c.id !== clipId));
  }, []);

  const updateClip = useCallback(
    (clipId: string, updates: Partial<Omit<TimelineClip, "id">>) => {
      setClips((prev) =>
        prev.map((c) => (c.id === clipId ? { ...c, ...updates } : c))
      );
    },
    []
  );

  const reorderClips = useCallback((fromIndex: number, toIndex: number) => {
    setClips((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.length) return prev;
      if (toIndex < 0 || toIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const clearTimeline = useCallback(() => {
    setClips([]);
  }, []);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  return {
    clips,
    isExpanded,
    setIsExpanded,
    toggleExpanded,
    addClip,
    removeClip,
    updateClip,
    reorderClips,
    clearTimeline,
  };
}
