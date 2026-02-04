"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/table";
import { Button } from "@heroui/button";
import { Input, Textarea } from "@heroui/input";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Switch } from "@heroui/switch";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import { Select, SelectItem } from "@heroui/select";
import {
  Accordion,
  AccordionItem,
} from "@heroui/accordion";
import { api } from "@/lib/api/client";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@heroui/spinner";
import { Pagination } from "@heroui/pagination";
import { SearchIcon } from "@/components/icons";
import { addToast } from "@heroui/toast";
import { Trash2, Edit2, Plus, Settings2, Info } from "lucide-react";
import { useTranslations } from "next-intl";

interface FlagOverride {
  id: string;
  flagId: string;
  groupId: string;
  groupName: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

interface FeatureFlag {
  id: string;
  key: string;
  valueType: "boolean" | "number" | "string";
  defaultValue: string;
  description: string | null;
  enabled: boolean;
  overrides: FlagOverride[];
  createdAt: string;
  updatedAt: string;
}

interface TestingGroup {
  id: string;
  name: string;
  description: string | null;
  userCount: number;
}

export default function FeatureFlagsPage() {
  const { user, loading: authLoading } = useAuth();
  const t = useTranslations("admin.featureFlags");
  const tCommon = useTranslations("common");
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [groups, setGroups] = useState<TestingGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFlag, setSelectedFlag] = useState<FeatureFlag | null>(null);

  // Pagination & Search State
  const [filterValue, setFilterValue] = useState("");
  const [page, setPage] = useState(1);
  const rowsPerPage = 10;

  // Create/Edit Flag Modal State
  const {
    isOpen: isEditOpen,
    onOpen: onEditOpen,
    onOpenChange: onEditOpenChange,
    onClose: onEditClose,
  } = useDisclosure();
  const [flagFormData, setFlagFormData] = useState({
    key: "",
    valueType: "boolean" as "boolean" | "number" | "string",
    defaultValue: "",
    description: "",
  });
  const [saving, setSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Delete Flag Modal
  const {
    isOpen: isDeleteOpen,
    onOpen: onDeleteOpen,
    onOpenChange: onDeleteOpenChange,
    onClose: onDeleteClose,
  } = useDisclosure();
  const [deleting, setDeleting] = useState(false);

  // Override Modal State
  const {
    isOpen: isOverrideOpen,
    onOpen: onOverrideOpen,
    onOpenChange: onOverrideOpenChange,
    onClose: onOverrideClose,
  } = useDisclosure();
  const [overrideFormData, setOverrideFormData] = useState({
    groupIds: [] as string[],
    value: "",
  });
  const [savingOverride, setSavingOverride] = useState(false);
  const [selectedOverride, setSelectedOverride] = useState<FlagOverride | null>(null);

  useEffect(() => {
    if (user && user.roles.includes("admin")) {
      fetchFlags();
      fetchGroups();
    }
  }, [user]);

  const fetchFlags = async () => {
    try {
      const data = await api.get("/api/admin/feature-flags");
      setFlags(data.flags);
    } catch (error) {
      console.error("Failed to fetch feature flags:", error);
      addToast({
        title: t("toastError"),
        description: t("fetchError"),
        color: "danger",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchGroups = async () => {
    try {
      const data = await api.get("/api/admin/testing-groups");
      setGroups(data.groups);
    } catch (error) {
      console.error("Failed to fetch testing groups:", error);
    }
  };

  // Filter logic
  const filteredItems = useMemo(() => {
    let filtered = [...flags];
    if (filterValue) {
      filtered = filtered.filter(
        (flag) =>
          flag.key.toLowerCase().includes(filterValue.toLowerCase()) ||
          (flag.description &&
            flag.description.toLowerCase().includes(filterValue.toLowerCase()))
      );
    }
    return filtered;
  }, [flags, filterValue]);

  // Pagination logic
  const pages = Math.ceil(filteredItems.length / rowsPerPage);
  const items = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    return filteredItems.slice(start, end);
  }, [page, filteredItems, rowsPerPage]);

  const onSearchChange = useCallback((value?: string) => {
    if (value) {
      setFilterValue(value);
      setPage(1);
    } else {
      setFilterValue("");
    }
  }, []);

  const onClear = useCallback(() => {
    setFilterValue("");
    setPage(1);
  }, []);

  const handleCreate = () => {
    setIsCreating(true);
    setSelectedFlag(null);
    setFlagFormData({
      key: "",
      valueType: "boolean",
      defaultValue: "false",
      description: "",
    });
    onEditOpen();
  };

  const handleEdit = (flag: FeatureFlag) => {
    setIsCreating(false);
    setSelectedFlag(flag);
    setFlagFormData({
      key: flag.key,
      valueType: flag.valueType,
      defaultValue: flag.defaultValue,
      description: flag.description || "",
    });
    onEditOpen();
  };

  const handleSave = async () => {
    if (!flagFormData.key.trim()) {
      addToast({
        title: t("toastError"),
        description: t("keyRequired"),
        color: "danger",
      });
      return;
    }

    setSaving(true);
    try {
      if (isCreating) {
        await api.post("/api/admin/feature-flags", {
          key: flagFormData.key.trim(),
          valueType: flagFormData.valueType,
          defaultValue: flagFormData.defaultValue,
          description: flagFormData.description.trim() || null,
        });
        addToast({
          title: t("toastSuccess"),
          description: t("createSuccess"),
          color: "success",
        });
      } else if (selectedFlag) {
        await api.patch(`/api/admin/feature-flags/${selectedFlag.id}`, {
          key: flagFormData.key.trim(),
          valueType: flagFormData.valueType,
          defaultValue: flagFormData.defaultValue,
          description: flagFormData.description.trim() || null,
        });
        addToast({
          title: t("toastSuccess"),
          description: t("updateSuccess"),
          color: "success",
        });
      }
      await fetchFlags();
      onEditClose();
    } catch (error) {
      console.error("Failed to save feature flag:", error);
      addToast({
        title: t("toastError"),
        description:
          error instanceof Error ? error.message : t("saveError"),
        color: "danger",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (flag: FeatureFlag) => {
    try {
      await api.patch(`/api/admin/feature-flags/${flag.id}`, {
        enabled: !flag.enabled,
      });
      await fetchFlags();
      addToast({
        title: t("toastSuccess"),
        description: flag.enabled ? t("flagDisabled") : t("flagEnabled"),
        color: "success",
      });
    } catch (error) {
      console.error("Failed to toggle flag:", error);
      addToast({
        title: t("toastError"),
        description: t("toggleError"),
        color: "danger",
      });
    }
  };

  const handleDeleteClick = (flag: FeatureFlag) => {
    setSelectedFlag(flag);
    onDeleteOpen();
  };

  const handleDelete = async () => {
    if (!selectedFlag) return;

    setDeleting(true);
    try {
      await api.delete(`/api/admin/feature-flags/${selectedFlag.id}`);
      addToast({
        title: t("toastSuccess"),
        description: t("deleteSuccess"),
        color: "success",
      });
      await fetchFlags();
      onDeleteClose();
    } catch (error) {
      console.error("Failed to delete feature flag:", error);
      addToast({
        title: t("toastError"),
        description: t("deleteError"),
        color: "danger",
      });
    } finally {
      setDeleting(false);
    }
  };

  // Override handlers
  const handleAddOverride = (flag: FeatureFlag) => {
    setSelectedFlag(flag);
    setSelectedOverride(null);
    setOverrideFormData({
      groupIds: [],
      value: flag.valueType === "boolean" ? "true" : "",
    });
    onOverrideOpen();
  };

  const handleEditOverride = (flag: FeatureFlag, override: FlagOverride) => {
    setSelectedFlag(flag);
    setSelectedOverride(override);
    setOverrideFormData({
      groupIds: [override.groupId],
      value: override.value,
    });
    onOverrideOpen();
  };

  const handleSaveOverride = async () => {
    if (!selectedFlag || overrideFormData.groupIds.length === 0) {
      addToast({
        title: t("toastError"),
        description: t("selectGroupError"),
        color: "danger",
      });
      return;
    }

    setSavingOverride(true);
    try {
      if (selectedOverride) {
        // Edit mode - single group
        await api.patch(
          `/api/admin/feature-flags/${selectedFlag.id}/overrides/${selectedOverride.id}`,
          { value: overrideFormData.value }
        );
        addToast({
          title: t("toastSuccess"),
          description: t("overrideUpdateSuccess"),
          color: "success",
        });
      } else {
        // Create mode - supports multiple groups
        await api.post(`/api/admin/feature-flags/${selectedFlag.id}/overrides`, {
          groupIds: overrideFormData.groupIds,
          value: overrideFormData.value,
        });
        addToast({
          title: t("toastSuccess"),
          description: overrideFormData.groupIds.length > 1 ? t("overridesCreateSuccess") : t("overrideCreateSuccess"),
          color: "success",
        });
      }
      await fetchFlags();
      onOverrideClose();
    } catch (error) {
      console.error("Failed to save override:", error);
      addToast({
        title: t("toastError"),
        description:
          error instanceof Error ? error.message : t("overrideSaveError"),
        color: "danger",
      });
    } finally {
      setSavingOverride(false);
    }
  };

  const handleDeleteOverride = async (flag: FeatureFlag, override: FlagOverride) => {
    try {
      await api.delete(
        `/api/admin/feature-flags/${flag.id}/overrides/${override.id}`
      );
      addToast({
        title: t("toastSuccess"),
        description: t("overrideDeleteSuccess"),
        color: "success",
      });
      await fetchFlags();
    } catch (error) {
      console.error("Failed to delete override:", error);
      addToast({
        title: t("toastError"),
        description: t("overrideDeleteError"),
        color: "danger",
      });
    }
  };

  const getValueTypeColor = (type: string) => {
    switch (type) {
      case "boolean":
        return "primary";
      case "number":
        return "secondary";
      case "string":
        return "warning";
      default:
        return "default";
    }
  };

  const formatValue = (value: string, type: string) => {
    if (type === "boolean") {
      return value === "true" ? "true" : "false";
    }
    return value;
  };

  // Get available groups for override (exclude already overridden groups)
  const availableGroups = useMemo(() => {
    if (!selectedFlag || selectedOverride) return groups;
    const overriddenGroupIds = new Set(
      selectedFlag.overrides.map((o) => o.groupId)
    );
    return groups.filter((g) => !overriddenGroupIds.has(g.id));
  }, [groups, selectedFlag, selectedOverride]);

  if (authLoading) {
    return <Spinner size="lg" className="flex justify-center mt-10" />;
  }

  if (!user || !user.roles.includes("admin")) {
    return <div className="p-8 text-center">Unauthorized</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 sm:gap-0">
        <h1 className="text-2xl font-bold">{t("pageTitle")}</h1>
        <Button
          color="primary"
          startContent={<Plus size={16} />}
          onPress={handleCreate}
        >
          {t("createFlag")}
        </Button>
      </div>

      {/* Important Note Card */}
      <Card className="bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800">
        <CardBody className="gap-3">
          <div className="flex items-center gap-2 text-warning-700 dark:text-warning-400">
            <Info size={20} />
            <span className="font-semibold">{t("importantNote")}</span>
          </div>
          <p className="text-sm text-warning-700 dark:text-warning-300">
            {t("noteExplanation")}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="p-3 bg-white/50 dark:bg-black/20 rounded-lg">
              <p className="font-medium text-sm text-warning-800 dark:text-warning-200 mb-1">
                {t("noteValueTitle")}
              </p>
              <p className="text-xs text-warning-700 dark:text-warning-300">
                {t("noteValueDesc")}
              </p>
            </div>
            <div className="p-3 bg-white/50 dark:bg-black/20 rounded-lg">
              <p className="font-medium text-sm text-warning-800 dark:text-warning-200 mb-1">
                {t("noteEnabledTitle")}
              </p>
              <p className="text-xs text-warning-700 dark:text-warning-300">
                {t("noteEnabledDesc")}
              </p>
            </div>
          </div>
          <p className="text-xs text-warning-600 dark:text-warning-400 italic">
            {t("noteSummary")}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">{t("manageFlags")}</h2>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <div className="flex justify-between gap-3 items-end">
              <Input
                isClearable
                className="w-full sm:max-w-[44%]"
                placeholder={t("searchPlaceholder")}
                startContent={<SearchIcon />}
                value={filterValue}
                onClear={() => onClear()}
                onValueChange={onSearchChange}
              />
            </div>
            <Table
              aria-label={t("tableAriaLabel")}
              bottomContent={
                pages > 0 ? (
                  <div className="flex w-full justify-center">
                    <Pagination
                      isCompact
                      showControls
                      showShadow
                      color="primary"
                      page={page}
                      total={pages}
                      onChange={(page) => setPage(page)}
                    />
                  </div>
                ) : null
              }
            >
              <TableHeader>
                <TableColumn>{t("columnKey")}</TableColumn>
                <TableColumn>{t("columnType")}</TableColumn>
                <TableColumn>{t("columnEnabled")}</TableColumn>
                <TableColumn>{t("columnDefault")}</TableColumn>
                <TableColumn>{t("columnOverrides")}</TableColumn>
                <TableColumn>{t("columnActions")}</TableColumn>
              </TableHeader>
              <TableBody
                emptyContent={loading ? <Spinner /> : t("noFlagsFound")}
                items={items}
              >
                {(item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div>
                        <span className="font-mono font-medium">{item.key}</span>
                        {item.description && (
                          <p className="text-default-500 text-xs mt-1 line-clamp-1">
                            {item.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="sm"
                        variant="flat"
                        color={getValueTypeColor(item.valueType)}
                      >
                        {item.valueType}
                      </Chip>
                    </TableCell>
                    <TableCell>
                      <Switch
                        size="sm"
                        isSelected={item.enabled}
                        onValueChange={() => handleToggleEnabled(item)}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">
                        {formatValue(item.defaultValue, item.valueType)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {item.overrides.length > 0 ? (
                        <Accordion isCompact>
                          <AccordionItem
                            key="overrides"
                            aria-label="Overrides"
                            title={
                              <span className="text-sm">
                                {t("overridesCount", { count: item.overrides.length })}
                              </span>
                            }
                          >
                            <div className="space-y-2 pb-2">
                              {item.overrides.map((override) => (
                                <div
                                  key={override.id}
                                  className="flex items-center justify-between bg-default-100 rounded-lg px-3 py-2"
                                >
                                  <div>
                                    <span className="text-sm font-medium">
                                      {override.groupName}
                                    </span>
                                    <span className="text-default-500 mx-2">→</span>
                                    <span className="font-mono text-sm">
                                      {formatValue(override.value, item.valueType)}
                                    </span>
                                  </div>
                                  <div className="flex gap-1">
                                    <Button
                                      size="sm"
                                      variant="light"
                                      isIconOnly
                                      onPress={() => handleEditOverride(item, override)}
                                    >
                                      <Edit2 size={14} />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="light"
                                      color="danger"
                                      isIconOnly
                                      onPress={() => handleDeleteOverride(item, override)}
                                    >
                                      <Trash2 size={14} />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                              <Button
                                size="sm"
                                variant="flat"
                                startContent={<Plus size={14} />}
                                onPress={() => handleAddOverride(item)}
                                className="w-full"
                              >
                                {t("addOverride")}
                              </Button>
                            </div>
                          </AccordionItem>
                        </Accordion>
                      ) : (
                        <Button
                          size="sm"
                          variant="flat"
                          startContent={<Settings2 size={14} />}
                          onPress={() => handleAddOverride(item)}
                        >
                          {t("addOverride")}
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="flat"
                          isIconOnly
                          onPress={() => handleEdit(item)}
                        >
                          <Edit2 size={16} />
                        </Button>
                        <Button
                          size="sm"
                          variant="flat"
                          color="danger"
                          isIconOnly
                          onPress={() => handleDeleteClick(item)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardBody>
      </Card>

      {/* Create/Edit Flag Modal */}
      <Modal isOpen={isEditOpen} onOpenChange={onEditOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>
                {isCreating ? t("createFlagModal") : t("editFlagModal")}
              </ModalHeader>
              <ModalBody>
                <Input
                  label={t("keyLabel")}
                  placeholder={t("keyPlaceholder")}
                  value={flagFormData.key}
                  onValueChange={(v) =>
                    setFlagFormData({ ...flagFormData, key: v.toLowerCase() })
                  }
                  maxLength={16}
                  isRequired
                  description={t("keyDescription")}
                />
                <Select
                  label={t("valueTypeLabel")}
                  selectedKeys={[flagFormData.valueType]}
                  onSelectionChange={(keys) => {
                    const type = Array.from(keys)[0] as "boolean" | "number" | "string";
                    setFlagFormData({
                      ...flagFormData,
                      valueType: type,
                      defaultValue: type === "boolean" ? "false" : "",
                    });
                  }}
                >
                  <SelectItem key="boolean">{t("valueTypeBoolean")}</SelectItem>
                  <SelectItem key="number">{t("valueTypeNumber")}</SelectItem>
                  <SelectItem key="string">{t("valueTypeString")}</SelectItem>
                </Select>
                {flagFormData.valueType === "boolean" ? (
                  <Select
                    label={t("defaultValueLabel")}
                    selectedKeys={[flagFormData.defaultValue]}
                    onSelectionChange={(keys) =>
                      setFlagFormData({
                        ...flagFormData,
                        defaultValue: Array.from(keys)[0] as string,
                      })
                    }
                  >
                    <SelectItem key="true">true</SelectItem>
                    <SelectItem key="false">false</SelectItem>
                  </Select>
                ) : (
                  <Input
                    label={t("defaultValueLabel")}
                    placeholder={
                      flagFormData.valueType === "number" ? t("defaultValueNumberPlaceholder") : t("defaultValueStringPlaceholder")
                    }
                    type={flagFormData.valueType === "number" ? "number" : "text"}
                    value={flagFormData.defaultValue}
                    onValueChange={(v) =>
                      setFlagFormData({ ...flagFormData, defaultValue: v })
                    }
                    isRequired
                  />
                )}
                <Textarea
                  label={t("descriptionLabel")}
                  placeholder={t("descriptionPlaceholder")}
                  value={flagFormData.description}
                  onValueChange={(v) =>
                    setFlagFormData({ ...flagFormData, description: v })
                  }
                  minRows={2}
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {tCommon("cancel")}
                </Button>
                <Button
                  color="primary"
                  onPress={handleSave}
                  isLoading={saving}
                  isDisabled={!flagFormData.key.trim() || !flagFormData.defaultValue}
                >
                  {isCreating ? tCommon("create") : tCommon("save")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Delete Flag Modal */}
      <Modal isOpen={isDeleteOpen} onOpenChange={onDeleteOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t("deleteFlagModal")}</ModalHeader>
              <ModalBody>
                <p>
                  {t("deleteConfirm")}{" "}
                  <strong className="font-mono">{selectedFlag?.key}</strong>?
                </p>
                {selectedFlag && selectedFlag.overrides.length > 0 && (
                  <p className="text-warning text-sm mt-2">
                    {t("deleteOverridesWarning", { count: selectedFlag.overrides.length })}
                  </p>
                )}
                <p className="text-danger text-sm mt-2">
                  {t("deleteCannotUndo")}
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {tCommon("cancel")}
                </Button>
                <Button
                  color="danger"
                  onPress={handleDelete}
                  isLoading={deleting}
                >
                  {tCommon("delete")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Override Modal */}
      <Modal isOpen={isOverrideOpen} onOpenChange={onOverrideOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>
                {selectedOverride ? t("editOverrideModal") : t("addOverrideModal")}
              </ModalHeader>
              <ModalBody>
                {selectedFlag && (
                  <div className="mb-4 p-3 bg-default-100 rounded-lg">
                    <p className="text-sm text-default-500">{t("flagLabel")}</p>
                    <p className="font-mono font-medium">{selectedFlag.key}</p>
                    <p className="text-xs text-default-400 mt-1">
                      {t("typeAndDefault", { type: selectedFlag.valueType, default: formatValue(selectedFlag.defaultValue, selectedFlag.valueType) })}
                    </p>
                  </div>
                )}
                <Select
                  label={selectedOverride ? t("testingGroupLabel") : t("testingGroupsLabel")}
                  placeholder={selectedOverride ? t("selectGroupPlaceholder") : t("selectGroupsPlaceholder")}
                  selectionMode={selectedOverride ? "single" : "multiple"}
                  selectedKeys={new Set(overrideFormData.groupIds)}
                  onSelectionChange={(keys) =>
                    setOverrideFormData({
                      ...overrideFormData,
                      groupIds: Array.from(keys) as string[],
                    })
                  }
                  isDisabled={!!selectedOverride}
                >
                  {availableGroups.map((group) => (
                    <SelectItem key={group.id}>
                      {group.name} ({t("usersCount", { count: group.userCount })})
                    </SelectItem>
                  ))}
                </Select>
                {overrideFormData.groupIds.length > 0 && (
                  <div className="flex flex-wrap gap-2 -mt-2">
                    {overrideFormData.groupIds.map((groupId) => (
                      <Chip
                        key={groupId}
                        size="sm"
                        variant="flat"
                        color="primary"
                        onClose={selectedOverride ? undefined : () =>
                          setOverrideFormData({
                            ...overrideFormData,
                            groupIds: overrideFormData.groupIds.filter((id) => id !== groupId),
                          })
                        }
                      >
                        {groups.find((g) => g.id === groupId)?.name || t("unknownGroup")}
                      </Chip>
                    ))}
                  </div>
                )}
                {selectedFlag?.valueType === "boolean" ? (
                  <Select
                    label={t("overrideValueLabel")}
                    selectedKeys={[overrideFormData.value]}
                    onSelectionChange={(keys) =>
                      setOverrideFormData({
                        ...overrideFormData,
                        value: Array.from(keys)[0] as string,
                      })
                    }
                  >
                    <SelectItem key="true">true</SelectItem>
                    <SelectItem key="false">false</SelectItem>
                  </Select>
                ) : (
                  <Input
                    label={t("overrideValueLabel")}
                    placeholder={
                      selectedFlag?.valueType === "number" ? t("overrideValueNumberPlaceholder") : t("overrideValueStringPlaceholder")
                    }
                    type={selectedFlag?.valueType === "number" ? "number" : "text"}
                    value={overrideFormData.value}
                    onValueChange={(v) =>
                      setOverrideFormData({ ...overrideFormData, value: v })
                    }
                    isRequired
                  />
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {tCommon("cancel")}
                </Button>
                <Button
                  color="primary"
                  onPress={handleSaveOverride}
                  isLoading={savingOverride}
                  isDisabled={overrideFormData.groupIds.length === 0 || !overrideFormData.value}
                >
                  {selectedOverride ? t("saveButton") : (overrideFormData.groupIds.length > 1 ? t("addOverridesPluralButton") : t("addOverridesButton"))}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
