"use client";

import { useEffect, useState, useCallback, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { Chip } from "@heroui/chip";
import { useDisclosure } from "@heroui/modal";
import { addToast } from "@heroui/toast";
import { ArrowLeft, Share2, Pencil, Wifi, WifiOff } from "lucide-react";
import AssetPickerModal, { type AssetSummary } from "@/components/chat/asset-picker-modal";
import { uploadImage } from "@/lib/upload/client";
import { uploadVideo } from "@/lib/upload/video-client";
import { uploadAudio } from "@/lib/upload/audio-client";
import DesktopCanvas from "@/components/desktop/DesktopCanvas";
import type { EnrichedDesktopAsset } from "@/components/desktop/assets";
import DesktopToolbar, { type CanvasMode } from "@/components/desktop/DesktopToolbar";
import ChatSidePanel from "@/components/chat/chat-side-panel";
import { siteConfig } from "@/config/site";
import {
  useDesktopDetail,
  type CameraState,
} from "@/hooks/use-desktop";
import {
  useDesktopWebSocket,
  type ConnectedUser,
  type RemoteEvent,
} from "@/hooks/use-desktop-ws";
import { useDesktopVideoSync } from "@/hooks/use-desktop-video-sync";
import { setDesktopViewport, clearDesktopViewport } from "@/lib/desktop/types";
import type { VideoAssetMeta } from "@/lib/desktop/types";
import { useAuth } from "@/hooks/use-auth";
import { TimelinePanel } from "@/components/timeline";
import { useTimeline } from "@/hooks/use-timeline";
import { useShareModal } from "@/hooks/use-share-modal";
import ShareModal from "@/components/share-modal";
import { hasWriteAccess } from "@/lib/permissions";
import { useResearchTelemetry } from "@/hooks/use-research-telemetry";
import { PresenceAvatars } from "@/components/PresenceAvatars";

const DEFAULT_CAMERA: CameraState = { x: 0, y: 0, zoom: 1 };
const VIEWPORT_SAVE_DEBOUNCE = 2000;
const DEFAULT_CHAT_PANEL_WIDTH = 380;
const COLLAPSED_CHAT_WIDTH = 48;

export default function DesktopDetailPage({
  params,
}: {
  params: Promise<{ desktopId: string }>;
}) {
  const { desktopId } = use(params);
  const router = useRouter();
  const t = useTranslations("desktop");
  const tCommon = useTranslations("common");
  const { user } = useAuth();
  const { track: trackResearch } = useResearchTelemetry();
  const {
    detail,
    loading,
    fetchDetail,
    updateAsset,
    removeAsset,
    batchUpdateAssets,
    saveViewport,
    applyRemoteEvent,
  } = useDesktopDetail(desktopId);

  // Cell-level locks for table assets (managed via WS events)
  const [cellLocks, setCellLocks] = useState<Map<string, { userId: string; sessionId: string; firstName: string }>>(
    () => new Map()
  );

  // Whole-asset locks for text assets (managed via WS events)
  const [textLocks, setTextLocks] = useState<Map<string, { userId: string; sessionId: string; firstName: string }>>(
    () => new Map()
  );

  // Stable ref for the video-sync remote-event handler (defined after the hook below)
  const handleVideoRemoteEventRef = useRef<(event: RemoteEvent) => void>(() => {});

  const handleRemoteEvent = useCallback(
    (event: RemoteEvent) => {
      applyRemoteEvent(event);
      handleVideoRemoteEventRef.current(event);

      if (event.type === "cell_selected") {
        const { assetId, rowId, colIndex } = event.payload || {};
        if (assetId && rowId != null && colIndex != null) {
          const key = `${assetId}:${rowId}-${colIndex}`;
          setCellLocks((prev) => {
            const next = new Map(prev);
            next.set(key, { userId: event.userId, sessionId: event.sessionId, firstName: event.firstName });
            return next;
          });
        }
      } else if (event.type === "cell_deselected") {
        const { assetId, rowId, colIndex } = event.payload || {};
        if (assetId && rowId != null && colIndex != null) {
          const key = `${assetId}:${rowId}-${colIndex}`;
          setCellLocks((prev) => {
            const next = new Map(prev);
            next.delete(key);
            return next;
          });
        }
      } else if (event.type === "text_selected") {
        const { assetId } = event.payload || {};
        if (assetId) {
          setTextLocks((prev) => {
            const next = new Map(prev);
            next.set(assetId as string, { userId: event.userId, sessionId: event.sessionId, firstName: event.firstName });
            return next;
          });
        }
      } else if (event.type === "text_deselected") {
        const { assetId } = event.payload || {};
        if (assetId) {
          setTextLocks((prev) => {
            const next = new Map(prev);
            next.delete(assetId as string);
            return next;
          });
        }
      } else if (event.type === "text_updated") {
        const { assetId, content } = event.payload || {};
        if (assetId && typeof content === "string") {
          applyRemoteEvent({
            type: "asset_updated",
            payload: { assetId, metadata: { content } },
          });
        }
      } else if (event.type === "video_suggest_updated") {
        const { assetId, title, videoIdea } = event.payload || {};
        if (assetId) {
          const updates: Record<string, unknown> = {};
          if (typeof title === "string") updates.title = title;
          if (typeof videoIdea === "string") updates.videoIdea = videoIdea;
          if (Object.keys(updates).length > 0) {
            applyRemoteEvent({
              type: "asset_updated",
              payload: { assetId, metadata: updates },
            });
          }
        }
      } else if (event.type === "table_generating") {
        const posX = typeof event.payload?.posX === "number" ? event.payload.posX : 0;
        const posY = typeof event.payload?.posY === "number" ? event.payload.posY : 0;

        const placeholder: EnrichedDesktopAsset = {
          id: EPHEMERAL_TABLE_ID,
          desktopId,
          assetType: "table",
          metadata: { title: "", columns: [], rows: [], status: "streaming" },
          posX,
          posY,
          width: 700,
          height: 200,
          rotation: 0,
          zIndex: 9999,
          addedAt: new Date(),
          imageUrl: null,
          videoUrl: null,
        };

        applyRemoteEvent({ type: "asset_added", payload: { asset: placeholder } });
      } else if (event.type === "session_left") {
        const { sessionId } = event.payload || {};
        if (sessionId) {
          setCellLocks((prev) => {
            const next = new Map(prev);
            Array.from(next.entries()).forEach(([k, v]) => {
              if (v.sessionId === sessionId) next.delete(k);
            });
            return next.size === prev.size ? prev : next;
          });
          setTextLocks((prev) => {
            const next = new Map(prev);
            Array.from(next.entries()).forEach(([k, v]) => {
              if (v.sessionId === sessionId) next.delete(k);
            });
            return next.size === prev.size ? prev : next;
          });
        }
      }
    },
    [applyRemoteEvent]
  );

  const {
    connectionState,
    sendEvent,
    connectedUsers,
    remoteCursors,
    remoteSelections,
  } = useDesktopWebSocket({
    desktopId,
    enabled: !!detail,
    onRemoteEvent: handleRemoteEvent,
    fetchDetail,
  });

  // Coordinate video-generation polling across room members
  const { handleVideoRemoteEvent } = useDesktopVideoSync({
    assets: detail?.assets ?? [],
    sendEvent,
    fetchDetail,
  });
  handleVideoRemoteEventRef.current = handleVideoRemoteEvent;

  const [camera, setCamera] = useState<CameraState>(DEFAULT_CAMERA);
  const [canvasMode, setCanvasMode] = useState<CanvasMode>("move");
  const viewportSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  const canvasWrapperRef = useRef<HTMLDivElement>(null);

  // Share modal state
  const {
    isOpen: isShareOpen,
    onOpen: onShareOpen,
    onOpenChange: onShareOpenChange,
  } = useDisclosure();

  const shareModal = useShareModal({
    shareApiPath: `/api/desktop/${desktopId}/share`,
    onShareChanged: async () => { await fetchDetail(); },
  });

  // Chat panel state
  const [isChatPanelCollapsed, setIsChatPanelCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(siteConfig.chatPanelCollapsed) === "true";
  });

  const [chatPanelWidth, setChatPanelWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_CHAT_PANEL_WIDTH;
    const stored = localStorage.getItem(siteConfig.chatPanelWidth);
    return stored ? parseInt(stored, 10) : DEFAULT_CHAT_PANEL_WIDTH;
  });

  const handleChatPanelCollapseChange = useCallback((collapsed: boolean) => {
    setIsChatPanelCollapsed(collapsed);
    localStorage.setItem(siteConfig.chatPanelCollapsed, String(collapsed));
  }, []);

  const handleChatPanelWidthChange = useCallback((width: number) => {
    setChatPanelWidth(width);
  }, []);

  const chatPanelActualWidth = isChatPanelCollapsed ? COLLAPSED_CHAT_WIDTH : chatPanelWidth;

  useEffect(() => {
    fetchDetail().then((data) => {
      if (data?.desktop.viewportState) {
        setCamera(data.desktop.viewportState);
      }
    });
  }, [fetchDetail]);

  const EPHEMERAL_TABLE_ID = "__generating_table__";

  // Listen for video assets added from chat — refresh local state and broadcast to room
  useEffect(() => {
    const handleAssetAdded = (e: CustomEvent) => {
      if (e.detail?.desktopId === desktopId) {
        fetchDetail();
        const newAssets = e.detail?.assets as EnrichedDesktopAsset[] | undefined;
        if (newAssets) {
          // Remove the ephemeral placeholder since the real asset has arrived
          applyRemoteEvent({ type: "asset_removed", payload: { assetId: EPHEMERAL_TABLE_ID } });

          for (const asset of newAssets) {
            sendEvent("asset_added", { asset });
            if (asset.assetType === "video") {
              const meta = asset.metadata as Record<string, unknown>;
              const genId = meta.generationId as string | undefined;
              if (genId) {
                sendEvent("video_generation_polling", { generationId: genId });
              }
            }

            // Research telemetry: canvas_item_added
            const assetMeta = asset.metadata as Record<string, any>;
            trackResearch({
              chatId: assetMeta?.chatId ?? undefined,
              eventType: "canvas_item_added",
              imageId: assetMeta?.imageId ?? undefined,
              metadata: {
                assetType: asset.assetType,
                desktopId,
                videoId: assetMeta?.videoId ?? undefined,
                source: assetMeta?.chatId ? "chat" : "direct",
              },
            });
          }
        }
      }
    };

    const handleTableGenerating = (e: CustomEvent) => {
      if (e.detail?.desktopId === desktopId) {
        const posX = typeof e.detail.posX === "number" ? e.detail.posX : 0;
        const posY = typeof e.detail.posY === "number" ? e.detail.posY : 0;

        const placeholder: EnrichedDesktopAsset = {
          id: EPHEMERAL_TABLE_ID,
          desktopId,
          assetType: "table",
          metadata: { title: "", columns: [], rows: [], status: "streaming" },
          posX,
          posY,
          width: 700,
          height: 200,
          rotation: 0,
          zIndex: 9999,
          addedAt: new Date(),
          imageUrl: null,
          videoUrl: null,
        };

        applyRemoteEvent({ type: "asset_added", payload: { asset: placeholder } });
        sendEvent("table_generating", { posX, posY });
      }
    };

    const handleAssetUpdated = (e: CustomEvent) => {
      if (e.detail?.desktopId === desktopId && e.detail?.asset) {
        applyRemoteEvent({
          type: "asset_updated",
          payload: {
            assetId: e.detail.asset.id,
            metadata: e.detail.asset.metadata,
          },
        });
      }
    };

    window.addEventListener("desktop-asset-added", handleAssetAdded as EventListener);
    window.addEventListener("desktop-table-generating", handleTableGenerating as EventListener);
    window.addEventListener("desktop-asset-updated", handleAssetUpdated as EventListener);
    return () => {
      window.removeEventListener("desktop-asset-added", handleAssetAdded as EventListener);
      window.removeEventListener("desktop-table-generating", handleTableGenerating as EventListener);
      window.removeEventListener("desktop-asset-updated", handleAssetUpdated as EventListener);
    };
  }, [desktopId, fetchDetail, sendEvent, applyRemoteEvent, trackResearch]);

  useEffect(() => {
    const expandChat = () => {
      if (isChatPanelCollapsed) {
        handleChatPanelCollapseChange(false);
      }
    };
    window.addEventListener("moodio-batch-to-chat", expandChat);
    window.addEventListener("moodio-asset-selected", expandChat);
    return () => {
      window.removeEventListener("moodio-batch-to-chat", expandChat);
      window.removeEventListener("moodio-asset-selected", expandChat);
    };
  }, [isChatPanelCollapsed, handleChatPanelCollapseChange]);

  const handleCameraChange = useCallback(
    (newCamera: CameraState) => {
      setCamera(newCamera);
      if (viewportSaveTimer.current) clearTimeout(viewportSaveTimer.current);
      viewportSaveTimer.current = setTimeout(() => {
        saveViewport(newCamera);
      }, VIEWPORT_SAVE_DEBOUNCE);
    },
    [saveViewport]
  );

  useEffect(() => {
    return () => {
      if (viewportSaveTimer.current) {
        clearTimeout(viewportSaveTimer.current);
        saveViewport(cameraRef.current);
      }
      clearDesktopViewport();
    };
  }, [saveViewport]);

  // Publish viewport state so components outside this tree (e.g. chat panel)
  // can place assets within the user's visible area.
  useEffect(() => {
    const el = canvasWrapperRef.current;
    if (!el) return;

    const publish = () => {
      const rect = el.getBoundingClientRect();
      setDesktopViewport({
        camera,
        width: rect.width,
        height: rect.height,
        assetRects: (detail?.assets ?? []).map((a) => ({
          x: a.posX,
          y: a.posY,
          w: a.width ?? 400,
          h: a.height ?? 300,
        })),
      });
    };

    publish();

    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => observer.disconnect();
  }, [camera, detail?.assets]);

  const handleAssetMove = useCallback(
    (assetId: string, posX: number, posY: number) => {
      updateAsset(assetId, { posX, posY });
      sendEvent("asset_moved", { assetId, posX, posY });
    },
    [updateAsset, sendEvent]
  );

  const handleAssetResize = useCallback(
    (assetId: string, width: number, height: number) => {
      updateAsset(assetId, { width, height });
      sendEvent("asset_resized", { assetId, width, height });
    },
    [updateAsset, sendEvent]
  );

  const handleAssetDelete = useCallback(
    (assetId: string) => {
      const asset = detail?.assets.find((a) => a.id === assetId);
      const meta = asset?.metadata as Record<string, any> | undefined;

      trackResearch({
        eventType: "canvas_item_removed",
        imageId: meta?.imageId ?? undefined,
        metadata: {
          assetId,
          assetType: asset?.assetType,
          videoId: meta?.videoId ?? undefined,
          desktopId,
          turnIndex: null,
        },
      });

      sendEvent("asset_removed", { assetId });
      removeAsset(assetId).catch((e) =>
        console.error("Failed to delete asset:", e)
      );
    },
    [removeAsset, sendEvent, detail?.assets, trackResearch, desktopId]
  );

  const handleAssetBatchMove = useCallback(
    (moves: Array<{ id: string; posX: number; posY: number }>) => {
      batchUpdateAssets(moves);
      for (const m of moves) {
        sendEvent("asset_moved", { assetId: m.id, posX: m.posX, posY: m.posY });
      }
    },
    [batchUpdateAssets, sendEvent]
  );

  const handleAssetBatchDelete = useCallback(
    (assetIds: string[]) => {
      for (const id of assetIds) {
        const asset = detail?.assets.find((a) => a.id === id);
        const meta = asset?.metadata as Record<string, any> | undefined;

        trackResearch({
          eventType: "canvas_item_removed",
          imageId: meta?.imageId ?? undefined,
          metadata: {
            assetId: id,
            assetType: asset?.assetType,
            videoId: meta?.videoId ?? undefined,
            desktopId,
            turnIndex: null,
          },
        });

        sendEvent("asset_removed", { assetId: id });
        removeAsset(id).catch((e) =>
          console.error("Failed to delete asset:", e)
        );
      }
    },
    [removeAsset, sendEvent, detail?.assets, trackResearch, desktopId]
  );

  const handleExternalImageDrop = useCallback(
    async (
      payload: {
        imageId: string;
        title?: string;
        prompt?: string;
        status?: "loading" | "generated" | "error";
        aspectRatio?: string;
        chatId?: string | null;
      },
      position: { x: number; y: number }
    ) => {
      try {
        const { aspectRatioDimensions } = await import("@/lib/desktop/types");
        const dims = aspectRatioDimensions(payload.aspectRatio, 300);

        const res = await fetch(`/api/desktop/${desktopId}/assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assets: [
              {
                assetType: "image",
                metadata: {
                  imageId: payload.imageId,
                  chatId: payload.chatId ?? undefined,
                  title: payload.title || t("videoTitle"),
                  prompt: payload.prompt || "",
                  status: payload.status || "generated",
                  aspectRatio: payload.aspectRatio || undefined,
                },
                posX: position.x,
                posY: position.y,
                ...(dims ? { width: dims.w, height: dims.h } : {}),
              },
            ],
          }),
        });

        if (!res.ok) {
          throw new Error("Failed to add dropped image to desktop");
        }

        const data = await res.json();
        window.dispatchEvent(
          new CustomEvent("desktop-asset-added", {
            detail: { assets: data.assets, desktopId },
          })
        );
      } catch (error) {
        console.error("Failed to drop image onto desktop:", error);
        addToast({
          title: t("failedToAddImage"),
          description: t("retryDragImage"),
          color: "danger",
        });
      }
    },
    [desktopId]
  );

  const handleExternalTextDrop = useCallback(
    async (
      payload: { content: string; chatId?: string | null },
      position: { x: number; y: number }
    ) => {
      try {
        const res = await fetch(`/api/desktop/${desktopId}/assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assets: [
              {
                assetType: "text",
                metadata: {
                  content: payload.content,
                  chatId: payload.chatId ?? undefined,
                },
                posX: position.x,
                posY: position.y,
                width: 300,
                height: 200,
              },
            ],
          }),
        });
        if (!res.ok) throw new Error("Failed to add dropped text to desktop");
        const data = await res.json();
        window.dispatchEvent(
          new CustomEvent("desktop-asset-added", {
            detail: { assets: data.assets, desktopId },
          })
        );
      } catch (error) {
        console.error("Failed to drop text onto desktop:", error);
        addToast({
          title: t("failedToAddText"),
          description: t("retryDragText"),
          color: "danger",
        });
      }
    },
    [desktopId, t]
  );

  const handleExternalShotlistDrop = useCallback(
    async (
      payload: {
        title: string;
        columns: string[];
        rows: Array<{ id: string; cells: Array<{ value: string }> }>;
        chatId?: string | null;
      },
      position: { x: number; y: number }
    ) => {
      try {
        const res = await fetch(`/api/desktop/${desktopId}/assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assets: [
              {
                assetType: "table",
                metadata: {
                  title: payload.title,
                  columns: payload.columns,
                  rows: payload.rows,
                  chatId: payload.chatId ?? undefined,
                  status: "complete",
                },
                posX: position.x,
                posY: position.y,
                width: 700,
                height: 40 + payload.rows.length * 36 + 40,
              },
            ],
          }),
        });
        if (!res.ok) throw new Error("Failed to add dropped shotlist to desktop");
        const data = await res.json();
        window.dispatchEvent(
          new CustomEvent("desktop-asset-added", {
            detail: { assets: data.assets, desktopId },
          })
        );
      } catch (error) {
        console.error("Failed to drop shotlist onto desktop:", error);
        addToast({
          title: t("failedToAddText"),
          color: "danger",
        });
      }
    },
    [desktopId, t]
  );

  const handleExternalVideoSuggestDrop = useCallback(
    async (
      payload: {
        imageId: string;
        url: string;
        title: string;
        videoIdea: string;
        prompt?: string;
        aspectRatio?: string;
        chatId?: string | null;
      },
      position: { x: number; y: number }
    ) => {
      try {
        const res = await fetch(`/api/desktop/${desktopId}/assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assets: [
              {
                assetType: "video_suggest",
                metadata: {
                  imageId: payload.imageId,
                  chatId: payload.chatId ?? undefined,
                  title: payload.title,
                  videoIdea: payload.videoIdea,
                  prompt: payload.prompt || "",
                  aspectRatio: payload.aspectRatio || "",
                },
                posX: position.x,
                posY: position.y,
                width: 340,
                height: 100,
              },
            ],
          }),
        });
        if (!res.ok) throw new Error("Failed to add dropped video suggest to desktop");
        const data = await res.json();
        window.dispatchEvent(
          new CustomEvent("desktop-asset-added", {
            detail: { assets: data.assets, desktopId },
          })
        );
      } catch (error) {
        console.error("Failed to drop video suggest onto desktop:", error);
        addToast({
          title: t("failedToAddImage"),
          color: "danger",
        });
      }
    },
    [desktopId, t]
  );

  const handleCellCommit = useCallback(
    (assetId: string, rowId: string, colIndex: number, value: string) => {
      applyRemoteEvent({
        type: "cell_updated",
        payload: { assetId, rowId, colIndex, value },
      });
    },
    [applyRemoteEvent]
  );

  const handleTextCommit = useCallback(
    async (assetId: string, content: string) => {
      applyRemoteEvent({
        type: "asset_updated",
        payload: { assetId, metadata: { content } },
      });
      try {
        await fetch(`/api/desktop/${desktopId}/assets/${assetId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ textPatch: { content } }),
        });
      } catch (error) {
        console.error("Failed to save text content:", error);
      }
    },
    [desktopId, applyRemoteEvent]
  );

  const handleVideoSuggestCommit = useCallback(
    async (assetId: string, updates: { title: string; videoIdea: string }) => {
      // Update local state immediately
      applyRemoteEvent({
        type: "asset_updated",
        payload: { assetId, metadata: updates },
      });

      // Persist to DB via server-side read-modify-write (no GET needed)
      try {
        await fetch(`/api/desktop/${desktopId}/assets/${assetId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoSuggestPatch: updates }),
        });
      } catch (error) {
        console.error("Failed to save video suggest content:", error);
      }
    },
    [desktopId, applyRemoteEvent]
  );

  const handleAssetRename = useCallback(
    async (assetId: string, newTitle: string) => {
      // Find the current asset to read-modify-write its metadata
      const asset = detail?.assets.find((a) => a.id === assetId);
      if (!asset) return;

      const currentMeta = asset.metadata as Record<string, unknown>;
      const updatedMeta = { ...currentMeta, title: newTitle };

      // Optimistic update
      applyRemoteEvent({
        type: "asset_updated",
        payload: { assetId, metadata: { title: newTitle } },
      });

      try {
        await fetch(`/api/desktop/${desktopId}/assets/${assetId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metadata: updatedMeta }),
        });
        sendEvent("asset_updated", { assetId, metadata: { title: newTitle } });
      } catch (error) {
        console.error("Failed to rename asset:", error);
      }
    },
    [desktopId, detail?.assets, applyRemoteEvent, sendEvent]
  );

  const handleOpenChat = useCallback(
    (chatId: string, messageTimestamp?: number) => {
      // Open the chat in the side panel instead of navigating away
      if (isChatPanelCollapsed) {
        handleChatPanelCollapseChange(false);
      }
      window.dispatchEvent(
        new CustomEvent("open-chat-in-panel", { detail: { chatId, messageTimestamp } })
      );
    },
    [isChatPanelCollapsed, handleChatPanelCollapseChange]
  );

  // Inline video playback state
  const [playingAssetId, setPlayingAssetId] = useState<string | null>(null);

  const handleAssetClick = useCallback(
    (asset: EnrichedDesktopAsset) => {
      if (asset.assetType === "public_video") {
        if (asset.videoUrl) {
          setPlayingAssetId((prev) => (prev === asset.id ? null : asset.id));
        }
        return;
      }
      if (asset.assetType === "video") {
        const meta = asset.metadata as Record<string, unknown>;
        const status = asset.generationData?.status || meta.status;
        const hasVideo = !!asset.videoUrl || !!meta.videoId;
        if ((status === "completed" || hasVideo)) {
          setPlayingAssetId((prev) => (prev === asset.id ? null : asset.id));
          return;
        }
      }
      if (asset.assetType === "audio" && asset.audioUrl) {
        setPlayingAssetId((prev) => (prev === asset.id ? null : asset.id));
      }
    },
    []
  );

  // Timeline editor state
  const {
    clips: timelineClips,
    isExpanded: isTimelineExpanded,
    toggleExpanded: toggleTimelineExpanded,
    addClip: addTimelineClip,
    removeClip: removeTimelineClip,
    updateClip: updateTimelineClip,
    reorderClips: reorderTimelineClips,
    clearTimeline,
  } = useTimeline(desktopId);

  const handleTimelineClipRemove = useCallback(
    (clipId: string) => {
      const clip = timelineClips.find((c) => c.id === clipId);
      const asset = clip ? detail?.assets.find((a) => a.id === clip.assetId) : undefined;
      const meta = asset?.metadata as Record<string, any> | undefined;

      trackResearch({
        eventType: "timeline_clip_removed",
        imageId: meta?.imageId ?? undefined,
        metadata: {
          clipId,
          assetId: clip?.assetId,
          videoId: meta?.videoId ?? undefined,
        },
      });

      removeTimelineClip(clipId);
    },
    [timelineClips, detail?.assets, trackResearch, removeTimelineClip]
  );

  const handleZIndexChange = useCallback(
    (assetId: string, delta: number) => {
      const asset = detail?.assets.find((a) => a.id === assetId);
      if (!asset) return;
      const newZIndex = asset.zIndex + delta;
      updateAsset(assetId, { zIndex: newZIndex });
      sendEvent("asset_z_changed", { assetId, zIndex: newZIndex });
    },
    [detail?.assets, updateAsset, sendEvent]
  );

  const handleSendToTimeline = useCallback(
    (asset: EnrichedDesktopAsset) => {
      if (asset.assetType !== "video") return;
      const meta = asset.metadata as unknown as VideoAssetMeta;
      const duration =
        meta.duration ||
        (asset.generationData?.params?.duration
          ? Number(asset.generationData.params.duration)
          : 0);

      const clipId = `clip-${asset.id}-${Date.now()}`;

      addTimelineClip({
        id: clipId,
        assetId: asset.id,
        title: meta.title || t("untitledVideo"),
        thumbnailUrl: asset.imageUrl || null,
        videoUrl: asset.videoUrl || null,
        duration,
      });
      // Dispatch event so TimelinePanel auto-expands
      window.dispatchEvent(new CustomEvent("timeline-clip-added"));

      trackResearch({
        eventType: "timeline_clip_added",
        imageId: meta.imageId ?? undefined,
        metadata: {
          videoId: meta.videoId ?? undefined,
          clipId,
          desktopId,
          duration,
        },
      });

      addToast({
        title: t("addedToTimeline"),
        description: meta.title || t("videoClipAdded"),
        color: "success",
      });
    },
    [addTimelineClip]
  );

  // Asset picker state for right-click "Add Asset"
  const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
  const toggleAssetPicker = useCallback(() => setIsAssetPickerOpen((v) => !v), []);
  const addAssetPositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleAddAssetAtPosition = useCallback((worldPos: { x: number; y: number }) => {
    addAssetPositionRef.current = worldPos;
    setIsAssetPickerOpen(true);
  }, []);

  const handleAddTextAtPosition = useCallback(
    async (worldPos: { x: number; y: number }) => {
      try {
        const res = await fetch(`/api/desktop/${desktopId}/assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assets: [
              {
                assetType: "text",
                metadata: { content: "" },
                posX: worldPos.x,
                posY: worldPos.y,
                width: 300,
                height: 200,
              },
            ],
          }),
        });
        if (!res.ok) throw new Error("Failed to add text asset to desktop");
        const data = await res.json();
        window.dispatchEvent(
          new CustomEvent("desktop-asset-added", {
            detail: { assets: data.assets, desktopId },
          })
        );
      } catch (error) {
        console.error("Failed to add text asset to desktop:", error);
        addToast({ title: t("failedToAddText"), color: "danger" });
      }
    },
    [desktopId, t]
  );

  const handleAssetPickerSelect = useCallback(
    async (asset: AssetSummary) => {
      const pos = addAssetPositionRef.current;
      const isVideo = asset.assetType === "video";
      const isAudio = asset.assetType === "audio";
      try {
        const metadata: Record<string, unknown> = {
          imageId: asset.imageId,
          chatId: asset.chatId ?? undefined,
          title: asset.generationDetails?.title || (isAudio ? "Audio" : isVideo ? "Video" : "Image"),
          prompt: asset.generationDetails?.prompt || "",
          status: asset.generationDetails?.status || "generated",
        };
        if (isVideo && asset.assetId) {
          metadata.videoId = asset.assetId;
        }
        if (isAudio && asset.assetId) {
          metadata.audioId = asset.assetId;
        }
        const assetPayload: Record<string, unknown> = {
          assetType: isAudio ? "audio" : isVideo ? "video" : "image",
          metadata,
          posX: pos.x,
          posY: pos.y,
        };
        if (isAudio) {
          assetPayload.width = 300;
          assetPayload.height = 200;
        }
        const res = await fetch(`/api/desktop/${desktopId}/assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assets: [assetPayload] }),
        });
        if (!res.ok) throw new Error("Failed to add asset to desktop");
        const data = await res.json();
        window.dispatchEvent(
          new CustomEvent("desktop-asset-added", {
            detail: { assets: data.assets, desktopId },
          })
        );
      } catch (error) {
        console.error("Failed to add picked asset to desktop:", error);
        addToast({ title: t("failedToAddAsset"), color: "danger" });
      }
    },
    [desktopId]
  );

  const handleAssetPickerUpload = useCallback(
    async (files: File[]) => {
      const pos = addAssetPositionRef.current;
      for (const file of files) {
        const isVideo = siteConfig.upload.allowedVideoTypes.includes(file.type);
        const isAudio = siteConfig.upload.allowedAudioTypes.includes(file.type);

        let asset: { assetType: string; metadata: Record<string, unknown>; posX: number; posY: number; width?: number; height?: number };

        if (isAudio) {
          const result = await uploadAudio(file, { skipCollection: true });
          if (!result.success) {
            addToast({ title: t("uploadFailed"), description: result.error.message, color: "danger" });
            continue;
          }
          asset = {
            assetType: "audio",
            metadata: {
              audioId: result.data.audioId,
              title: file.name,
              status: "completed",
            },
            posX: pos.x,
            posY: pos.y,
            width: 300,
            height: 200,
          };
        } else if (isVideo) {
          const result = await uploadVideo(file);
          if (!result.success) {
            addToast({ title: t("uploadFailed"), description: result.error.message, color: "danger" });
            continue;
          }
          asset = {
            assetType: "video",
            metadata: {
              videoId: result.data.videoId,
              imageId: result.data.thumbnailImageId || result.data.videoId,
              title: file.name,
              prompt: "",
              status: "completed",
            },
            posX: pos.x,
            posY: pos.y,
          };
        } else {
          const result = await uploadImage(file);
          if (!result.success) {
            addToast({ title: t("uploadFailed"), description: result.error.message, color: "danger" });
            continue;
          }
          asset = {
            assetType: "image",
            metadata: {
              imageId: result.data.imageId,
              title: file.name,
              prompt: "",
              status: "generated",
            },
            posX: pos.x,
            posY: pos.y,
          };
        }

        try {
          const res = await fetch(`/api/desktop/${desktopId}/assets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assets: [asset] }),
          });
          if (!res.ok) throw new Error("Failed to add uploaded asset to desktop");
          const data = await res.json();
          window.dispatchEvent(
            new CustomEvent("desktop-asset-added", {
              detail: { assets: data.assets, desktopId },
            })
          );
        } catch (error) {
          console.error("Failed to add uploaded asset to desktop:", error);
          addToast({ title: t("failedToAddAsset"), color: "danger" });
        }
      }
    },
    [desktopId]
  );

  if (loading && !detail) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-default-500">{t("desktopNotFound")}</p>
      </div>
    );
  }

  const { desktop, assets, shares } = detail;
  const canEdit = hasWriteAccess(desktop.permission);

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Main desktop content */}
      <div className="relative flex-1 min-w-0 h-full flex flex-col">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-divider bg-background/80 backdrop-blur-sm z-20 shrink-0">
        <Button
          isIconOnly
          size="sm"
          variant="light"
          onPress={() => router.push("/desktop")}
        >
          <ArrowLeft size={18} />
        </Button>
        <h2 className="font-semibold truncate flex-1">{desktop.name}</h2>

        {/* Presence avatars */}
        <PresenceAvatars users={connectedUsers} />

        {/* Connection state indicator */}
        {connectionState === "connected" && (
          <div className="text-success" title={t("liveSyncActive")}>
            <Wifi size={16} />
          </div>
        )}

        <Chip size="sm" variant="flat" color={desktop.isOwner ? "primary" : "default"}>
          {desktop.permission}
        </Chip>
        {desktop.isOwner && (
          <Button
            size="sm"
            variant="flat"
            startContent={<Share2 size={14} />}
            onPress={onShareOpen}
          >
            {tCommon("share")}
          </Button>
        )}
      </div>

      {/* Degraded-mode banner */}
      {(connectionState === "polling" || connectionState === "reconnecting") && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-warning-50 border-b border-warning-200 text-warning-700 text-xs z-20 shrink-0">
          <WifiOff size={14} />
          {connectionState === "polling"
            ? t("liveSyncUnavailable")
            : t("reconnecting")}
        </div>
      )}

      {/* Canvas */}
      <div ref={canvasWrapperRef} className="flex-1 relative">
        <DesktopCanvas
          assets={assets}
          camera={camera}
          permission={desktop.permission}
          canvasMode={canvasMode}
          onCameraChange={handleCameraChange}
          onAssetMove={handleAssetMove}
          onAssetBatchMove={handleAssetBatchMove}
          onAssetDelete={canEdit ? handleAssetDelete : undefined}
          onAssetBatchDelete={canEdit ? handleAssetBatchDelete : undefined}
          onAssetResize={canEdit ? handleAssetResize : undefined}
          onOpenChat={handleOpenChat}
          onAssetClick={handleAssetClick}
          playingAssetId={playingAssetId}
          sendEvent={sendEvent}
          remoteCursors={remoteCursors}
          remoteSelections={remoteSelections}
          currentUserId={user?.id}
          cellLocks={cellLocks}
          textLocks={textLocks}
          onCellCommit={handleCellCommit}
          onTextCommit={handleTextCommit}
          onVideoSuggestCommit={canEdit ? handleVideoSuggestCommit : undefined}
          onZIndexChange={canEdit ? handleZIndexChange : undefined}
          onSendToTimeline={canEdit ? handleSendToTimeline : undefined}
          onExternalImageDrop={canEdit ? handleExternalImageDrop : undefined}
          onExternalTextDrop={canEdit ? handleExternalTextDrop : undefined}
          onExternalShotlistDrop={canEdit ? handleExternalShotlistDrop : undefined}
          onExternalVideoSuggestDrop={canEdit ? handleExternalVideoSuggestDrop : undefined}
          onAddAssetAtPosition={canEdit ? handleAddAssetAtPosition : undefined}
          onAddTextAtPosition={canEdit ? handleAddTextAtPosition : undefined}
          onAssetRename={canEdit ? handleAssetRename : undefined}
        />
        <DesktopToolbar
          camera={camera}
          assets={assets}
          onCameraChange={handleCameraChange}
          canvasMode={canvasMode}
          onCanvasModeChange={setCanvasMode}
        />
      </div>

      {/* Timeline Editor — bottom panel */}
      <TimelinePanel
        clips={timelineClips}
        isExpanded={isTimelineExpanded}
        onToggleExpanded={toggleTimelineExpanded}
        onRemoveClip={handleTimelineClipRemove}
        onReorderClips={reorderTimelineClips}
        onClearTimeline={clearTimeline}
        onUpdateClip={updateTimelineClip}
        desktopId={desktopId}
        onExportTrack={(data) => {
          trackResearch({
            eventType: "video_export_started",
            metadata: {
              desktopId,
              clipCount: data.clipCount,
              clips: data.clips,
              outputFormat: data.outputFormat,
            },
          });
        }}
      />
      </div>

      {/* Right Panel — Agent Chat (desktop only) */}
      <div
        className="hidden lg:block shrink-0 min-h-0 z-60"
        style={{
          width: chatPanelActualWidth,
          transition: isChatPanelCollapsed ? "width 0.3s ease-in-out" : undefined,
        }}
      >
        <ChatSidePanel
          defaultExpanded={!isChatPanelCollapsed}
          onCollapseChange={handleChatPanelCollapseChange}
          onWidthChange={handleChatPanelWidthChange}
          desktopId={desktopId}
        />
      </div>

      {/* Share Modal */}
      <ShareModal
        isOpen={isShareOpen}
        onOpenChange={onShareOpenChange}
        title={t("shareDesktop")}
        ownerId={desktop.userId}
        shares={shares}
        share={shareModal}
      />

      {/* Asset Picker for right-click "Add Asset" */}
      <AssetPickerModal
        isOpen={isAssetPickerOpen}
        onOpenChange={toggleAssetPicker}
        onSelect={handleAssetPickerSelect}
        onUpload={handleAssetPickerUpload}
        acceptTypes={["image", "video", "audio"]}
      />
    </div>
  );
}
