"use client";

import { useEffect, useMemo, useCallback, useState } from "react";
import type { Key } from "react";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/table";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Input } from "@heroui/input";
import { Pagination } from "@heroui/pagination";
import { Spinner } from "@heroui/spinner";
import { Button } from "@heroui/button";
import { Select, SelectItem } from "@heroui/select";
import { Image } from "@heroui/image";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { User as UserAvatar } from "@heroui/user";
import { ExternalLink, RefreshCw, Video } from "lucide-react";
import { api } from "@/lib/api/client";
import { useAuth } from "@/hooks/use-auth";
import { SearchIcon } from "@/components/icons";
import VideoStatusChip from "@/components/storyboard/video-status-chip";

interface AdminVideoGeneration {
  id: string;
  modelId: string;
  status: "pending" | "processing" | "completed" | "failed";
  sourceImageId: string;
  sourceImageUrl: string;
  endImageId: string | null;
  endImageUrl: string | null;
  videoId: string | null;
  videoUrl: string | null;
  thumbnailImageId: string | null;
  thumbnailUrl: string | null;
  params: Record<string, any>;
  error: string | null;
  seed: number | null;
  createdAt: string;
  completedAt: string | null;
  userId: string;
  userEmail: string;
  userFirstName: string | null;
  userLastName: string | null;
}

const STATUS_OPTIONS = [
  { key: "all", label: "All statuses" },
  { key: "pending", label: "Pending" },
  { key: "processing", label: "Processing" },
  { key: "completed", label: "Completed" },
  { key: "failed", label: "Failed" },
];

export default function VideoManagementPage() {
  const { user, loading: authLoading } = useAuth();
  const [generations, setGenerations] = useState<AdminVideoGeneration[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGeneration, setSelectedGeneration] =
    useState<AdminVideoGeneration | null>(null);

  // Filters
  const [filterValue, setFilterValue] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  useEffect(() => {
    if (user && user.roles.includes("admin")) {
      fetchGenerations();
    }
  }, [user]);

  const fetchGenerations = async () => {
    setLoading(true);
    try {
      const data = await api.get("/api/admin/video-generations");
      setGenerations(data.generations ?? []);
    } catch (error) {
      console.error("Failed to fetch video generations:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    let filtered = [...generations];

    if (statusFilter !== "all") {
      filtered = filtered.filter((g) => g.status === statusFilter);
    }

    if (modelFilter) {
      const lowerModel = modelFilter.toLowerCase();
      filtered = filtered.filter((g) =>
        g.modelId.toLowerCase().includes(lowerModel)
      );
    }

    if (filterValue) {
      const lowerFilter = filterValue.toLowerCase();
      filtered = filtered.filter((g) => {
        const prompt = g.params?.prompt?.toString().toLowerCase() || "";
        const userName = `${g.userFirstName || ""} ${
          g.userLastName || ""
        }`.trim();
        return (
          g.id.toLowerCase().includes(lowerFilter) ||
          g.userEmail.toLowerCase().includes(lowerFilter) ||
          userName.toLowerCase().includes(lowerFilter) ||
          prompt.includes(lowerFilter)
        );
      });
    }

    return filtered;
  }, [generations, filterValue, statusFilter, modelFilter]);

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

  const onClearSearch = useCallback(() => {
    setFilterValue("");
    setPage(1);
  }, []);

  const handleRowAction = useCallback(
    (key: Key) => {
      const targetId = String(key);
      const found = generations.find((g) => g.id === targetId);
      if (found) {
        setSelectedGeneration(found);
      }
    },
    [generations]
  );

  if (authLoading) {
    return <Spinner size="lg" className="flex justify-center mt-10" />;
  }

  if (!user || !user.roles.includes("admin")) {
    return <div className="p-8 text-center">Unauthorized</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Video size={20} className="text-primary" />
          <h1 className="text-2xl font-bold">Video Generation History</h1>
        </div>
        <Button
          onPress={fetchGenerations}
          color="primary"
          variant="flat"
          size="sm"
          startContent={<RefreshCw size={16} />}
        >
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">All Video Generations</h2>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
              <Input
                isClearable
                className="w-full lg:max-w-[40%]"
                placeholder="Search by prompt, user, or ID..."
                startContent={<SearchIcon />}
                value={filterValue}
                onClear={() => onClearSearch()}
                onValueChange={onSearchChange}
              />
              <Select
                label="Status"
                selectedKeys={[statusFilter]}
                onSelectionChange={(keys) => {
                  const selected = Array.from(keys)[0] as string;
                  setStatusFilter(selected || "all");
                  setPage(1);
                }}
                className="w-full lg:max-w-[200px]"
              >
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.key}>{option.label}</SelectItem>
                ))}
              </Select>
              <Input
                className="w-full lg:max-w-[260px]"
                label="Model ID"
                placeholder="e.g. fal-ai/bytedance/seedance..."
                value={modelFilter}
                onValueChange={(value) => {
                  setModelFilter(value);
                  setPage(1);
                }}
                isClearable
                onClear={() => setModelFilter("")}
              />
              <Select
                label="Rows"
                selectedKeys={[String(rowsPerPage)]}
                onSelectionChange={(keys) => {
                  const selected = Number(Array.from(keys)[0]);
                  setRowsPerPage(selected || 10);
                  setPage(1);
                }}
                className="w-full lg:max-w-[120px]"
              >
                {[10, 20, 50].map((value) => (
                  <SelectItem key={String(value)}>{value}</SelectItem>
                ))}
              </Select>
            </div>

            <Table
              aria-label="Video generations table"
              selectionMode="single"
              color="primary"
              onRowAction={handleRowAction}
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
                <TableColumn>PREVIEW</TableColumn>
                <TableColumn>PROMPT</TableColumn>
                <TableColumn>USER</TableColumn>
                <TableColumn>STATUS</TableColumn>
                <TableColumn>MODEL</TableColumn>
                <TableColumn>CREATED</TableColumn>
                <TableColumn>COMPLETED</TableColumn>
                <TableColumn>ACTIONS</TableColumn>
              </TableHeader>
              <TableBody
                emptyContent={
                  loading ? <Spinner /> : "No video generations found"
                }
                items={items}
              >
                {(item) => (
                  <TableRow key={item.id} className="cursor-pointer">
                    <TableCell>
                      <div className="w-20 h-12 rounded overflow-hidden bg-default-100">
                        <Image
                          src={item.thumbnailUrl || item.sourceImageUrl}
                          alt="Video thumbnail"
                          radius="none"
                          classNames={{
                            wrapper: "w-full h-full !max-w-full",
                            img: "w-full h-full object-cover",
                          }}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm text-default-600 line-clamp-2">
                        {item.params?.prompt || "No prompt"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <UserAvatar
                        name={
                          item.userFirstName && item.userLastName
                            ? `${item.userFirstName} ${item.userLastName}`
                            : item.userFirstName || item.userEmail
                        }
                        description={item.userEmail}
                        avatarProps={{
                          name: (
                            item.userFirstName?.charAt(0) ||
                            item.userEmail?.charAt(0) ||
                            "?"
                          ).toUpperCase(),
                          color: "primary",
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <VideoStatusChip
                        status={item.status}
                        responsive={false}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-default-500">
                        {item.modelId}
                      </span>
                    </TableCell>
                    <TableCell>
                      {new Date(item.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {item.completedAt
                        ? new Date(item.completedAt).toLocaleString()
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="light"
                        onPress={() => setSelectedGeneration(item)}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardBody>
      </Card>

      <Modal
        isOpen={!!selectedGeneration}
        onOpenChange={() => setSelectedGeneration(null)}
        size="4xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Video Generation Details</ModalHeader>
              <ModalBody>
                {selectedGeneration && (
                  <div className="space-y-4">
                    <div className="rounded-lg overflow-hidden bg-black">
                      {selectedGeneration.status === "completed" &&
                      selectedGeneration.videoUrl ? (
                        <video
                          src={selectedGeneration.videoUrl}
                          controls
                          playsInline
                          className="w-full max-h-[60vh]"
                        />
                      ) : (
                        <Image
                          src={
                            selectedGeneration.thumbnailUrl ||
                            selectedGeneration.sourceImageUrl
                          }
                          alt="Video preview"
                          radius="none"
                          classNames={{
                            wrapper: "w-full",
                            img: "w-full h-full object-contain bg-black",
                          }}
                        />
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <VideoStatusChip
                        status={selectedGeneration.status}
                        responsive={false}
                      />
                      <span className="text-default-500">
                        {selectedGeneration.userEmail}
                      </span>
                      <span className="text-default-500">
                        Model: {selectedGeneration.modelId}
                      </span>
                      {selectedGeneration.seed && (
                        <span className="text-default-500">
                          Seed: {selectedGeneration.seed}
                        </span>
                      )}
                    </div>

                    <div className="text-sm text-default-500">
                      Created:{" "}
                      {new Date(selectedGeneration.createdAt).toLocaleString()}
                      {selectedGeneration.completedAt && (
                        <>
                          {" "}
                          • Completed:{" "}
                          {new Date(
                            selectedGeneration.completedAt
                          ).toLocaleString()}
                        </>
                      )}
                    </div>

                    {selectedGeneration.error && (
                      <div className="text-sm text-danger bg-danger-50 p-3 rounded-lg">
                        {selectedGeneration.error}
                      </div>
                    )}

                    <div className="bg-default-100 p-3 rounded-lg">
                      <h4 className="font-medium mb-2 text-sm">Prompt</h4>
                      <p className="text-sm text-default-600 whitespace-pre-wrap">
                        {selectedGeneration.params?.prompt || "No prompt"}
                      </p>
                    </div>

                    <div className="bg-default-100 p-3 rounded-lg">
                      <h4 className="font-medium mb-2 text-sm">Parameters</h4>
                      <pre className="text-xs whitespace-pre-wrap">
                        {JSON.stringify(selectedGeneration.params, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </ModalBody>
              <ModalFooter className="flex-wrap gap-2">
                {selectedGeneration?.videoUrl && (
                  <Button
                    variant="flat"
                    startContent={<ExternalLink size={16} />}
                    onPress={() =>
                      window.open(selectedGeneration.videoUrl!, "_blank")
                    }
                  >
                    Open Video
                  </Button>
                )}
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
