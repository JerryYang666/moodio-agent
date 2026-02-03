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
import { Trash2, Edit2, Plus, Settings2 } from "lucide-react";

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
    groupId: "",
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
        title: "Error",
        description: "Failed to fetch feature flags",
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
        title: "Error",
        description: "Key is required",
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
          title: "Success",
          description: "Feature flag created successfully",
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
          title: "Success",
          description: "Feature flag updated successfully",
          color: "success",
        });
      }
      await fetchFlags();
      onEditClose();
    } catch (error) {
      console.error("Failed to save feature flag:", error);
      addToast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to save feature flag",
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
        title: "Success",
        description: `Flag ${flag.enabled ? "disabled" : "enabled"} successfully`,
        color: "success",
      });
    } catch (error) {
      console.error("Failed to toggle flag:", error);
      addToast({
        title: "Error",
        description: "Failed to toggle flag",
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
        title: "Success",
        description: "Feature flag deleted successfully",
        color: "success",
      });
      await fetchFlags();
      onDeleteClose();
    } catch (error) {
      console.error("Failed to delete feature flag:", error);
      addToast({
        title: "Error",
        description: "Failed to delete feature flag",
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
      groupId: "",
      value: flag.valueType === "boolean" ? "true" : "",
    });
    onOverrideOpen();
  };

  const handleEditOverride = (flag: FeatureFlag, override: FlagOverride) => {
    setSelectedFlag(flag);
    setSelectedOverride(override);
    setOverrideFormData({
      groupId: override.groupId,
      value: override.value,
    });
    onOverrideOpen();
  };

  const handleSaveOverride = async () => {
    if (!selectedFlag || !overrideFormData.groupId) {
      addToast({
        title: "Error",
        description: "Please select a group",
        color: "danger",
      });
      return;
    }

    setSavingOverride(true);
    try {
      if (selectedOverride) {
        await api.patch(
          `/api/admin/feature-flags/${selectedFlag.id}/overrides/${selectedOverride.id}`,
          { value: overrideFormData.value }
        );
        addToast({
          title: "Success",
          description: "Override updated successfully",
          color: "success",
        });
      } else {
        await api.post(`/api/admin/feature-flags/${selectedFlag.id}/overrides`, {
          groupId: overrideFormData.groupId,
          value: overrideFormData.value,
        });
        addToast({
          title: "Success",
          description: "Override created successfully",
          color: "success",
        });
      }
      await fetchFlags();
      onOverrideClose();
    } catch (error) {
      console.error("Failed to save override:", error);
      addToast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to save override",
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
        title: "Success",
        description: "Override deleted successfully",
        color: "success",
      });
      await fetchFlags();
    } catch (error) {
      console.error("Failed to delete override:", error);
      addToast({
        title: "Error",
        description: "Failed to delete override",
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
        <h1 className="text-2xl font-bold">Feature Flags</h1>
        <Button
          color="primary"
          startContent={<Plus size={16} />}
          onPress={handleCreate}
        >
          Create Flag
        </Button>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Manage Feature Flags</h2>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <div className="flex justify-between gap-3 items-end">
              <Input
                isClearable
                className="w-full sm:max-w-[44%]"
                placeholder="Search by key or description..."
                startContent={<SearchIcon />}
                value={filterValue}
                onClear={() => onClear()}
                onValueChange={onSearchChange}
              />
            </div>
            <Table
              aria-label="Feature flags table"
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
                <TableColumn>KEY</TableColumn>
                <TableColumn>TYPE</TableColumn>
                <TableColumn>DEFAULT</TableColumn>
                <TableColumn>ENABLED</TableColumn>
                <TableColumn>OVERRIDES</TableColumn>
                <TableColumn>ACTIONS</TableColumn>
              </TableHeader>
              <TableBody
                emptyContent={loading ? <Spinner /> : "No feature flags found"}
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
                      <span className="font-mono text-sm">
                        {formatValue(item.defaultValue, item.valueType)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Switch
                        size="sm"
                        isSelected={item.enabled}
                        onValueChange={() => handleToggleEnabled(item)}
                      />
                    </TableCell>
                    <TableCell>
                      {item.overrides.length > 0 ? (
                        <Accordion isCompact>
                          <AccordionItem
                            key="overrides"
                            aria-label="Overrides"
                            title={
                              <span className="text-sm">
                                {item.overrides.length} override(s)
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
                                Add Override
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
                          Add Override
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
                {isCreating ? "Create Feature Flag" : "Edit Feature Flag"}
              </ModalHeader>
              <ModalBody>
                <Input
                  label="Key"
                  placeholder="e.g., dark_mode"
                  value={flagFormData.key}
                  onValueChange={(v) =>
                    setFlagFormData({ ...flagFormData, key: v.toLowerCase() })
                  }
                  maxLength={16}
                  isRequired
                  description="Lowercase letters, numbers, and underscores only (max 16 chars)"
                />
                <Select
                  label="Value Type"
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
                  <SelectItem key="boolean">Boolean</SelectItem>
                  <SelectItem key="number">Number</SelectItem>
                  <SelectItem key="string">String</SelectItem>
                </Select>
                {flagFormData.valueType === "boolean" ? (
                  <Select
                    label="Default Value"
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
                    label="Default Value"
                    placeholder={
                      flagFormData.valueType === "number" ? "e.g., 100" : "e.g., light"
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
                  label="Description"
                  placeholder="Describe what this flag controls..."
                  value={flagFormData.description}
                  onValueChange={(v) =>
                    setFlagFormData({ ...flagFormData, description: v })
                  }
                  minRows={2}
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Cancel
                </Button>
                <Button
                  color="primary"
                  onPress={handleSave}
                  isLoading={saving}
                  isDisabled={!flagFormData.key.trim() || !flagFormData.defaultValue}
                >
                  {isCreating ? "Create" : "Save Changes"}
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
              <ModalHeader>Delete Feature Flag</ModalHeader>
              <ModalBody>
                <p>
                  Are you sure you want to delete the feature flag{" "}
                  <strong className="font-mono">{selectedFlag?.key}</strong>?
                </p>
                {selectedFlag && selectedFlag.overrides.length > 0 && (
                  <p className="text-warning text-sm mt-2">
                    This flag has {selectedFlag.overrides.length} override(s) that
                    will also be deleted.
                  </p>
                )}
                <p className="text-danger text-sm mt-2">
                  This action cannot be undone.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Cancel
                </Button>
                <Button
                  color="danger"
                  onPress={handleDelete}
                  isLoading={deleting}
                >
                  Delete
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
                {selectedOverride ? "Edit Override" : "Add Override"}
              </ModalHeader>
              <ModalBody>
                {selectedFlag && (
                  <div className="mb-4 p-3 bg-default-100 rounded-lg">
                    <p className="text-sm text-default-500">Flag</p>
                    <p className="font-mono font-medium">{selectedFlag.key}</p>
                    <p className="text-xs text-default-400 mt-1">
                      Type: {selectedFlag.valueType} | Default:{" "}
                      {formatValue(selectedFlag.defaultValue, selectedFlag.valueType)}
                    </p>
                  </div>
                )}
                <Select
                  label="Testing Group"
                  selectedKeys={overrideFormData.groupId ? [overrideFormData.groupId] : []}
                  onSelectionChange={(keys) =>
                    setOverrideFormData({
                      ...overrideFormData,
                      groupId: Array.from(keys)[0] as string,
                    })
                  }
                  isDisabled={!!selectedOverride}
                >
                  {availableGroups.map((group) => (
                    <SelectItem key={group.id}>
                      {group.name} ({group.userCount} users)
                    </SelectItem>
                  ))}
                </Select>
                {selectedFlag?.valueType === "boolean" ? (
                  <Select
                    label="Override Value"
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
                    label="Override Value"
                    placeholder={
                      selectedFlag?.valueType === "number" ? "e.g., 200" : "e.g., dark"
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
                  Cancel
                </Button>
                <Button
                  color="primary"
                  onPress={handleSaveOverride}
                  isLoading={savingOverride}
                  isDisabled={!overrideFormData.groupId || !overrideFormData.value}
                >
                  {selectedOverride ? "Save" : "Add Override"}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
