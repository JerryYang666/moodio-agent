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
import { ArrowLeft, Share2, Pencil, X } from "lucide-react";
import DesktopCanvas from "@/components/desktop/DesktopCanvas";
import DesktopToolbar from "@/components/desktop/DesktopToolbar";
import {
  useDesktopDetail,
  type CameraState,
} from "@/hooks/use-desktop";

const DEFAULT_CAMERA: CameraState = { x: 0, y: 0, zoom: 1 };
const VIEWPORT_SAVE_DEBOUNCE = 2000;

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
  } = useDesktopDetail(desktopId);

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
    },
    [updateAsset]
  );

  const handleAssetDelete = useCallback(
    (assetId: string) => {
      removeAsset(assetId);
    },
    [removeAsset]
  );

  const handleAssetBatchMove = useCallback(
    (moves: Array<{ id: string; posX: number; posY: number }>) => {
      batchUpdateAssets(moves);
    },
    [batchUpdateAssets]
  );

  const handleAssetBatchDelete = useCallback(
    (assetIds: string[]) => {
      for (const id of assetIds) {
        removeAsset(id);
      }
    },
    [removeAsset]
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
    <div className="relative w-full h-full flex flex-col">
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
        />
        <DesktopToolbar
          camera={camera}
          assets={assets}
          onCameraChange={handleCameraChange}
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
