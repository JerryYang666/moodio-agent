"use client";

import { useEffect, useState, useCallback, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Spinner } from "@heroui/spinner";
import { Chip } from "@heroui/chip";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import { Select, SelectItem } from "@heroui/select";
import { addToast } from "@heroui/toast";
import { Tooltip } from "@heroui/tooltip";
import { ArrowLeft, Share2, Pencil, X, Wifi, WifiOff } from "lucide-react";
import DesktopCanvas from "@/components/desktop/DesktopCanvas";
import DesktopToolbar from "@/components/desktop/DesktopToolbar";
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

const DEFAULT_CAMERA: CameraState = { x: 0, y: 0, zoom: 1 };
const VIEWPORT_SAVE_DEBOUNCE = 2000;
const DEFAULT_CHAT_PANEL_WIDTH = 380;
const COLLAPSED_CHAT_WIDTH = 48;

function userIdToHslColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

export default function DesktopDetailPage({
  params,
}: {
  params: Promise<{ desktopId: string }>;
}) {
  const { desktopId } = use(params);
  const router = useRouter();
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

  const handleRemoteEvent = useCallback(
    (event: RemoteEvent) => {
      applyRemoteEvent(event);
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

  const [camera, setCamera] = useState<CameraState>(DEFAULT_CAMERA);
  const viewportSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  // Share modal state
  const {
    isOpen: isShareOpen,
    onOpen: onShareOpen,
    onOpenChange: onShareOpenChange,
  } = useDisclosure();
  const [searchEmail, setSearchEmail] = useState("");
  const [searchedUser, setSearchedUser] = useState<User | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selectedPermission, setSelectedPermission] = useState<
    "viewer" | "collaborator"
  >("viewer");
  const [isSharing, setIsSharing] = useState(false);

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
    };
  }, [saveViewport]);

  const handleAssetMove = useCallback(
    (assetId: string, posX: number, posY: number) => {
      updateAsset(assetId, { posX, posY });
      sendEvent("asset_moved", { assetId, posX, posY });
    },
    [updateAsset, sendEvent]
  );

  const handleAssetDelete = useCallback(
    (assetId: string) => {
      removeAsset(assetId);
      sendEvent("asset_removed", { assetId });
    },
    [removeAsset, sendEvent]
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
        removeAsset(id);
        sendEvent("asset_removed", { assetId: id });
      }
    },
    [removeAsset, sendEvent]
  );

  const handleOpenChat = useCallback(
    (chatId: string) => {
      router.push(`/chat/${chatId}`);
    },
    [router]
  );

  const handleSearchUser = async () => {
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
  };

  const handleShare = async () => {
    if (!searchedUser) return;
    setIsSharing(true);
    try {
      const res = await fetch(`/api/desktop/${desktopId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sharedWithUserId: searchedUser.id,
          permission: selectedPermission,
        }),
      });
      if (res.ok) {
        await fetchDetail();
        setSearchEmail("");
        setSearchedUser(null);
        setSelectedPermission("viewer");
        addToast({
          title: "Shared",
          description: "Desktop shared successfully",
          color: "success",
        });
      }
    } catch {
      addToast({
        title: "Error",
        description: "Failed to share desktop",
        color: "danger",
      });
    } finally {
      setIsSharing(false);
    }
  };

  const handleRemoveShare = async (userId: string) => {
    try {
      const res = await fetch(`/api/desktop/${desktopId}/share/${userId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchDetail();
      }
    } catch {
      console.error("Error removing share");
    }
  };

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
        <p className="text-default-500">Desktop not found</p>
      </div>
    );
  }

  const { desktop, assets, shares } = detail;
  const canEdit = desktop.permission === "owner" || desktop.permission === "collaborator";

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
        {connectedUsers.length > 0 && (
          <div className="flex items-center -space-x-1.5">
            {connectedUsers.map((user) => (
              <Tooltip
                key={user.userId}
                content={
                  <div className="text-xs py-1 px-0.5">
                    {user.firstName && <div className="font-semibold">{user.firstName}</div>}
                    <div className="text-default-400">{user.email}</div>
                    {user.sessionCount > 1 && (
                      <div className="text-default-500 mt-0.5">{user.sessionCount} tabs open</div>
                    )}
                  </div>
                }
                placement="bottom"
              >
                <div
                  className="relative w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white border-2 border-background cursor-default"
                  style={{ backgroundColor: userIdToHslColor(user.userId) }}
                >
                  {user.initial}
                  {user.sessionCount > 1 && (
                    <span className="absolute -top-1 -right-1 text-[8px] bg-default-800 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center">
                      {user.sessionCount}
                    </span>
                  )}
                </div>
              </Tooltip>
            ))}
          </div>
        )}

        {/* Connection state indicator */}
        {connectionState === "connected" && (
          <div className="text-success" title="Live sync active">
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
            Share
          </Button>
        )}
      </div>

      {/* Degraded-mode banner */}
      {(connectionState === "polling" || connectionState === "reconnecting") && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-warning-50 border-b border-warning-200 text-warning-700 text-xs z-20 shrink-0">
          <WifiOff size={14} />
          {connectionState === "polling"
            ? "Live sync unavailable \u2014 updates every 10s"
            : "Reconnecting to live sync\u2026"}
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 relative">
        <DesktopCanvas
          assets={assets}
          camera={camera}
          permission={desktop.permission}
          onCameraChange={handleCameraChange}
          onAssetMove={handleAssetMove}
          onAssetBatchMove={handleAssetBatchMove}
          onAssetDelete={canEdit ? handleAssetDelete : undefined}
          onAssetBatchDelete={canEdit ? handleAssetBatchDelete : undefined}
          onOpenChat={handleOpenChat}
          sendEvent={sendEvent}
          remoteCursors={remoteCursors}
          remoteSelections={remoteSelections}
        />
        <DesktopToolbar
          camera={camera}
          assets={assets}
          onCameraChange={handleCameraChange}
        />
      </div>
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
        />
      </div>

      {/* Share Modal */}
      <Modal isOpen={isShareOpen} onOpenChange={onShareOpenChange} size="2xl">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Share Desktop</ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      label="Search user"
                      placeholder="Enter email address"
                      value={searchEmail}
                      onValueChange={setSearchEmail}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSearchUser();
                      }}
                      errorMessage={searchError}
                      isInvalid={!!searchError}
                      className="flex-1"
                    />
                    <Button
                      color="primary"
                      variant="flat"
                      onPress={handleSearchUser}
                      isLoading={isSearching}
                      className="mt-2 h-10"
                    >
                      Search
                    </Button>
                  </div>

                  {searchedUser && (
                    <div className="flex flex-col gap-2 p-4 bg-default-50 rounded-lg border border-divider">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sm">User found</p>
                          <p className="text-sm">{searchedUser.email}</p>
                        </div>
                        {desktop.userId === searchedUser.id ? (
                          <Chip color="warning" variant="flat" size="sm">
                            Owner
                          </Chip>
                        ) : shares.some(
                            (s) => s.sharedWithUserId === searchedUser.id
                          ) ? (
                          <Chip color="primary" variant="flat" size="sm">
                            Already shared
                          </Chip>
                        ) : (
                          <Chip color="success" variant="flat" size="sm">
                            Available
                          </Chip>
                        )}
                      </div>

                      {desktop.userId !== searchedUser.id && (
                        <div className="flex gap-2 mt-2 items-end">
                          <Select
                            label="Permission"
                            selectedKeys={[selectedPermission]}
                            onChange={(e) =>
                              setSelectedPermission(
                                e.target.value as "viewer" | "collaborator"
                              )
                            }
                            className="flex-1"
                            size="sm"
                          >
                            <SelectItem key="viewer">Viewer</SelectItem>
                            <SelectItem key="collaborator">
                              Collaborator
                            </SelectItem>
                          </Select>
                          <Button
                            color="primary"
                            onPress={handleShare}
                            isLoading={isSharing}
                            className="h-10"
                          >
                            Share
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {shares.length > 0 && (
                    <div className="mt-6">
                      <h3 className="text-sm font-semibold mb-3">
                        Currently shared with
                      </h3>
                      <div className="space-y-2">
                        {shares.map((share) => (
                          <div
                            key={share.id}
                            className="flex items-center justify-between p-3 bg-default-100 rounded-lg"
                          >
                            <div>
                              <p className="font-medium">{share.email}</p>
                              <p className="text-xs text-default-500 capitalize">
                                {share.permission}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="light"
                              color="danger"
                              startContent={<X size={16} />}
                              onPress={() =>
                                handleRemoveShare(share.sharedWithUserId)
                              }
                            >
                              Remove
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Close
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
