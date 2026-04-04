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
import { Spinner } from "@heroui/spinner";
import { addToast } from "@heroui/toast";
import { Trash2, UserPlus } from "lucide-react";
import type { ProductionTableColumn, ProductionTableRow } from "@/lib/production-table/types";

interface ShareData {
  tableShares: Array<{
    id: string;
    sharedWithUserId: string;
    permission: string;
    sharedAt: string;
  }>;
  columnShares: Array<{
    id: string;
    columnId: string;
    sharedWithUserId: string;
    sharedAt: string;
  }>;
  rowShares: Array<{
    id: string;
    rowId: string;
    sharedWithUserId: string;
    sharedAt: string;
  }>;
}

interface ProductionTableShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableId: string;
  columns: ProductionTableColumn[];
  rows: ProductionTableRow[];
  isOwner: boolean;
}

export function ProductionTableShareModal({
  isOpen,
  onClose,
  tableId,
  columns,
  rows,
  isOwner,
}: ProductionTableShareModalProps) {
  const t = useTranslations("productionTable");
  const [shares, setShares] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState("");
  const [permission, setPermission] = useState<string>("viewer");
  const [selectedTab, setSelectedTab] = useState("table");

  // Column share form
  const [colShareUser, setColShareUser] = useState("");
  const [colShareIds, setColShareIds] = useState<string[]>([]);

  // Row share form
  const [rowShareUser, setRowShareUser] = useState("");
  const [rowShareIds, setRowShareIds] = useState<string[]>([]);

  const fetchShares = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/production-table/${tableId}/share`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setShares(data);
    } catch {
      addToast({ title: "Failed to load shares", color: "danger" });
    } finally {
      setLoading(false);
    }
  }, [tableId]);

  useEffect(() => {
    if (isOpen) fetchShares();
  }, [isOpen, fetchShares]);

  const handleAddTableShare = async () => {
    if (!userId.trim()) return;
    try {
      const res = await fetch(`/api/production-table/${tableId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sharedWithUserId: userId.trim(), permission }),
      });
      if (!res.ok) throw new Error();
      setUserId("");
      fetchShares();
    } catch {
      addToast({ title: "Failed to share", color: "danger" });
    }
  };

  const handleRemoveTableShare = async (targetUserId: string) => {
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
  };

  const handleAddColumnShares = async () => {
    if (!colShareUser.trim() || colShareIds.length === 0) return;
    try {
      const res = await fetch(
        `/api/production-table/${tableId}/share/columns`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            columnIds: colShareIds,
            sharedWithUserId: colShareUser.trim(),
          }),
        }
      );
      if (!res.ok) throw new Error();
      setColShareUser("");
      setColShareIds([]);
      fetchShares();
    } catch {
      addToast({ title: "Failed to add column shares", color: "danger" });
    }
  };

  const handleRemoveColumnShare = async (
    columnId: string,
    targetUserId: string
  ) => {
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
  };

  const handleAddRowShares = async () => {
    if (!rowShareUser.trim() || rowShareIds.length === 0) return;
    try {
      const res = await fetch(
        `/api/production-table/${tableId}/share/rows`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rowIds: rowShareIds,
            sharedWithUserId: rowShareUser.trim(),
          }),
        }
      );
      if (!res.ok) throw new Error();
      setRowShareUser("");
      setRowShareIds([]);
      fetchShares();
    } catch {
      addToast({ title: "Failed to add row shares", color: "danger" });
    }
  };

  const handleRemoveRowShare = async (
    rowId: string,
    targetUserId: string
  ) => {
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
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()} size="2xl">
      <ModalContent>
        <ModalHeader>{t("shareTable")}</ModalHeader>
        <ModalBody>
          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            <Tabs
              selectedKey={selectedTab}
              onSelectionChange={(key) => setSelectedTab(key as string)}
            >
              {/* Table-level sharing */}
              <Tab key="table" title={t("shareTable")}>
                <div className="space-y-4">
                  {isOwner && (
                    <div className="flex gap-2">
                      <Input
                        size="sm"
                        placeholder="User ID"
                        value={userId}
                        onValueChange={setUserId}
                        className="flex-1"
                      />
                      <Select
                        size="sm"
                        selectedKeys={new Set([permission])}
                        onSelectionChange={(keys) => {
                          const v = Array.from(keys)[0] as string;
                          if (v) setPermission(v);
                        }}
                        className="w-40"
                      >
                        <SelectItem key="viewer">Viewer</SelectItem>
                        <SelectItem key="collaborator">Collaborator</SelectItem>
                      </Select>
                      <Button
                        size="sm"
                        color="primary"
                        isIconOnly
                        onPress={handleAddTableShare}
                      >
                        <UserPlus size={14} />
                      </Button>
                    </div>
                  )}
                  <div className="space-y-2">
                    {shares?.tableShares.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between px-3 py-2 bg-default-50 rounded"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{s.sharedWithUserId}</span>
                          <Chip size="sm" variant="flat">
                            {s.permission}
                          </Chip>
                        </div>
                        {isOwner && (
                          <Button
                            isIconOnly
                            size="sm"
                            variant="light"
                            color="danger"
                            onPress={() =>
                              handleRemoveTableShare(s.sharedWithUserId)
                            }
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </Tab>

              {/* Column-level sharing */}
              <Tab key="columns" title={t("columnAccess")}>
                <div className="space-y-4">
                  {isOwner && (
                    <div className="space-y-2">
                      <Input
                        size="sm"
                        placeholder="User ID"
                        value={colShareUser}
                        onValueChange={setColShareUser}
                      />
                      <div className="flex flex-wrap gap-1">
                        {columns.map((col) => (
                          <Chip
                            key={col.id}
                            size="sm"
                            variant={
                              colShareIds.includes(col.id) ? "solid" : "flat"
                            }
                            color={
                              colShareIds.includes(col.id) ? "primary" : "default"
                            }
                            className="cursor-pointer"
                            onClick={() => {
                              setColShareIds((prev) =>
                                prev.includes(col.id)
                                  ? prev.filter((id) => id !== col.id)
                                  : [...prev, col.id]
                              );
                            }}
                          >
                            {col.name}
                          </Chip>
                        ))}
                      </div>
                      <Button
                        size="sm"
                        color="primary"
                        isDisabled={
                          !colShareUser.trim() || colShareIds.length === 0
                        }
                        onPress={handleAddColumnShares}
                      >
                        {t("editAccess")}
                      </Button>
                    </div>
                  )}
                  <div className="space-y-2">
                    {shares?.columnShares.map((s) => {
                      const col = columns.find((c) => c.id === s.columnId);
                      return (
                        <div
                          key={s.id}
                          className="flex items-center justify-between px-3 py-2 bg-default-50 rounded"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm">
                              {s.sharedWithUserId}
                            </span>
                            <Chip size="sm" variant="flat" color="secondary">
                              {col?.name ?? s.columnId}
                            </Chip>
                          </div>
                          {isOwner && (
                            <Button
                              isIconOnly
                              size="sm"
                              variant="light"
                              color="danger"
                              onPress={() =>
                                handleRemoveColumnShare(
                                  s.columnId,
                                  s.sharedWithUserId
                                )
                              }
                            >
                              <Trash2 size={14} />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Tab>

              {/* Row-level sharing */}
              <Tab key="rows" title={t("rowAccess")}>
                <div className="space-y-4">
                  {isOwner && (
                    <div className="space-y-2">
                      <Input
                        size="sm"
                        placeholder="User ID"
                        value={rowShareUser}
                        onValueChange={setRowShareUser}
                      />
                      <div className="flex flex-wrap gap-1">
                        {rows.map((row, idx) => (
                          <Chip
                            key={row.id}
                            size="sm"
                            variant={
                              rowShareIds.includes(row.id) ? "solid" : "flat"
                            }
                            color={
                              rowShareIds.includes(row.id) ? "primary" : "default"
                            }
                            className="cursor-pointer"
                            onClick={() => {
                              setRowShareIds((prev) =>
                                prev.includes(row.id)
                                  ? prev.filter((id) => id !== row.id)
                                  : [...prev, row.id]
                              );
                            }}
                          >
                            Row {idx + 1}
                          </Chip>
                        ))}
                      </div>
                      <Button
                        size="sm"
                        color="primary"
                        isDisabled={
                          !rowShareUser.trim() || rowShareIds.length === 0
                        }
                        onPress={handleAddRowShares}
                      >
                        {t("editAccess")}
                      </Button>
                    </div>
                  )}
                  <div className="space-y-2">
                    {shares?.rowShares.map((s) => {
                      const rowIdx = rows.findIndex((r) => r.id === s.rowId);
                      return (
                        <div
                          key={s.id}
                          className="flex items-center justify-between px-3 py-2 bg-default-50 rounded"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm">
                              {s.sharedWithUserId}
                            </span>
                            <Chip size="sm" variant="flat" color="secondary">
                              Row {rowIdx >= 0 ? rowIdx + 1 : "?"}
                            </Chip>
                          </div>
                          {isOwner && (
                            <Button
                              isIconOnly
                              size="sm"
                              variant="light"
                              color="danger"
                              onPress={() =>
                                handleRemoveRowShare(
                                  s.rowId,
                                  s.sharedWithUserId
                                )
                              }
                            >
                              <Trash2 size={14} />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Tab>
            </Tabs>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
