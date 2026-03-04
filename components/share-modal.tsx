"use client";

import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Chip } from "@heroui/chip";
import { Select, SelectItem } from "@heroui/select";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { X } from "lucide-react";
import type { ShareEntry, useShareModal } from "@/hooks/use-share-modal";
import {
  PERMISSION_VIEWER,
  PERMISSION_COLLABORATOR,
  type SharePermission,
} from "@/lib/permissions";

interface ShareModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  ownerId: string;
  shares: ShareEntry[];
  share: ReturnType<typeof useShareModal>;
}

export default function ShareModal({
  isOpen,
  onOpenChange,
  title,
  ownerId,
  shares,
  share,
}: ShareModalProps) {
  const tCommon = useTranslations("common");
  const tShare = useTranslations("share");

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="2xl">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>{title}</ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                <div className="flex flex-col gap-4">
                  <div className="flex gap-2">
                    <Input
                      label={tShare("searchUser")}
                      placeholder={tShare("enterEmailAddress")}
                      value={share.searchEmail}
                      onValueChange={share.setSearchEmail}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") share.handleSearchUser();
                      }}
                      errorMessage={share.searchError}
                      isInvalid={!!share.searchError}
                      className="flex-1"
                    />
                    <Button
                      color="primary"
                      variant="flat"
                      onPress={share.handleSearchUser}
                      isLoading={share.isSearching}
                      className="mt-2 h-10"
                    >
                      {tCommon("search")}
                    </Button>
                  </div>

                  {share.searchedUser && (
                    <div className="flex flex-col gap-2 p-4 bg-default-50 rounded-lg border border-divider">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sm">
                            {tShare("userFound")}
                          </p>
                          <p className="text-sm">{share.searchedUser.email}</p>
                        </div>
                        {ownerId === share.searchedUser.id ? (
                          <Chip color="warning" variant="flat" size="sm">
                            {tShare("owner")}
                          </Chip>
                        ) : shares.some(
                            (s) =>
                              s.sharedWithUserId === share.searchedUser!.id
                          ) ? (
                          <Chip color="primary" variant="flat" size="sm">
                            {tShare("alreadyShared")}
                          </Chip>
                        ) : (
                          <Chip color="success" variant="flat" size="sm">
                            {tShare("available")}
                          </Chip>
                        )}
                      </div>

                      {ownerId !== share.searchedUser.id && (
                        <div className="flex gap-2 mt-2 items-end">
                          <Select
                            label={tShare("permission")}
                            selectedKeys={[share.selectedPermission]}
                            onChange={(e) =>
                              share.setSelectedPermission(
                                e.target.value as SharePermission
                              )
                            }
                            className="flex-1"
                            size="sm"
                          >
                            <SelectItem key={PERMISSION_VIEWER}>
                              {tShare("viewer")}
                            </SelectItem>
                            <SelectItem key={PERMISSION_COLLABORATOR}>
                              {tShare("collaborator")}
                            </SelectItem>
                          </Select>
                          <Button
                            color="primary"
                            onPress={share.handleShare}
                            isLoading={share.isSharing}
                            className="h-10"
                          >
                            {tCommon("share")}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {shares.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold mb-3">
                      {tShare("currentlySharedWith")}
                    </h3>
                    <div className="space-y-2">
                      {shares.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center justify-between p-3 bg-default-100 rounded-lg"
                        >
                          <div>
                            <p className="font-medium">{s.email}</p>
                            <p className="text-xs text-default-500 capitalize">
                              {s.permission}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="light"
                            color="danger"
                            startContent={<X size={16} />}
                            onPress={() =>
                              share.handleRemoveShare(s.sharedWithUserId)
                            }
                          >
                            {tCommon("remove")}
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
                {tCommon("close")}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
