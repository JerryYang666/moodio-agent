"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Chip } from "@heroui/chip";
import { Tab, Tabs } from "@heroui/tabs";
import { Divider } from "@heroui/divider";
import { Spinner } from "@heroui/spinner";
import { addToast } from "@heroui/toast";
import { X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTeams } from "@/hooks/use-team";
import TeamMemberPicker from "@/components/team-member-picker";
import {
  PERMISSION_VIEWER,
  PERMISSION_COLLABORATOR,
  type SharePermission,
} from "@/lib/permissions";
import type {
  ProductionTableColumn,
  ProductionTableRow,
} from "@/lib/production-table/types";
import type { ShareEntry } from "@/hooks/use-share-modal";

interface EnrichedTableShare {
  id: string;
  sharedWithUserId: string;
  permission: string;
  sharedAt: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

interface EnrichedColumnShare {
  id: string;
  columnId: string;
  sharedWithUserId: string;
  sharedAt: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

interface EnrichedRowShare {
  id: string;
  rowId: string;
  sharedWithUserId: string;
  sharedAt: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

interface ShareData {
  tableShares: EnrichedTableShare[];
  columnShares: EnrichedColumnShare[];
  rowShares: EnrichedRowShare[];
}

interface SearchedUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

interface ProductionTableShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableId: string;
  ownerId: string;
  columns: ProductionTableColumn[];
  rows: ProductionTableRow[];
  isOwner: boolean;
}

function displayName(
  email: string,
  firstName?: string | null,
  lastName?: string | null
) {
  const full = [firstName, lastName].filter(Boolean).join(" ");
  return full || email;
}

export function ProductionTableShareModal({
  isOpen,
  onClose,
  tableId,
  ownerId,
  columns,
  rows,
  isOwner,
}: ProductionTableShareModalProps) {
  const t = useTranslations("productionTable");
  const tShare = useTranslations("share");
  const tCommon = useTranslations("common");

  const { user } = useAuth();
  const { isInAnyTeam } = useTeams();
  const currentUserId = user?.id ?? "";

  const [shares, setShares] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState("table");

  // Team picker state
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [bulkPermission, setBulkPermission] = useState<SharePermission>(PERMISSION_VIEWER);
  const [isBulkSharing, setIsBulkSharing] = useState(false);

  // Email search state
  const [searchEmail, setSearchEmail] = useState("");
  const [searchedUser, setSearchedUser] = useState<SearchedUser | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selectedPermission, setSelectedPermission] = useState<SharePermission>(PERMISSION_VIEWER);
  const [isSharing, setIsSharing] = useState(false);

  // Column/row selection for granular tabs
  const [colShareIds, setColShareIds] = useState<string[]>([]);
  const [rowShareIds, setRowShareIds] = useState<string[]>([]);

  const tableSharesAsShareEntries: ShareEntry[] = (shares?.tableShares ?? []).map((s) => ({
    id: s.id,
    sharedWithUserId: s.sharedWithUserId,
    permission: s.permission as SharePermission,
    sharedAt: new Date(s.sharedAt),
    email: s.email,
  }));

  // For column/row tabs, only exclude users who are already collaborator/owner
  // (viewers should still be selectable for granular grants)
  const granularSharesAsShareEntries: ShareEntry[] = (shares?.tableShares ?? [])
    .filter((s) => s.permission !== PERMISSION_VIEWER)
    .map((s) => ({
      id: s.id,
      sharedWithUserId: s.sharedWithUserId,
      permission: s.permission as SharePermission,
      sharedAt: new Date(s.sharedAt),
      email: s.email,
    }));

  const fetchShares = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/production-table/${tableId}/share`);
      if (!res.ok) throw new Error();
      setShares(await res.json());
    } catch {
      addToast({ title: "Failed to load shares", color: "danger" });
    } finally {
      setLoading(false);
    }
  }, [tableId]);

  useEffect(() => {
    if (isOpen) {
      fetchShares();
      setSelectedUserIds(new Set());
      setSearchEmail("");
      setSearchedUser(null);
      setSearchError("");
      setColShareIds([]);
      setRowShareIds([]);
    }
  }, [isOpen, fetchShares]);

  // --- Shared helpers ---

  const toggleUser = useCallback((userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const toggleTeam = useCallback((memberUserIds: string[]) => {
    setSelectedUserIds((prev) => {
      const allSelected = memberUserIds.every((uid) => prev.has(uid));
      const next = new Set(prev);
      if (allSelected) memberUserIds.forEach((uid) => next.delete(uid));
      else memberUserIds.forEach((uid) => next.add(uid));
      return next;
    });
  }, []);

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
        if (data.user) setSearchedUser(data.user);
        else setSearchError("User not found");
      } else {
        setSearchError("Failed to search user");
      }
    } catch {
      setSearchError("Error searching user");
    } finally {
      setIsSearching(false);
    }
  }, [searchEmail]);

  // --- Table-level sharing ---

  const handleBulkTableShare = useCallback(async () => {
    if (selectedUserIds.size === 0) return;
    setIsBulkSharing(true);
    try {
      const res = await fetch(`/api/production-table/${tableId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sharedWithUserIds: Array.from(selectedUserIds),
          permission: bulkPermission,
        }),
      });
      if (res.ok) {
        await fetchShares();
        setSelectedUserIds(new Set());
        addToast({ title: `Shared with ${selectedUserIds.size} member(s)`, color: "success" });
      }
    } catch {
      addToast({ title: "Failed to share", color: "danger" });
    } finally {
      setIsBulkSharing(false);
    }
  }, [selectedUserIds, bulkPermission, tableId, fetchShares]);

  const handleEmailTableShare = useCallback(async () => {
    if (!searchedUser) return;
    setIsSharing(true);
    try {
      const res = await fetch(`/api/production-table/${tableId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sharedWithUserId: searchedUser.id,
          permission: selectedPermission,
        }),
      });
      if (res.ok) {
        await fetchShares();
        setSearchEmail("");
        setSearchedUser(null);
        setSelectedPermission(PERMISSION_VIEWER);
        addToast({ title: "Shared successfully", color: "success" });
      }
    } catch {
      addToast({ title: "Failed to share", color: "danger" });
    } finally {
      setIsSharing(false);
    }
  }, [searchedUser, selectedPermission, tableId, fetchShares]);

  const handleRemoveTableShare = useCallback(
    async (targetUserId: string) => {
      try {
        const res = await fetch(
          `/api/production-table/${tableId}/share/${targetUserId}`,
          { method: "DELETE" }
        );
        if (!res.ok) throw new Error();
        fetchShares();
      } catch {
        addToast({ title: "Failed to remove share", color: "danger" });
      }
    },
    [tableId, fetchShares]
  );

  // --- Column-level sharing ---

  const handleBulkColumnShare = useCallback(async () => {
    if (selectedUserIds.size === 0 || colShareIds.length === 0) return;
    setIsBulkSharing(true);
    try {
      const res = await fetch(`/api/production-table/${tableId}/share/columns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          columnIds: colShareIds,
          sharedWithUserIds: Array.from(selectedUserIds),
        }),
      });
      if (res.ok) {
        await fetchShares();
        setSelectedUserIds(new Set());
        setColShareIds([]);
        addToast({ title: "Column access granted", color: "success" });
      }
    } catch {
      addToast({ title: "Failed to add column shares", color: "danger" });
    } finally {
      setIsBulkSharing(false);
    }
  }, [selectedUserIds, colShareIds, tableId, fetchShares]);

  const handleEmailColumnShare = useCallback(async () => {
    if (!searchedUser || colShareIds.length === 0) return;
    setIsSharing(true);
    try {
      const res = await fetch(`/api/production-table/${tableId}/share/columns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          columnIds: colShareIds,
          sharedWithUserId: searchedUser.id,
        }),
      });
      if (res.ok) {
        await fetchShares();
        setSearchEmail("");
        setSearchedUser(null);
        setColShareIds([]);
        addToast({ title: "Column access granted", color: "success" });
      }
    } catch {
      addToast({ title: "Failed to add column shares", color: "danger" });
    } finally {
      setIsSharing(false);
    }
  }, [searchedUser, colShareIds, tableId, fetchShares]);

  const handleRemoveColumnShare = useCallback(
    async (columnId: string, targetUserId: string) => {
      try {
        const res = await fetch(
          `/api/production-table/${tableId}/share/columns?columnId=${columnId}&userId=${targetUserId}`,
          { method: "DELETE" }
        );
        if (!res.ok) throw new Error();
        fetchShares();
      } catch {
        addToast({ title: "Failed to remove column share", color: "danger" });
      }
    },
    [tableId, fetchShares]
  );

  // --- Row-level sharing ---

  const handleBulkRowShare = useCallback(async () => {
    if (selectedUserIds.size === 0 || rowShareIds.length === 0) return;
    setIsBulkSharing(true);
    try {
      const res = await fetch(`/api/production-table/${tableId}/share/rows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rowIds: rowShareIds,
          sharedWithUserIds: Array.from(selectedUserIds),
        }),
      });
      if (res.ok) {
        await fetchShares();
        setSelectedUserIds(new Set());
        setRowShareIds([]);
        addToast({ title: "Row access granted", color: "success" });
      }
    } catch {
      addToast({ title: "Failed to add row shares", color: "danger" });
    } finally {
      setIsBulkSharing(false);
    }
  }, [selectedUserIds, rowShareIds, tableId, fetchShares]);

  const handleEmailRowShare = useCallback(async () => {
    if (!searchedUser || rowShareIds.length === 0) return;
    setIsSharing(true);
    try {
      const res = await fetch(`/api/production-table/${tableId}/share/rows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rowIds: rowShareIds,
          sharedWithUserId: searchedUser.id,
        }),
      });
      if (res.ok) {
        await fetchShares();
        setSearchEmail("");
        setSearchedUser(null);
        setRowShareIds([]);
        addToast({ title: "Row access granted", color: "success" });
      }
    } catch {
      addToast({ title: "Failed to add row shares", color: "danger" });
    } finally {
      setIsSharing(false);
    }
  }, [searchedUser, rowShareIds, tableId, fetchShares]);

  const handleRemoveRowShare = useCallback(
    async (rowId: string, targetUserId: string) => {
      try {
        const res = await fetch(
          `/api/production-table/${tableId}/share/rows?rowId=${rowId}&userId=${targetUserId}`,
          { method: "DELETE" }
        );
        if (!res.ok) throw new Error();
        fetchShares();
      } catch {
        addToast({ title: "Failed to remove row share", color: "danger" });
      }
    },
    [tableId, fetchShares]
  );

  // --- Reusable sub-sections ---

  const renderTeamPicker = (actionLabel: string, onShare: () => void, disabled?: boolean) => (
    <>
      {isInAnyTeam && isOwner && (
        <div>
          <h3 className="text-sm font-semibold mb-2">{tShare("shareWithTeam")}</h3>
          <TeamMemberPicker
            ownerId={ownerId}
            currentUserId={currentUserId}
            shares={selectedTab === "table" ? tableSharesAsShareEntries : granularSharesAsShareEntries}
            selectedUserIds={selectedUserIds}
            onToggleUser={toggleUser}
            onToggleTeam={toggleTeam}
          />
          {selectedUserIds.size > 0 && (
            <div className="flex items-center gap-2 mt-3">
              <Chip size="sm" variant="flat" color="primary">
                {tShare("membersSelected", { count: selectedUserIds.size })}
              </Chip>
              {selectedTab === "table" && (
                <Select
                  label={tShare("permission")}
                  selectedKeys={[bulkPermission]}
                  onChange={(e) => setBulkPermission(e.target.value as SharePermission)}
                  className="flex-1"
                  size="sm"
                >
                  <SelectItem key={PERMISSION_VIEWER}>{tShare("viewer")}</SelectItem>
                  <SelectItem key={PERMISSION_COLLABORATOR}>{tShare("collaborator")}</SelectItem>
                </Select>
              )}
              <Button
                color="primary"
                onPress={onShare}
                isLoading={isBulkSharing}
                isDisabled={disabled}
                className="h-10"
              >
                {actionLabel}
              </Button>
            </div>
          )}
        </div>
      )}
      {isInAnyTeam && isOwner && <Divider />}
    </>
  );

  const renderEmailSearch = (actionLabel: string, onShare: () => void, disabled?: boolean) => (
    <div>
      <h3 className="text-sm font-semibold mb-2">{tShare("shareByEmail")}</h3>
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Input
            label={tShare("searchUser")}
            placeholder={tShare("enterEmailAddress")}
            value={searchEmail}
            onValueChange={setSearchEmail}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearchUser(); }}
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
            {tCommon("search")}
          </Button>
        </div>

        {searchedUser && (
          <div className="flex flex-col gap-2 p-4 bg-default-50 rounded-lg border border-divider">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm">{tShare("userFound")}</p>
                <p className="text-sm">{searchedUser.email}</p>
              </div>
              {ownerId === searchedUser.id ? (
                <Chip color="warning" variant="flat" size="sm">{tShare("owner")}</Chip>
              ) : (selectedTab === "table"
                ? shares?.tableShares.some((s) => s.sharedWithUserId === searchedUser!.id)
                : shares?.tableShares.some((s) => s.sharedWithUserId === searchedUser!.id && s.permission !== PERMISSION_VIEWER)
              ) ? (
                <Chip color="primary" variant="flat" size="sm">{tShare("alreadyShared")}</Chip>
              ) : (
                <Chip color="success" variant="flat" size="sm">{tShare("available")}</Chip>
              )}
            </div>

            {ownerId !== searchedUser.id && isOwner && (
              <div className="flex gap-2 mt-2 items-end">
                {selectedTab === "table" && (
                  <Select
                    label={tShare("permission")}
                    selectedKeys={[selectedPermission]}
                    onChange={(e) => setSelectedPermission(e.target.value as SharePermission)}
                    className="flex-1"
                    size="sm"
                  >
                    <SelectItem key={PERMISSION_VIEWER}>{tShare("viewer")}</SelectItem>
                    <SelectItem key={PERMISSION_COLLABORATOR}>{tShare("collaborator")}</SelectItem>
                  </Select>
                )}
                <Button
                  color="primary"
                  onPress={onShare}
                  isLoading={isSharing}
                  isDisabled={disabled}
                  className="h-10"
                >
                  {actionLabel}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const renderColumnChips = () => (
    <div className="space-y-2">
      <p className="text-xs text-default-500 font-medium">{t("columns")}</p>
      <div className="flex flex-wrap gap-1">
        {columns.map((col) => (
          <Chip
            key={col.id}
            size="sm"
            variant={colShareIds.includes(col.id) ? "solid" : "flat"}
            color={colShareIds.includes(col.id) ? "primary" : "default"}
            className="cursor-pointer"
            onClick={() =>
              setColShareIds((prev) =>
                prev.includes(col.id) ? prev.filter((id) => id !== col.id) : [...prev, col.id]
              )
            }
          >
            {col.name}
          </Chip>
        ))}
      </div>
    </div>
  );

  const renderRowChips = () => (
    <div className="space-y-2">
      <p className="text-xs text-default-500 font-medium">{t("rows")}</p>
      <div className="flex flex-wrap gap-1">
        {rows.map((row, idx) => (
          <Chip
            key={row.id}
            size="sm"
            variant={rowShareIds.includes(row.id) ? "solid" : "flat"}
            color={rowShareIds.includes(row.id) ? "primary" : "default"}
            className="cursor-pointer"
            onClick={() =>
              setRowShareIds((prev) =>
                prev.includes(row.id) ? prev.filter((id) => id !== row.id) : [...prev, row.id]
              )
            }
          >
            Row {idx + 1}
          </Chip>
        ))}
      </div>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()} size="2xl" scrollBehavior="inside" classNames={{ wrapper: "z-[70]", backdrop: "z-[70]" }}>
      <ModalContent>
        <ModalHeader>{t("shareTable")}</ModalHeader>
        <ModalBody>
          {loading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : (
            <Tabs
              selectedKey={selectedTab}
              onSelectionChange={(key) => {
                setSelectedTab(key as string);
                setSelectedUserIds(new Set());
                setSearchedUser(null);
                setSearchEmail("");
                setSearchError("");
              }}
            >
              {/* ---- Table-level sharing ---- */}
              <Tab key="table" title={t("shareTable")}>
                <div className="space-y-4">
                  {renderTeamPicker(tShare("shareWithSelected"), handleBulkTableShare)}
                  {isOwner && renderEmailSearch(tCommon("share"), handleEmailTableShare)}

                  {(shares?.tableShares.length ?? 0) > 0 && (
                    <div className="mt-4">
                      <h3 className="text-sm font-semibold mb-3">{tShare("currentlySharedWith")}</h3>
                      <div className="space-y-2">
                        {shares!.tableShares.map((s) => (
                          <div key={s.id} className="flex items-center justify-between p-3 bg-default-100 rounded-lg">
                            <div>
                              <p className="font-medium text-sm">
                                {displayName(s.email, s.firstName, s.lastName)}
                              </p>
                              <p className="text-xs text-default-500">{s.email}</p>
                              <p className="text-xs text-default-400 capitalize">{s.permission}</p>
                            </div>
                            {isOwner && (
                              <Button
                                size="sm"
                                variant="light"
                                color="danger"
                                startContent={<X size={16} />}
                                onPress={() => handleRemoveTableShare(s.sharedWithUserId)}
                              >
                                {tCommon("remove")}
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Tab>

              {/* ---- Column-level sharing ---- */}
              <Tab key="columns" title={t("columnAccess")}>
                <div className="space-y-4">
                  {isOwner && renderColumnChips()}
                  {renderTeamPicker(
                    colShareIds.length > 0
                      ? t("grantEditAccessColumns", { count: colShareIds.length })
                      : t("editAccess"),
                    handleBulkColumnShare,
                    colShareIds.length === 0
                  )}
                  {isOwner && renderEmailSearch(
                    colShareIds.length > 0
                      ? t("grantEditAccessColumns", { count: colShareIds.length })
                      : t("editAccess"),
                    handleEmailColumnShare,
                    colShareIds.length === 0
                  )}

                  {(shares?.columnShares.length ?? 0) > 0 && (
                    <div className="mt-4">
                      <h3 className="text-sm font-semibold mb-3">{t("columnAccess")}</h3>
                      <div className="space-y-2">
                        {(() => {
                          const byUser = new Map<string, { share: (typeof shares)extends null ? never : NonNullable<typeof shares>["columnShares"][number]; columnIds: string[] }>();
                          for (const s of shares!.columnShares) {
                            const existing = byUser.get(s.sharedWithUserId);
                            if (existing) {
                              existing.columnIds.push(s.columnId);
                            } else {
                              byUser.set(s.sharedWithUserId, { share: s, columnIds: [s.columnId] });
                            }
                          }
                          return Array.from(byUser.values()).map(({ share: s, columnIds }) => (
                            <div key={s.sharedWithUserId} className="p-3 bg-default-100 rounded-lg space-y-2">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium text-sm">
                                    {displayName(s.email, s.firstName, s.lastName)}
                                  </p>
                                  <p className="text-xs text-default-500">{s.email}</p>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {columnIds.map((colId) => {
                                  const col = columns.find((c) => c.id === colId);
                                  return (
                                    <Chip
                                      key={colId}
                                      size="sm"
                                      variant="flat"
                                      color="secondary"
                                      onClose={isOwner ? () => handleRemoveColumnShare(colId, s.sharedWithUserId) : undefined}
                                    >
                                      {col?.name ?? colId}
                                    </Chip>
                                  );
                                })}
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </Tab>

              {/* ---- Row-level sharing ---- */}
              <Tab key="rows" title={t("rowAccess")}>
                <div className="space-y-4">
                  {isOwner && renderRowChips()}
                  {renderTeamPicker(
                    rowShareIds.length > 0
                      ? t("grantEditAccessRows", { count: rowShareIds.length })
                      : t("editAccess"),
                    handleBulkRowShare,
                    rowShareIds.length === 0
                  )}
                  {isOwner && renderEmailSearch(
                    rowShareIds.length > 0
                      ? t("grantEditAccessRows", { count: rowShareIds.length })
                      : t("editAccess"),
                    handleEmailRowShare,
                    rowShareIds.length === 0
                  )}

                  {(shares?.rowShares.length ?? 0) > 0 && (
                    <div className="mt-4">
                      <h3 className="text-sm font-semibold mb-3">{t("rowAccess")}</h3>
                      <div className="space-y-2">
                        {(() => {
                          const byUser = new Map<string, { share: (typeof shares)extends null ? never : NonNullable<typeof shares>["rowShares"][number]; rowIds: string[] }>();
                          for (const s of shares!.rowShares) {
                            const existing = byUser.get(s.sharedWithUserId);
                            if (existing) {
                              existing.rowIds.push(s.rowId);
                            } else {
                              byUser.set(s.sharedWithUserId, { share: s, rowIds: [s.rowId] });
                            }
                          }
                          return Array.from(byUser.values()).map(({ share: s, rowIds }) => (
                            <div key={s.sharedWithUserId} className="p-3 bg-default-100 rounded-lg space-y-2">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium text-sm">
                                    {displayName(s.email, s.firstName, s.lastName)}
                                  </p>
                                  <p className="text-xs text-default-500">{s.email}</p>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {rowIds.map((rowId) => {
                                  const rowIdx = rows.findIndex((r) => r.id === rowId);
                                  return (
                                    <Chip
                                      key={rowId}
                                      size="sm"
                                      variant="flat"
                                      color="secondary"
                                      onClose={isOwner ? () => handleRemoveRowShare(rowId, s.sharedWithUserId) : undefined}
                                    >
                                      Row {rowIdx >= 0 ? rowIdx + 1 : "?"}
                                    </Chip>
                                  );
                                })}
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </Tab>
            </Tabs>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>
            {tCommon("close")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
