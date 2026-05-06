"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { TimelineClip, TimelineState } from "@/components/timeline/types";
import { getTimelineStorageKey } from "@/components/timeline/types";
import { probeHasAudio } from "@/lib/timeline/probeAudio";
import type { OperationHistoryAPI } from "./use-operation-history";

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

export function useTimeline(
  desktopId: string,
  history?: OperationHistoryAPI,
  userId?: string
) {
  const [clips, setClips] = useState<TimelineClip[]>(() =>
    loadTimeline(desktopId)
  );
  const [isExpanded, setIsExpanded] = useState(false);

  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  useEffect(() => {
    saveTimeline(desktopId, clipsRef.current);
  }, [clips, desktopId]);

  // Called from history forward/inverse closures so undo/redo of any
  // timeline mutation pops the panel open if it was collapsed.
  const ensureExpanded = useCallback(() => {
    setIsExpanded(true);
  }, []);

  // Refs so applier closures stay stable across renders.
  const historyRef = useRef(history);
  historyRef.current = history;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

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

  // Probe hasAudio for any clip missing the field — primarily clips
  // persisted to localStorage before the field existed. Keyed on assetId
  // so split clips (which share a source) don't trigger N redundant fetches.
  const audioProbedAssetIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const toProbe: TimelineClip[] = [];
    const seen = new Set<string>();
    for (const clip of clips) {
      if (clip.hasAudio !== undefined) continue;
      if (!clip.videoUrl) continue;
      if (audioProbedAssetIdsRef.current.has(clip.assetId)) continue;
      if (seen.has(clip.assetId)) continue;
      seen.add(clip.assetId);
      toProbe.push(clip);
    }
    if (toProbe.length === 0) return;

    toProbe.forEach((clip) => {
      audioProbedAssetIdsRef.current.add(clip.assetId);
      probeHasAudio(clip.videoUrl!)
        .then((hasAudio) => {
          setClips((prev) =>
            prev.map((c) =>
              c.assetId === clip.assetId ? { ...c, hasAudio } : c
            )
          );
        })
        .catch(() => {});
    });
  }, [clips]);

  // Raw appliers — used by both public mutations and history forward/inverse
  // closures. They never record.
  const applyAdd = useCallback((clip: TimelineClip) => {
    setClips((prev) => {
      if (prev.some((c) => c.assetId === clip.assetId)) return prev;
      return [...prev, clip];
    });
  }, []);

  const applyInsertAt = useCallback((clip: TimelineClip, index: number) => {
    setClips((prev) => {
      const next = [...prev];
      const safe = Math.max(0, Math.min(index, next.length));
      next.splice(safe, 0, clip);
      return next;
    });
  }, []);

  const applyRemove = useCallback((clipId: string) => {
    setClips((prev) => prev.filter((c) => c.id !== clipId));
  }, []);

  const applyUpdate = useCallback(
    (clipId: string, updates: Partial<Omit<TimelineClip, "id">>) => {
      setClips((prev) =>
        prev.map((c) => (c.id === clipId ? { ...c, ...updates } : c))
      );
    },
    []
  );

  const applySplit = useCallback(
    (
      original: TimelineClip,
      originalIndex: number,
      splitTime: number,
      idA: string,
      idB: string
    ) => {
      setClips((prev) => {
        const trimStart = original.trimStart ?? 0;
        const trimEnd = original.trimEnd ?? original.duration;
        const next = [...prev];
        const safeIndex = Math.max(0, Math.min(originalIndex, next.length));
        const targetIndex =
          next[safeIndex]?.id === original.id
            ? safeIndex
            : next.findIndex((c) => c.id === original.id);
        if (targetIndex === -1) return prev;
        next.splice(
          targetIndex,
          1,
          { ...original, id: idA, trimStart, trimEnd: splitTime },
          { ...original, id: idB, trimStart: splitTime, trimEnd }
        );
        return next;
      });
    },
    []
  );

  const applyUnsplit = useCallback(
    (idA: string, idB: string, original: TimelineClip, originalIndex: number) => {
      setClips((prev) => {
        const aIdx = prev.findIndex((c) => c.id === idA);
        const bIdx = prev.findIndex((c) => c.id === idB);
        if (aIdx === -1 || bIdx === -1) return prev;
        const next = [...prev];
        for (const i of [aIdx, bIdx].sort((x, y) => y - x)) next.splice(i, 1);
        const safeIndex = Math.max(0, Math.min(originalIndex, next.length));
        next.splice(safeIndex, 0, original);
        return next;
      });
    },
    []
  );

  const applyReorder = useCallback((fromIndex: number, toIndex: number) => {
    setClips((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.length) return prev;
      if (toIndex < 0 || toIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const addClip = useCallback(
    (clip: TimelineClip) => {
      // Default hasAudio to true; the async probe below can only downgrade it.
      // See TimelineClip.hasAudio JSDoc for why false-negatives are avoided.
      const clipWithDefaults: TimelineClip = {
        ...clip,
        hasAudio: clip.hasAudio ?? true,
      };

      const alreadyPresent = clipsRef.current.some(
        (c) => c.assetId === clipWithDefaults.assetId
      );

      applyAdd(clipWithDefaults);

      if (!alreadyPresent) {
        // Async probes mutate duration / hasAudio after the clip is added.
        // Refresh the snapshot inside `inverse` so redo restores the
        // post-probe state, and clear probe tracking so a fresh probe runs
        // if the in-flight one was discarded by removal.
        let snapshot = clipWithDefaults;
        historyRef.current?.record({
          userId: userIdRef.current ?? "",
          label: { key: "addTimelineClip" },
          targetIds: [clipWithDefaults.id],
          forward: () => {
            ensureExpanded();
            applyAdd(snapshot);
            return { ok: true };
          },
          inverse: () => {
            ensureExpanded();
            const latest = clipsRef.current.find(
              (c) => c.id === clipWithDefaults.id
            );
            if (latest) snapshot = latest;
            probedIdsRef.current.delete(clipWithDefaults.id);
            audioProbedAssetIdsRef.current.delete(clipWithDefaults.assetId);
            applyRemove(clipWithDefaults.id);
            return { ok: true };
          },
        });
      }

      if (clip.hasAudio === undefined && clipWithDefaults.videoUrl) {
        probeHasAudio(clipWithDefaults.videoUrl)
          .then((hasAudio) => {
            if (hasAudio) return;
            setClips((prev) =>
              prev.map((c) =>
                c.assetId === clipWithDefaults.assetId
                  ? { ...c, hasAudio: false }
                  : c
              )
            );
          })
          .catch(() => {});
      }
    },
    [applyAdd, applyRemove, ensureExpanded]
  );

  const removeClip = useCallback(
    (clipId: string) => {
      const idx = clipsRef.current.findIndex((c) => c.id === clipId);
      if (idx === -1) return;
      const original = clipsRef.current[idx];

      applyRemove(clipId);

      historyRef.current?.record({
        userId: userIdRef.current ?? "",
        label: { key: "removeTimelineClip" },
        targetIds: [clipId],
        forward: () => {
          ensureExpanded();
          applyRemove(clipId);
          return { ok: true };
        },
        inverse: () => {
          ensureExpanded();
          applyInsertAt(original, idx);
          return { ok: true };
        },
      });
    },
    [applyRemove, applyInsertAt, ensureExpanded]
  );

  // Live (non-recording) update — used per-frame during trim drag. The
  // undoable, drag-end counterpart is `commitTrim` below.
  const updateClip = useCallback(
    (clipId: string, updates: Partial<Omit<TimelineClip, "id">>) => {
      applyUpdate(clipId, updates);
    },
    [applyUpdate]
  );

  const commitTrim = useCallback(
    (
      clipId: string,
      prevTrimStart: number,
      prevTrimEnd: number,
      nextTrimStart: number,
      nextTrimEnd: number
    ) => {
      if (
        prevTrimStart === nextTrimStart &&
        prevTrimEnd === nextTrimEnd
      ) {
        return;
      }

      applyUpdate(clipId, { trimStart: nextTrimStart, trimEnd: nextTrimEnd });

      historyRef.current?.record({
        userId: userIdRef.current ?? "",
        label: { key: "trimTimelineClip" },
        targetIds: [clipId],
        coalesceKey: `timeline-trim:${clipId}`,
        forward: () => {
          ensureExpanded();
          applyUpdate(clipId, {
            trimStart: nextTrimStart,
            trimEnd: nextTrimEnd,
          });
          return { ok: true };
        },
        inverse: () => {
          ensureExpanded();
          applyUpdate(clipId, {
            trimStart: prevTrimStart,
            trimEnd: prevTrimEnd,
          });
          return { ok: true };
        },
      });
    },
    [applyUpdate, ensureExpanded]
  );

  const splitClip = useCallback(
    (clipId: string, splitTime: number) => {
      const idx = clipsRef.current.findIndex((c) => c.id === clipId);
      if (idx === -1) return;
      const original = clipsRef.current[idx];
      const trimStart = original.trimStart ?? 0;
      const trimEnd = original.trimEnd ?? original.duration;
      if (splitTime <= trimStart + 0.1 || splitTime >= trimEnd - 0.1) return;

      const t = Date.now();
      const idA = `clip-${original.assetId}-${t}-a`;
      const idB = `clip-${original.assetId}-${t}-b`;

      applySplit(original, idx, splitTime, idA, idB);

      historyRef.current?.record({
        userId: userIdRef.current ?? "",
        label: { key: "splitTimelineClip" },
        targetIds: [clipId],
        forward: () => {
          ensureExpanded();
          applySplit(original, idx, splitTime, idA, idB);
          return { ok: true };
        },
        inverse: () => {
          ensureExpanded();
          applyUnsplit(idA, idB, original, idx);
          return { ok: true };
        },
      });
    },
    [applySplit, applyUnsplit, ensureExpanded]
  );

  const reorderClips = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex < 0 || fromIndex >= clipsRef.current.length) return;
      if (toIndex < 0 || toIndex >= clipsRef.current.length) return;
      if (fromIndex === toIndex) return;

      const movedId = clipsRef.current[fromIndex]?.id;

      applyReorder(fromIndex, toIndex);

      historyRef.current?.record({
        userId: userIdRef.current ?? "",
        label: { key: "reorderTimelineClips" },
        targetIds: movedId ? [movedId] : [],
        forward: () => {
          ensureExpanded();
          applyReorder(fromIndex, toIndex);
          return { ok: true };
        },
        inverse: () => {
          ensureExpanded();
          applyReorder(toIndex, fromIndex);
          return { ok: true };
        },
      });
    },
    [applyReorder, ensureExpanded]
  );

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
    commitTrim,
    splitClip,
    reorderClips,
    clearTimeline,
  };
}
