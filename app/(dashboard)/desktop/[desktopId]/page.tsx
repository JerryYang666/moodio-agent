"use client";

import { useEffect, useState, useCallback, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { Chip } from "@heroui/chip";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure } from "@heroui/modal";
import { addToast } from "@heroui/toast";
import { ArrowLeft, Share2, Pencil, Wifi, WifiOff, Bot, LayoutDashboard } from "lucide-react";
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
import { useOperationHistory } from "@/hooks/use-operation-history";
import { useUndoRedoKeyboard } from "@/hooks/use-undo-redo-keyboard";
import {
  applyAssetMove,
  applyAssetTransform,
  applyAssetRemove,
  applyAssetRestore,
  applyZIndex,
  applyTextUpdate,
  applyTableCellUpdate,
  applyAssetImagePatch,
  type DesktopDispatchDeps,
} from "@/lib/desktop/history";
import type { ImageEditMode } from "@/components/desktop/image-edit-overlay";

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

  // Single per-page operation-history instance, shared by canvas and
  // timeline mutations so Ctrl+Z follows one linear timeline of actions.
  // Session-scoped and only replays the local user's own actions, so
  // undo never clobbers collaborators' work.
  const history = useOperationHistory();

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

  // Stable bundle of dispatch deps for the history adapters. Each closure
  // reads the *current* assets via the ref, so inverse builders recorded
  // long ago still see up-to-date state.
  const assetsRef = useRef<EnrichedDesktopAsset[]>([]);
  assetsRef.current = detail?.assets ?? [];
  const historyDepsRef = useRef<DesktopDispatchDeps>({
    desktopId,
    applyRemoteEvent,
    sendEvent,
    getAssets: () => assetsRef.current,
  });
  historyDepsRef.current = {
    desktopId,
    applyRemoteEvent,
    sendEvent,
    getAssets: () => assetsRef.current,
  };

  // Ctrl+Z / Ctrl+Shift+Z. Skip when a cell/text lock belongs to the local
  // user — they're mid-edit and the browser's native text undo should win.
  useUndoRedoKeyboard({
    history,
    disabled: useCallback(() => {
      if (!user?.id) return false;
      for (const lock of cellLocks.values()) {
        if (lock.userId === user.id) return true;
      }
      for (const lock of textLocks.values()) {
        if (lock.userId === user.id) return true;
      }
      return false;
    }, [user?.id, cellLocks, textLocks]),
  });

  const [camera, setCamera] = useState<CameraState>(DEFAULT_CAMERA);
  const [canvasMode, setCanvasMode] = useState<CanvasMode>("move");

  // In-canvas image-edit overlay (重绘 / 裁切 / 擦除 / 抠图). Set by the
  // `moodio-image-edit` listener below; cleared when the user submits or
  // cancels.
  const [imageEditState, setImageEditState] = useState<{
    assetId: string;
    mode: ImageEditMode;
  } | null>(null);
  const viewportSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  // Mirror canEdit into a ref so the window-level paste listener (which is
  // installed once) can read the current value without re-binding.
  const canEditRef = useRef(false);
  canEditRef.current = detail ? hasWriteAccess(detail.desktop.permission) : false;

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

          // Record each newly-added asset so the local user can Ctrl+Z to
          // remove it. Restore uses the real server-assigned id + metadata.
          for (const asset of newAssets) {
            const snapshot: EnrichedDesktopAsset = { ...asset };
            history.record({
              userId: user?.id ?? "",
              label: { key: "addAsset" },
              targetIds: [asset.id],
              forward: () => applyAssetRestore(historyDepsRef.current, snapshot),
              inverse: () => applyAssetRemove(historyDepsRef.current, asset.id),
            });
          }

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
  }, [desktopId, fetchDetail, sendEvent, applyRemoteEvent, trackResearch, history, user?.id]);

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

  // Open the in-canvas image-edit overlay when a floating-bar button asks
  // for it. The DesktopCanvas button calls handleFocusAsset before
  // dispatching, so the asset is already centered by the time we mount.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const mode: ImageEditMode | undefined = detail?.mode;
      const assetId: string | undefined = detail?.assetId;
      if (!mode || !assetId) return;
      setImageEditState({ assetId, mode });
    };
    window.addEventListener("moodio-image-edit", handler);
    return () => window.removeEventListener("moodio-image-edit", handler);
  }, []);

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
      // Snapshot the prior position from the pre-move asset so undo restores
      // to where it started. The canvas emits this once per drag (on pointer
      // up), so we don't need separate coalescing here.
      const prev = assetsRef.current.find((a) => a.id === assetId);
      const prevX = prev?.posX ?? posX;
      const prevY = prev?.posY ?? posY;

      updateAsset(assetId, { posX, posY });
      sendEvent("asset_moved", { assetId, posX, posY });

      if (prev && (prevX !== posX || prevY !== posY)) {
        history.record({
          userId: user?.id ?? "",
          label: { key: "moveAsset" },
          targetIds: [assetId],
          forward: () => applyAssetMove(historyDepsRef.current, assetId, posX, posY),
          inverse: () => applyAssetMove(historyDepsRef.current, assetId, prevX, prevY),
        });
      }
    },
    [updateAsset, sendEvent, history, user?.id]
  );

  const handleAssetResize = useCallback(
    (
      assetId: string,
      width: number,
      height: number,
      posX?: number,
      posY?: number
    ) => {
      const prev = assetsRef.current.find((a) => a.id === assetId);
      const prevW = prev?.width ?? width;
      const prevH = prev?.height ?? height;
      const prevX = prev?.posX ?? 0;
      const prevY = prev?.posY ?? 0;

      // Handles like nw/ne/sw/n/w shift posX/posY to keep the opposite
      // anchor steady; se/e/s and the natural-dim fallback don't pass them.
      const newX = posX ?? prevX;
      const newY = posY ?? prevY;
      const dimsChanged = prevW !== width || prevH !== height;
      const posChanged = newX !== prevX || newY !== prevY;

      const updates: Record<string, number> = { width, height };
      if (posChanged) {
        updates.posX = newX;
        updates.posY = newY;
      }
      updateAsset(assetId, updates);
      sendEvent("asset_resized", { assetId, width, height });
      if (posChanged) {
        sendEvent("asset_moved", { assetId, posX: newX, posY: newY });
      }

      if (prev && (dimsChanged || posChanged)) {
        history.record({
          userId: user?.id ?? "",
          label: { key: "resizeAsset" },
          targetIds: [assetId],
          forward: () =>
            applyAssetTransform(
              historyDepsRef.current,
              assetId,
              width,
              height,
              newX,
              newY
            ),
          inverse: () =>
            applyAssetTransform(
              historyDepsRef.current,
              assetId,
              prevW,
              prevH,
              prevX,
              prevY
            ),
        });
      }
    },
    [updateAsset, sendEvent, history, user?.id]
  );

  // Commit handler for the in-canvas image-edit overlay. Runs after the
  // overlay has produced a new imageId. Pushes the previous imageId onto
  // metadata.imageHistory and routes the swap through the undo/redo engine
  // so Cmd/Ctrl+Z walks back through prior versions.
  const handleImageEditCommit = useCallback(
    (args: {
      assetId: string;
      newImageId: string;
      newImageUrl: string;
      editType: string;
    }) => {
      const { assetId, newImageId, newImageUrl } = args;
      const asset = assetsRef.current.find((a) => a.id === assetId);
      setImageEditState(null);
      if (!asset || asset.assetType !== "image") return;
      const meta = asset.metadata as Record<string, unknown>;
      const prevImageId =
        typeof meta.imageId === "string" ? meta.imageId : null;
      const prevImageUrl = asset.imageUrl ?? null;
      if (!prevImageId) return;
      const prevHistory: string[] = Array.isArray(meta.imageHistory)
        ? (meta.imageHistory as unknown[]).filter(
            (id): id is string => typeof id === "string"
          )
        : [];
      // Forward state appends prev id to the history; inverse restores
      // exactly the prev (prev imageId, prev history).
      const nextHistory = [...prevHistory, prevImageId];

      // Apply the change immediately. `history.record` only STORES the
      // forward/inverse closures for later replay during undo/redo — it
      // does NOT execute `forward` itself. So the optimistic state update,
      // WS broadcast, and DB PATCH all have to fire here.
      void applyAssetImagePatch(
        historyDepsRef.current,
        assetId,
        newImageId,
        newImageUrl,
        nextHistory
      );

      history.record({
        userId: user?.id ?? "",
        label: { key: "editAssetImage" },
        targetIds: [assetId],
        forward: () =>
          applyAssetImagePatch(
            historyDepsRef.current,
            assetId,
            newImageId,
            newImageUrl,
            nextHistory
          ),
        inverse: () =>
          applyAssetImagePatch(
            historyDepsRef.current,
            assetId,
            prevImageId,
            prevImageUrl,
            prevHistory
          ),
      });
    },
    [history, user?.id]
  );

  const handleImageEditCancel = useCallback(() => {
    setImageEditState(null);
  }, []);

  // Restore a past image version from the edit-history popover. Mirrors
  // `handleImageEditCommit`: drops the restored imageId from history, appends
  // the current imageId so the chain stays walkable, applies optimistically,
  // and records forward/inverse so Cmd/Ctrl+Z undoes the restore.
  const handleImageHistoryRestore = useCallback(
    (args: { assetId: string; imageId: string; imageUrl: string }) => {
      const { assetId, imageId: restoredImageId, imageUrl: restoredImageUrl } = args;
      const asset = assetsRef.current.find((a) => a.id === assetId);
      if (!asset || asset.assetType !== "image") return;
      const meta = asset.metadata as Record<string, unknown>;
      const prevImageId =
        typeof meta.imageId === "string" ? meta.imageId : null;
      const prevImageUrl = asset.imageUrl ?? null;
      if (!prevImageId || prevImageId === restoredImageId) return;
      const prevHistory: string[] = Array.isArray(meta.imageHistory)
        ? (meta.imageHistory as unknown[]).filter(
            (id): id is string => typeof id === "string"
          )
        : [];
      // Remove the restored id from history (it's no longer "past"), then
      // append the current id since it's now a prior version.
      const nextHistory = [
        ...prevHistory.filter((id) => id !== restoredImageId),
        prevImageId,
      ];

      void applyAssetImagePatch(
        historyDepsRef.current,
        assetId,
        restoredImageId,
        restoredImageUrl,
        nextHistory
      );

      history.record({
        userId: user?.id ?? "",
        label: { key: "editAssetImage" },
        targetIds: [assetId],
        forward: () =>
          applyAssetImagePatch(
            historyDepsRef.current,
            assetId,
            restoredImageId,
            restoredImageUrl,
            nextHistory
          ),
        inverse: () =>
          applyAssetImagePatch(
            historyDepsRef.current,
            assetId,
            prevImageId,
            prevImageUrl,
            prevHistory
          ),
      });
    },
    [history, user?.id]
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

      // Record a full snapshot of the asset so undo can restore it verbatim.
      if (asset) {
        const snapshot: EnrichedDesktopAsset = { ...asset };
        history.record({
          userId: user?.id ?? "",
          label: { key: "deleteAsset" },
          targetIds: [assetId],
          forward: () => applyAssetRemove(historyDepsRef.current, assetId),
          inverse: () => applyAssetRestore(historyDepsRef.current, snapshot),
        });
      }
    },
    [removeAsset, sendEvent, detail?.assets, trackResearch, desktopId, history, user?.id]
  );

  const handleAssetBatchMove = useCallback(
    (moves: Array<{ id: string; posX: number; posY: number }>) => {
      // Capture each asset's pre-move position so undo can revert the whole
      // group in one entry. Moves with no change are skipped.
      const priors = moves
        .map((m) => {
          const a = assetsRef.current.find((x) => x.id === m.id);
          if (!a) return null;
          if (a.posX === m.posX && a.posY === m.posY) return null;
          return { id: m.id, posX: a.posX, posY: a.posY };
        })
        .filter((v): v is { id: string; posX: number; posY: number } => !!v);

      batchUpdateAssets(moves);
      for (const m of moves) {
        sendEvent("asset_moved", { assetId: m.id, posX: m.posX, posY: m.posY });
      }

      if (priors.length > 0) {
        const effective = moves.filter((m) => priors.some((p) => p.id === m.id));
        history.record({
          userId: user?.id ?? "",
          label:
            priors.length === 1
              ? { key: "moveAsset" }
              : { key: "moveAssets", values: { count: priors.length } },
          targetIds: priors.map((p) => p.id),
          forward: async () => {
            for (const m of effective) {
              await applyAssetMove(historyDepsRef.current, m.id, m.posX, m.posY);
            }
            return { ok: true };
          },
          inverse: async () => {
            for (const p of priors) {
              await applyAssetMove(historyDepsRef.current, p.id, p.posX, p.posY);
            }
            return { ok: true };
          },
        });
      }
    },
    [batchUpdateAssets, sendEvent, history, user?.id]
  );

  const handleAssetBatchDelete = useCallback(
    (assetIds: string[]) => {
      const snapshots: EnrichedDesktopAsset[] = [];
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
        if (asset) snapshots.push({ ...asset });
      }

      if (snapshots.length > 0) {
        history.record({
          userId: user?.id ?? "",
          label:
            snapshots.length === 1
              ? { key: "deleteAsset" }
              : { key: "deleteAssets", values: { count: snapshots.length } },
          targetIds: snapshots.map((s) => s.id),
          forward: async () => {
            for (const s of snapshots) {
              await applyAssetRemove(historyDepsRef.current, s.id);
            }
            return { ok: true };
          },
          inverse: async () => {
            for (const s of snapshots) {
              await applyAssetRestore(historyDepsRef.current, s);
            }
            return { ok: true };
          },
        });
      }
    },
    [removeAsset, sendEvent, detail?.assets, trackResearch, desktopId, history, user?.id]
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
      // TableAsset already patched the server + broadcast; we only need to
      // mirror the write into local React state and record history with the
      // prior cell value (read from the now-stale copy in assetsRef).
      const asset = assetsRef.current.find((a) => a.id === assetId);
      const meta = asset?.metadata as
        | { rows?: Array<{ id: string; cells?: Array<{ value?: string }> }> }
        | undefined;
      const row = meta?.rows?.find((r) => r.id === rowId);
      const prevValue = row?.cells?.[colIndex]?.value ?? "";

      applyRemoteEvent({
        type: "cell_updated",
        payload: { assetId, rowId, colIndex, value },
      });

      if (prevValue !== value) {
        history.record({
          userId: user?.id ?? "",
          label: { key: "editCell" },
          coalesceKey: `desktop-cell:${assetId}:${rowId}:${colIndex}`,
          targetIds: [assetId],
          forward: () =>
            applyTableCellUpdate(historyDepsRef.current, assetId, rowId, colIndex, value),
          inverse: () =>
            applyTableCellUpdate(historyDepsRef.current, assetId, rowId, colIndex, prevValue),
        });
      }
    },
    [applyRemoteEvent, history, user?.id]
  );

  const handleTextCommit = useCallback(
    async (assetId: string, content: string) => {
      const asset = assetsRef.current.find((a) => a.id === assetId);
      const prev =
        typeof (asset?.metadata as { content?: unknown })?.content === "string"
          ? ((asset!.metadata as { content: string }).content)
          : "";

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

      if (prev !== content) {
        history.record({
          userId: user?.id ?? "",
          label: { key: "editText" },
          coalesceKey: `desktop-text:${assetId}`,
          targetIds: [assetId],
          forward: () => applyTextUpdate(historyDepsRef.current, assetId, content),
          inverse: () => applyTextUpdate(historyDepsRef.current, assetId, prev),
        });
      }
    },
    [desktopId, applyRemoteEvent, history, user?.id]
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
    commitTrim: commitTimelineTrim,
    splitClip: splitTimelineClip,
    reorderClips: reorderTimelineClips,
    clearTimeline,
  } = useTimeline(desktopId, history, user?.id);

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
      const prevZ = asset.zIndex;
      const newZIndex = asset.zIndex + delta;
      updateAsset(assetId, { zIndex: newZIndex });
      sendEvent("asset_z_changed", { assetId, zIndex: newZIndex });

      history.record({
        userId: user?.id ?? "",
        label: { key: "changeStackOrder" },
        targetIds: [assetId],
        forward: () => applyZIndex(historyDepsRef.current, assetId, newZIndex),
        inverse: () => applyZIndex(historyDepsRef.current, assetId, prevZ),
      });
    },
    [detail?.assets, updateAsset, sendEvent, history, user?.id]
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

  // Upload arbitrary files (image/video/audio) and place each as a new asset
  // at the given world position. Shared by the asset-picker upload, the
  // canvas drag-drop, and the paste-to-desktop flow.
  //
  // To make the UI feel responsive even when the upload roundtrip takes a
  // while, we insert an ephemeral placeholder asset locally (using a blob
  // URL for images so the user sees their file immediately) and swap it for
  // the real server-assigned asset once the upload + DB insert finish. This
  // mirrors the existing __generating_table__ placeholder pattern. Files
  // are uploaded in parallel so multiple drops/pastes don't queue.
  const uploadFilesToDesktop = useCallback(
    async (files: File[], position: { x: number; y: number }) => {
      const uploadOne = async (file: File) => {
        const isVideo = siteConfig.upload.allowedVideoTypes.includes(file.type);
        const isAudio = siteConfig.upload.allowedAudioTypes.includes(file.type);
        const blobUrl = URL.createObjectURL(file);
        const placeholderId = `__uploading_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        // For images we pre-load the blob to learn its natural dimensions, so
        // the placeholder renders at the same size the final asset will. The
        // load happens against an in-memory blob and is effectively instant.
        let placeholderDims: { w: number; h: number } = isAudio
          ? { w: 300, h: 200 }
          : { w: 300, h: 300 };
        if (!isVideo && !isAudio) {
          const natural = await new Promise<{ w: number; h: number } | null>((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
            img.onerror = () => resolve(null);
            img.src = blobUrl;
          });
          if (natural && natural.w > 0 && natural.h > 0) {
            const MAX = 300;
            const scale = Math.min(MAX / natural.w, MAX / natural.h, 1);
            placeholderDims = {
              w: Math.max(1, Math.round(natural.w * scale)),
              h: Math.max(1, Math.round(natural.h * scale)),
            };
          }
        }

        const placeholder: EnrichedDesktopAsset = {
          id: placeholderId,
          desktopId,
          assetType: isAudio ? "audio" : isVideo ? "video" : "image",
          metadata: isAudio
            ? { audioId: null, title: file.name, status: "uploading" }
            : isVideo
              // VideoAsset shows a loading spinner when both src and videoUrl
              // are absent and status is "processing".
              ? { videoId: null, imageId: null, title: file.name, prompt: "", status: "processing" }
              : { imageId: null, title: file.name, prompt: "", status: "uploading" },
          posX: position.x,
          posY: position.y,
          width: placeholderDims.w,
          height: placeholderDims.h,
          rotation: 0,
          // High zIndex so the placeholder is visible above existing assets
          // while the upload completes (matches the ephemeral table pattern).
          zIndex: 9999,
          addedAt: new Date(),
          // Only images can render directly from the blob; for video/audio we
          // leave URLs null so the components fall back to their loading state.
          imageUrl: isVideo || isAudio ? null : blobUrl,
          videoUrl: null,
          audioUrl: null,
        };

        applyRemoteEvent({ type: "asset_added", payload: { asset: placeholder } });

        const removePlaceholder = () => {
          applyRemoteEvent({ type: "asset_removed", payload: { assetId: placeholderId } });
          URL.revokeObjectURL(blobUrl);
        };

        try {
          let assetPayload: { assetType: string; metadata: Record<string, unknown>; posX: number; posY: number; width?: number; height?: number };
          if (isAudio) {
            const result = await uploadAudio(file, { skipCollection: true });
            if (!result.success) {
              addToast({ title: t("uploadFailed"), description: result.error.message, color: "danger" });
              removePlaceholder();
              return;
            }
            assetPayload = {
              assetType: "audio",
              metadata: { audioId: result.data.audioId, title: file.name, status: "completed" },
              posX: position.x,
              posY: position.y,
              width: 300,
              height: 200,
            };
          } else if (isVideo) {
            const result = await uploadVideo(file);
            if (!result.success) {
              addToast({ title: t("uploadFailed"), description: result.error.message, color: "danger" });
              removePlaceholder();
              return;
            }
            assetPayload = {
              assetType: "video",
              metadata: {
                videoId: result.data.videoId,
                imageId: result.data.thumbnailImageId || result.data.videoId,
                title: file.name,
                prompt: "",
                status: "completed",
              },
              posX: position.x,
              posY: position.y,
            };
          } else {
            const result = await uploadImage(file);
            if (!result.success) {
              addToast({ title: t("uploadFailed"), description: result.error.message, color: "danger" });
              removePlaceholder();
              return;
            }
            assetPayload = {
              assetType: "image",
              metadata: { imageId: result.data.imageId, title: file.name, prompt: "", status: "generated" },
              posX: position.x,
              posY: position.y,
              // Persist the dims we already computed so the real asset replaces
              // the placeholder at the same size (no resize jank).
              width: placeholderDims.w,
              height: placeholderDims.h,
            };
          }

          const res = await fetch(`/api/desktop/${desktopId}/assets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assets: [assetPayload] }),
          });
          if (!res.ok) throw new Error("Failed to add uploaded asset to desktop");
          const data = await res.json();

          // Swap: drop the placeholder before the real asset arrives. Using the
          // existing "desktop-asset-added" event keeps WS broadcast + telemetry
          // wiring in one place.
          removePlaceholder();
          window.dispatchEvent(
            new CustomEvent("desktop-asset-added", {
              detail: { assets: data.assets, desktopId },
            })
          );
        } catch (error) {
          console.error("Failed to add uploaded asset to desktop:", error);
          addToast({ title: t("failedToAddAsset"), color: "danger" });
          removePlaceholder();
        }
      };

      await Promise.all(files.map(uploadOne));
    },
    [desktopId, t, applyRemoteEvent]
  );

  const handleAssetPickerUpload = useCallback(
    async (files: File[]) => {
      await uploadFilesToDesktop(files, addAssetPositionRef.current);
    },
    [uploadFilesToDesktop]
  );

  const handleExternalFileDrop = useCallback(
    (files: File[], position: { x: number; y: number }) => {
      void uploadFilesToDesktop(files, position);
    },
    [uploadFilesToDesktop]
  );

  // Returns the world-space coordinates of the canvas viewport center, used
  // when pasting files (no cursor position is available for paste events).
  const getViewportCenterWorld = useCallback(() => {
    const el = canvasWrapperRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const cam = cameraRef.current;
    return {
      x: (rect.width / 2 - cam.x) / cam.zoom,
      y: (rect.height / 2 - cam.y) / cam.zoom,
    };
  }, []);

  // Paste handling for the desktop page. When the chat panel is open the user
  // is asked whether the pasted files should go to the agent or the canvas;
  // when collapsed they are added directly to the canvas.
  const {
    isOpen: isPasteChoiceOpen,
    onOpen: openPasteChoice,
    onOpenChange: onPasteChoiceOpenChange,
    onClose: closePasteChoice,
  } = useDisclosure();
  const pendingPastedFilesRef = useRef<File[]>([]);

  const dispatchFilesToAgent = useCallback((files: File[]) => {
    if (files.length === 0) return;
    if (isChatPanelCollapsed) {
      handleChatPanelCollapseChange(false);
    }
    window.dispatchEvent(
      new CustomEvent("moodio-paste-files-to-chat", { detail: { files } })
    );
  }, [isChatPanelCollapsed, handleChatPanelCollapseChange]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!canEditRef.current) return;
      const items = e.clipboardData?.items;
      if (!items) return;

      // Skip if the paste target is inside an input/textarea/contentEditable —
      // those are normal text-editing contexts (e.g. typing in the chat input
      // or renaming a text asset) and should keep their default behavior.
      const target = e.target as HTMLElement | null;
      if (target) {
        const editable = target.closest(
          'input, textarea, [contenteditable="true"], [contenteditable=""]'
        );
        if (editable) return;
      }

      const allowedTypes = [
        ...siteConfig.upload.allowedImageTypes,
        ...siteConfig.upload.allowedVideoTypes,
        ...siteConfig.upload.allowedAudioTypes,
      ];
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === "file" && allowedTypes.includes(item.type)) {
          const file = item.getAsFile();
          if (file) {
            files.push(
              new File(
                [file],
                `pasted.${file.type.split("/")[1] || "bin"}`,
                { type: file.type }
              )
            );
          }
        }
      }
      if (files.length === 0) return;

      e.preventDefault();

      if (!isChatPanelCollapsed) {
        pendingPastedFilesRef.current = files;
        openPasteChoice();
      } else {
        void uploadFilesToDesktop(files, getViewportCenterWorld());
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [isChatPanelCollapsed, openPasteChoice, uploadFilesToDesktop, getViewportCenterWorld]);

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
          onExternalFileDrop={canEdit ? handleExternalFileDrop : undefined}
          imageEditState={canEdit ? imageEditState : null}
          onImageEditCommit={canEdit ? handleImageEditCommit : undefined}
          onImageEditCancel={canEdit ? handleImageEditCancel : undefined}
          desktopId={desktopId}
          onImageHistoryRestore={canEdit ? handleImageHistoryRestore : undefined}
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
        onCommitTrim={commitTimelineTrim}
        onSplitClip={splitTimelineClip}
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
          scopeDropOverlay
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

      {/* Paste destination chooser — shown when the user pastes files while
          the chat sidebar is open. Asks whether the asset(s) should be sent
          to the agent or dropped onto the canvas. */}
      <Modal
        isOpen={isPasteChoiceOpen}
        onOpenChange={onPasteChoiceOpenChange}
        size="sm"
        onClose={() => {
          pendingPastedFilesRef.current = [];
        }}
      >
        <ModalContent>
          <ModalHeader>{t("pasteDestinationTitle")}</ModalHeader>
          <ModalBody>
            <p className="text-sm text-default-500">
              {t("pasteDestinationDescription")}
            </p>
          </ModalBody>
          <ModalFooter className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="flat"
              startContent={<Bot size={16} />}
              onPress={() => {
                const files = pendingPastedFilesRef.current;
                pendingPastedFilesRef.current = [];
                closePasteChoice();
                dispatchFilesToAgent(files);
              }}
            >
              {t("pasteToAgent")}
            </Button>
            <Button
              color="primary"
              startContent={<LayoutDashboard size={16} />}
              onPress={() => {
                const files = pendingPastedFilesRef.current;
                pendingPastedFilesRef.current = [];
                closePasteChoice();
                void uploadFilesToDesktop(files, getViewportCenterWorld());
              }}
            >
              {t("pasteToDesktop")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
