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
import DestinationPickerModal, {
  type DestinationPick,
} from "@/components/chat/destination-picker-modal";
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
import {
  setDesktopViewport,
  clearDesktopViewport,
  findNonOverlappingPosition,
} from "@/lib/desktop/types";
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
import {
  normalizeImageHistory,
  type ImageHistoryEntry,
  type ImageHistoryOperation,
} from "@/lib/desktop/types";
import type {
  ImageEditMode,
  ImageEditPlacement,
} from "@/components/desktop/image-edit-overlay";
import { callImageEditApi } from "@/lib/image/edit-pipeline";
import type { PreparedEditLaunch } from "@/hooks/use-image-edit";

const DEFAULT_CAMERA: CameraState = { x: 0, y: 0, zoom: 1 };
const VIEWPORT_SAVE_DEBOUNCE = 2000;
const DEFAULT_CHAT_PANEL_WIDTH = 380;
const COLLAPSED_CHAT_WIDTH = 48;
// Max assets that can be added in one batch (picker, drop, or paste). Files
// beyond the cap are counted as "skipped" in the post-add summary toast.
const MAX_BATCH_ADD = 10;

export default function DesktopDetailPage({
  params,
}: {
  params: Promise<{ desktopId: string }>;
}) {
  const { desktopId } = use(params);
  const router = useRouter();
  const t = useTranslations("desktop");
  const tCommon = useTranslations("common");
  const tVideo = useTranslations("video");
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
  // Assets with an AI edit running in the background. The overlay closes
  // the moment `prepareSubmit` resolves so the user can keep working on the
  // canvas; we render a per-asset shimmer (DesktopCanvas → MagicProgress)
  // for every entry here, and block same-asset re-edits / drag / resize /
  // rename / delete / z-order until the edit lands. Keyed by assetId so
  // edits on different assets run in parallel.
  const [inFlightEdits, setInFlightEdits] = useState<
    Map<string, { mode: ImageEditMode }>
  >(new Map());
  // Same data, mirrored into a ref so the event listener installed once
  // (for `moodio-image-edit`) can short-circuit same-asset edits without
  // rebinding on every state change.
  const inFlightEditsRef = useRef(inFlightEdits);
  inFlightEditsRef.current = inFlightEdits;
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
      // Block a second edit on the same asset while one is already
      // running. The floating bar hides these buttons for in-flight
      // assets; this is a belt-and-suspenders guard for retry toasts and
      // other callers that dispatch directly.
      if (inFlightEditsRef.current.has(assetId)) return;
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
  const handleImageEditCommitReplace = useCallback(
    (args: {
      assetId: string;
      newImageId: string;
      newImageUrl: string;
      editType: string;
    }) => {
      const { assetId, newImageId, newImageUrl, editType } = args;
      const asset = assetsRef.current.find((a) => a.id === assetId);
      setImageEditState(null);
      if (!asset || asset.assetType !== "image") return;
      const meta = asset.metadata as Record<string, unknown>;
      const prevImageId =
        typeof meta.imageId === "string" ? meta.imageId : null;
      const prevImageUrl = asset.imageUrl ?? null;
      if (!prevImageId) return;
      const prevHistory: ImageHistoryEntry[] = normalizeImageHistory(
        meta.imageHistory
      );
      // Forward state appends a new entry for the prev version (operation =
      // what produced the *new* image, so consumers can label "Redraw · 2h
      // ago" on the row they just came from). Inverse restores the prev
      // (prev imageId, prev history).
      const operation = ((): ImageHistoryOperation | undefined => {
        switch (editType) {
          case "redraw":
          case "erase":
          case "cutout-auto":
          case "cutout-manual":
          case "crop":
          case "angles":
          case "restore":
            return editType;
          default:
            return undefined;
        }
      })();
      const nextHistory: ImageHistoryEntry[] = [
        ...prevHistory,
        {
          imageId: prevImageId,
          ...(operation ? { operation } : {}),
          timestamp: Date.now(),
        },
      ];

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

  // "Save as new" variant: the source asset is untouched. A brand-new image
  // asset is created next to the original with empty imageHistory — the new
  // asset starts its own edit lineage from scratch, exactly like an asset
  // the user just dropped onto the canvas. Undo (Cmd/Ctrl+Z) removes the
  // new asset; redo re-adds it, mirroring the regular asset-creation path.
  const handleImageEditCommitAsNew = useCallback(
    async (args: {
      assetId: string;
      newImageId: string;
      newImageUrl: string;
      editType: string;
    }) => {
      const { assetId, newImageId, editType } = args;
      const source = assetsRef.current.find((a) => a.id === assetId);
      setImageEditState(null);
      if (!source || source.assetType !== "image") return;

      const sourceMeta = source.metadata as Record<string, unknown>;
      const sourceW = source.width ?? 300;
      const sourceH = source.height ?? 300;
      const GAP = 16;

      // Prefer the slot directly to the right; fall back via spiral if it's
      // taken. We feed `findNonOverlappingPosition` the current asset rects
      // so the result doesn't collide with anything — including the source.
      const rects = assetsRef.current.map((a) => ({
        x: a.posX,
        y: a.posY,
        w: a.width ?? 400,
        h: a.height ?? 300,
      }));
      const { x: posX, y: posY } = findNonOverlappingPosition(
        source.posX + sourceW + GAP,
        source.posY,
        sourceW,
        sourceH,
        rects
      );

      // Inherit title/prompt/chatId/aspectRatio for continuity but NOT
      // imageHistory — the user explicitly asked for a fresh asset. The
      // operation that produced this image (editType) is recorded as the
      // initial prompt context so the new asset's own history begins here.
      const nextMeta: Record<string, unknown> = {
        imageId: newImageId,
        status: "generated",
      };
      if (typeof sourceMeta.title === "string") nextMeta.title = sourceMeta.title;
      if (typeof sourceMeta.prompt === "string") nextMeta.prompt = sourceMeta.prompt;
      if (typeof sourceMeta.chatId === "string") nextMeta.chatId = sourceMeta.chatId;
      if (typeof sourceMeta.aspectRatio === "string") {
        nextMeta.aspectRatio = sourceMeta.aspectRatio;
      }
      nextMeta.createdByEdit = editType;
      nextMeta.sourceAssetId = assetId;

      try {
        const res = await fetch(`/api/desktop/${desktopId}/assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assets: [
              {
                assetType: "image",
                metadata: nextMeta,
                posX,
                posY,
                width: sourceW,
                height: sourceH,
              },
            ],
          }),
        });
        if (!res.ok) throw new Error("Failed to create new image asset");
        const data = await res.json();
        const created = (data.assets as EnrichedDesktopAsset[] | undefined)?.[0];
        if (!created) throw new Error("Server returned no asset");

        // Apply optimistically, broadcast, and record for undo — the same
        // triple the normal asset-creation path performs.
        applyRemoteEvent({ type: "asset_added", payload: { asset: created } });
        sendEvent("asset_added", { asset: created });

        const snapshot: EnrichedDesktopAsset = { ...created };
        history.record({
          userId: user?.id ?? "",
          label: { key: "addAsset" },
          targetIds: [created.id],
          forward: () => applyAssetRestore(historyDepsRef.current, snapshot),
          inverse: () => applyAssetRemove(historyDepsRef.current, created.id),
        });

        trackResearch({
          chatId: typeof sourceMeta.chatId === "string" ? sourceMeta.chatId : undefined,
          eventType: "canvas_item_added",
          imageId: newImageId,
          metadata: {
            assetType: "image",
            desktopId,
            source: "image_edit_save_as_new",
            editType,
            sourceAssetId: assetId,
          },
        });
      } catch (error) {
        console.error("Failed to save edit as new asset:", error);
        addToast({
          title: t("imageEdit.errorTitle"),
          description: t("failedToAddImage"),
          color: "danger",
        });
      }
    },
    [
      desktopId,
      applyRemoteEvent,
      sendEvent,
      history,
      user?.id,
      trackResearch,
      t,
    ]
  );

  // Overlay dispatcher — routes each commit by placement. `"replace"`
  // (default) swaps the source asset's imageId and preserves history;
  // `"newAsset"` leaves the source alone and creates a fresh asset beside it.
  const handleImageEditCommit = useCallback(
    (args: {
      assetId: string;
      newImageId: string;
      newImageUrl: string;
      editType: string;
      placement: ImageEditPlacement;
    }) => {
      if (args.placement === "newAsset") {
        void handleImageEditCommitAsNew(args);
      } else {
        handleImageEditCommitReplace(args);
      }
    },
    [handleImageEditCommitReplace, handleImageEditCommitAsNew]
  );

  const handleImageEditCancel = useCallback(() => {
    setImageEditState(null);
  }, []);

  // Launch an AI edit (redraw / erase / cutout / angles) in the background.
  // The overlay has already closed (prepareSubmit resolved); we register the
  // asset as in-flight, fire the model call, and commit the result through
  // the same replace/newAsset handlers a synchronous submit would have
  // used. On failure, a toast with a "Retry" action re-opens a fresh
  // overlay for the same asset + mode (no marks/prompt preserved).
  const handleImageEditLaunch = useCallback(
    (args: {
      assetId: string;
      mode: ImageEditMode;
      apiPayload: PreparedEditLaunch["apiPayload"];
      editType: string;
      placement: ImageEditPlacement;
    }) => {
      const { assetId, mode, apiPayload, editType, placement } = args;
      // Close the overlay and mark this asset as in-flight. Edits on
      // different assets can run in parallel, so we add rather than replace.
      setImageEditState(null);
      setInFlightEdits((prev) => {
        const next = new Map(prev);
        next.set(assetId, { mode });
        return next;
      });

      const clearInFlight = () => {
        setInFlightEdits((prev) => {
          if (!prev.has(assetId)) return prev;
          const next = new Map(prev);
          next.delete(assetId);
          return next;
        });
      };

      void (async () => {
        try {
          const result = await callImageEditApi(apiPayload);
          clearInFlight();
          // Route through the existing commit dispatcher so replace vs
          // save-as-new, undo/redo, broadcast, and telemetry all behave
          // identically to a synchronous submit.
          handleImageEditCommit({
            assetId,
            newImageId: result.imageId,
            newImageUrl: result.imageUrl,
            editType,
            placement,
          });
        } catch (err) {
          clearInFlight();
          const msg = err instanceof Error ? err.message : "Unknown error";
          const description =
            msg === "INSUFFICIENT_CREDITS"
              ? t("imageEdit.insufficientCredits")
              : msg;
          addToast({
            title: t("imageEdit.failedTitle"),
            description,
            color: "danger",
            // Retry re-opens a fresh overlay for the same asset + mode via
            // the existing moodio-image-edit event pipeline. Brush marks,
            // prompt text, and other per-run state are intentionally not
            // preserved — the user decided that on confirm.
            endContent: (
              <Button
                size="sm"
                variant="flat"
                onPress={() => {
                  window.dispatchEvent(
                    new CustomEvent("moodio-image-edit", {
                      detail: { mode, assetId },
                    })
                  );
                }}
              >
                {t("imageEdit.retry")}
              </Button>
            ),
          });
        }
      })();
    },
    [handleImageEditCommit, t]
  );

  // Restore a past image version from the edit-history popover. Mirrors
  // `handleImageEditCommitReplace`: drops the restored imageId from history, appends
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
      const prevHistory: ImageHistoryEntry[] = normalizeImageHistory(
        meta.imageHistory
      );
      // Remove the restored imageId from history (it's no longer "past"),
      // then append the current imageId with operation="restore" so the
      // list still reads "I restored an older version at X time".
      const nextHistory: ImageHistoryEntry[] = [
        ...prevHistory.filter((e) => e.imageId !== restoredImageId),
        {
          imageId: prevImageId,
          operation: "restore",
          timestamp: Date.now(),
        },
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

  // Frame-capture from a paused inline-playing video on the canvas. Places
  // the new image asset immediately to the right of the source video, sized
  // to match the video's rendered width so the pair reads as a single visual
  // unit. The image has already been uploaded by VideoAsset by the time this
  // fires; we only own the canvas-placement half of the flow.
  const handleVideoFrameCaptured = useCallback(
    async (args: {
      sourceAsset: EnrichedDesktopAsset;
      imageId: string;
      imageUrl: string;
      width: number;
      height: number;
    }) => {
      const { sourceAsset, imageId, width: naturalW, height: naturalH } = args;
      const sourceW = sourceAsset.width ?? 300;
      const sourceH = sourceAsset.height ?? 300;
      // Size the new image to fit the same height as the source video while
      // preserving its own aspect ratio, so the pair lines up cleanly.
      const aspect = naturalW > 0 && naturalH > 0 ? naturalW / naturalH : sourceW / sourceH;
      const newH = sourceH;
      const newW = Math.max(50, Math.round(newH * aspect));
      const GAP = 16;
      const posX = sourceAsset.posX + sourceW + GAP;
      const posY = sourceAsset.posY;

      try {
        const res = await fetch(`/api/desktop/${desktopId}/assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assets: [
              {
                assetType: "image",
                metadata: {
                  imageId,
                  title: tVideo("frameCapture"),
                  prompt: "",
                  status: "generated",
                  sourceAssetId: sourceAsset.id,
                },
                posX,
                posY,
                width: newW,
                height: newH,
              },
            ],
          }),
        });
        if (!res.ok) throw new Error("Failed to add frame capture to desktop");
        const data = await res.json();
        window.dispatchEvent(
          new CustomEvent("desktop-asset-added", {
            detail: { assets: data.assets, desktopId },
          })
        );
      } catch (error) {
        console.error("Failed to add frame capture to desktop:", error);
        addToast({ title: t("failedToAddImage"), color: "danger" });
      }
    },
    [desktopId, t, tVideo]
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

  // Save-to-collection state (right-click menu + floating action bar)
  const [saveToCollectionIds, setSaveToCollectionIds] = useState<string[] | null>(null);
  const handleSaveToCollectionRequest = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setSaveToCollectionIds(ids);
  }, []);
  const handleSaveToCollectionConfirm = useCallback(
    async (pick: DestinationPick) => {
      const ids = saveToCollectionIds;
      setSaveToCollectionIds(null);
      if (!ids || ids.length === 0) return;
      try {
        const res = await fetch(
          `/api/desktop/${desktopId}/assets/save-to-collection`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              assetIds: ids,
              collectionId: pick.collectionId,
              folderId: pick.folderId,
            }),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || "Failed to save to collection");
        }
        const savedCount = Array.isArray(data.saved) ? data.saved.length : 0;
        const duplicateCount = Array.isArray(data.duplicates)
          ? data.duplicates.length
          : 0;
        const skippedCount = Array.isArray(data.skipped)
          ? data.skipped.length
          : 0;

        if (savedCount > 0) {
          const suffix =
            duplicateCount || skippedCount
              ? ` (${[
                  duplicateCount ? `${duplicateCount} already there` : null,
                  skippedCount ? `${skippedCount} skipped` : null,
                ]
                  .filter(Boolean)
                  .join(", ")})`
              : "";
          addToast({
            title: `Saved ${savedCount} to ${pick.collectionName}${suffix}`,
            color: "success",
          });
        } else if (duplicateCount > 0 && skippedCount === 0) {
          addToast({
            title: `Already in ${pick.collectionName}`,
            color: "warning",
          });
        } else {
          addToast({
            title: "Nothing to save",
            description:
              skippedCount > 0
                ? "Selected assets can't be saved to a collection."
                : undefined,
            color: "warning",
          });
        }
      } catch (err) {
        addToast({
          title: "Failed to save",
          description: err instanceof Error ? err.message : undefined,
          color: "danger",
        });
      }
    },
    [desktopId, saveToCollectionIds]
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

  // Build a POST payload for a single picked library asset. Returns null if
  // the asset's type isn't supported on the desktop (e.g. public_* / element).
  const buildPickedAssetPayload = (
    asset: AssetSummary,
    pos: { x: number; y: number }
  ): Record<string, unknown> | null => {
    const isVideo = asset.assetType === "video";
    const isAudio = asset.assetType === "audio";
    const isImage = !asset.assetType || asset.assetType === "image";
    if (!isVideo && !isAudio && !isImage) return null;

    const metadata: Record<string, unknown> = {
      imageId: asset.imageId,
      chatId: asset.chatId ?? undefined,
      title:
        asset.generationDetails?.title ||
        (isAudio ? "Audio" : isVideo ? "Video" : "Image"),
      prompt: asset.generationDetails?.prompt || "",
      status: asset.generationDetails?.status || "generated",
    };
    if (isVideo && asset.assetId) metadata.videoId = asset.assetId;
    if (isAudio && asset.assetId) metadata.audioId = asset.assetId;

    const payload: Record<string, unknown> = {
      assetType: isAudio ? "audio" : isVideo ? "video" : "image",
      metadata,
      posX: pos.x,
      posY: pos.y,
    };
    if (isAudio) {
      payload.width = 300;
      payload.height = 200;
    }
    return payload;
  };

  const handleAssetPickerSelect = useCallback(
    async (asset: AssetSummary) => {
      const payload = buildPickedAssetPayload(asset, addAssetPositionRef.current);
      if (!payload) {
        addToast({ title: t("failedToAddAsset"), color: "danger" });
        return;
      }
      try {
        const res = await fetch(`/api/desktop/${desktopId}/assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assets: [payload] }),
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
    [desktopId, t]
  );

  // Multi-select confirm from the asset picker. Lays the picks out in a
  // 3-column grid anchored at the add-asset position, skipping any types the
  // desktop can't render. Supported types are already enforced by the
  // picker's acceptTypes filter, but the grid math and summary toast match
  // the drop/paste flow for consistency.
  const handleAssetPickerSelectMultiple = useCallback(
    async (assets: AssetSummary[]) => {
      const origin = addAssetPositionRef.current;
      const capped = assets.slice(0, MAX_BATCH_ADD);
      const overflow = Math.max(0, assets.length - MAX_BATCH_ADD);
      const GRID_COLS = 3;
      const CELL_W = 320;
      const CELL_H = 320;

      let skipped = overflow;
      const payloads: Record<string, unknown>[] = [];
      capped.forEach((asset, index) => {
        const cell = {
          x: origin.x + (index % GRID_COLS) * CELL_W,
          y: origin.y + Math.floor(index / GRID_COLS) * CELL_H,
        };
        const payload = buildPickedAssetPayload(asset, cell);
        if (payload) payloads.push(payload);
        else skipped++;
      });

      if (payloads.length === 0) {
        if (skipped > 0) {
          addToast({
            title: t("assetsAddedWithSkipped", { added: 0, skipped }),
            color: "warning",
          });
        }
        return;
      }

      try {
        const res = await fetch(`/api/desktop/${desktopId}/assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assets: payloads }),
        });
        if (!res.ok) throw new Error("Failed to add assets to desktop");
        const data = await res.json();
        window.dispatchEvent(
          new CustomEvent("desktop-asset-added", {
            detail: { assets: data.assets, desktopId },
          })
        );
        if (skipped > 0) {
          addToast({
            title: t("assetsAddedWithSkipped", {
              added: payloads.length,
              skipped,
            }),
            color: "warning",
          });
        }
      } catch (error) {
        console.error("Failed to add picked assets to desktop:", error);
        addToast({ title: t("failedToAddAsset"), color: "danger" });
      }
    },
    [desktopId, t]
  );

  // Upload arbitrary files (image/video/audio) and place each as a new asset
  // on the canvas. Shared by the asset-picker upload, the canvas drag-drop,
  // and the paste-to-desktop flow.
  //
  // Up to MAX_BATCH_ADD files are accepted; any beyond the cap and any with
  // unsupported MIME types are counted as skipped and summarized in a toast.
  // When more than one file is added, they are laid out in a 3-column grid
  // anchored at `position` (top-left), wrapping into as many rows as needed.
  //
  // To make the UI feel responsive even when the upload roundtrip takes a
  // while, we insert an ephemeral placeholder asset locally (using a blob
  // URL for images so the user sees their file immediately) and swap it for
  // the real server-assigned asset once the upload + DB insert finish. This
  // mirrors the existing __generating_table__ placeholder pattern. Files
  // are uploaded in parallel so multiple drops/pastes don't queue.
  const uploadFilesToDesktop = useCallback(
    async (rawFiles: File[], position: { x: number; y: number }) => {
      const allowedTypes = [
        ...siteConfig.upload.allowedImageTypes,
        ...siteConfig.upload.allowedVideoTypes,
        ...siteConfig.upload.allowedAudioTypes,
      ];

      const supported: File[] = [];
      let skipped = 0;
      for (const file of rawFiles) {
        if (allowedTypes.includes(file.type)) supported.push(file);
        else skipped++;
      }

      // Enforce the 10-item-per-batch cap. Anything over the cap is counted
      // as skipped so the summary toast can surface it.
      const overflow = Math.max(0, supported.length - MAX_BATCH_ADD);
      const files = supported.slice(0, MAX_BATCH_ADD);

      if (files.length === 0) {
        if (skipped > 0) {
          addToast({
            title: t("assetsAddedWithSkipped", { added: 0, skipped }),
            color: "warning",
          });
        }
        return;
      }

      // 3-column grid. The cell size is deliberately uniform so assets line
      // up even when their underlying aspect ratios differ.
      const GRID_COLS = 3;
      const CELL_W = 320;
      const CELL_H = 320;
      const cellPosition = (index: number) => ({
        x: position.x + (index % GRID_COLS) * CELL_W,
        y: position.y + Math.floor(index / GRID_COLS) * CELL_H,
      });

      let addedCount = 0;
      const uploadOne = async (file: File, index: number) => {
        const cellPos = cellPosition(index);
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
          posX: cellPos.x,
          posY: cellPos.y,
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
              posX: cellPos.x,
              posY: cellPos.y,
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
              posX: cellPos.x,
              posY: cellPos.y,
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
              posX: cellPos.x,
              posY: cellPos.y,
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
          addedCount++;
        } catch (error) {
          console.error("Failed to add uploaded asset to desktop:", error);
          addToast({ title: t("failedToAddAsset"), color: "danger" });
          removePlaceholder();
        }
      };

      await Promise.all(files.map((f, i) => uploadOne(f, i)));

      // Per-upload failure already surfaces its own error toast, so only show
      // the batch summary when the skip/overflow count makes it informative.
      const totalSkipped = skipped + overflow;
      if (totalSkipped > 0 && addedCount > 0) {
        addToast({
          title: t("assetsAddedWithSkipped", {
            added: addedCount,
            skipped: totalSkipped,
          }),
          color: "warning",
        });
      }
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
          onSaveToCollection={handleSaveToCollectionRequest}
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
          onImageEditLaunch={canEdit ? handleImageEditLaunch : undefined}
          inFlightEdits={inFlightEdits}
          onImageEditCancel={canEdit ? handleImageEditCancel : undefined}
          desktopId={desktopId}
          onImageHistoryRestore={canEdit ? handleImageHistoryRestore : undefined}
          onVideoFrameCaptured={canEdit ? handleVideoFrameCaptured : undefined}
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

      {/* Destination picker for "Save to collection…" (right-click menu + floating action bar) */}
      <DestinationPickerModal
        isOpen={saveToCollectionIds !== null}
        onOpenChange={() => setSaveToCollectionIds(null)}
        onConfirm={handleSaveToCollectionConfirm}
      />

      {/* Asset Picker for right-click "Add Asset" */}
      <AssetPickerModal
        isOpen={isAssetPickerOpen}
        onOpenChange={toggleAssetPicker}
        onSelect={handleAssetPickerSelect}
        onSelectMultiple={handleAssetPickerSelectMultiple}
        onUpload={handleAssetPickerUpload}
        acceptTypes={["image", "video", "audio"]}
        multiSelect
        maxSelectCount={MAX_BATCH_ADD}
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
