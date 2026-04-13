"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/table";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Select, SelectItem } from "@heroui/select";
import { Pagination } from "@heroui/pagination";
import { Spinner } from "@heroui/spinner";
import { api } from "@/lib/api/client";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
  RefreshCw,
  MessageSquare,
} from "lucide-react";

interface FeedbackRow {
  id: string;
  userId: string;
  entityType: string;
  entityId: string;
  feedback: { thumbs?: "up" | "down"; comment?: string };
  createdAt: string;
  updatedAt: string;
  userEmail: string | null;
  userFirstName: string | null;
  userLastName: string | null;
}

function parseChatMessageEntityId(entityId: string) {
  const parts = entityId.split(":");
  if (parts.length >= 3) {
    return {
      chatId: parts[0],
      messageTimestamp: parts[1],
      variantId: parts[2] === "_" ? undefined : parts[2],
    };
  }
  return null;
}

export default function FeedbackPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [feedbackItems, setFeedbackItems] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);

  const [filterEntityType, setFilterEntityType] = useState("");
  const [filterThumbs, setFilterThumbs] = useState("");
  const [filterUserId, setFilterUserId] = useState("");
  const [activeUserId, setActiveUserId] = useState("");

  const ENTITY_TYPES = ["chat_message"];
  const THUMBS_OPTIONS = ["up", "down"];

  const fetchFeedback = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (filterEntityType) params.set("entityType", filterEntityType);
      if (filterThumbs) params.set("thumbs", filterThumbs);
      if (activeUserId.trim()) params.set("userId", activeUserId.trim());

      const response = await api.get(
        `/api/admin/feedback?${params.toString()}`
      );
      setFeedbackItems(response.data);
      setTotal(response.pagination.total);
      setTotalPages(response.pagination.totalPages);
    } catch (error) {
      console.error("Failed to fetch feedback:", error);
    } finally {
      setLoading(false);
    }
  }, [page, limit, filterEntityType, filterThumbs, activeUserId]);

  useEffect(() => {
    if (user && user.roles.includes("admin")) {
      fetchFeedback();
    }
  }, [user, fetchFeedback]);

  const handleCommitUserId = () => {
    setActiveUserId(filterUserId.trim());
    setPage(1);
  };

  const handleClearFilters = () => {
    setFilterEntityType("");
    setFilterThumbs("");
    setFilterUserId("");
    setActiveUserId("");
    setPage(1);
  };

  const hasActiveFilters = filterEntityType || filterThumbs || activeUserId;

  const handleGoToMessage = (item: FeedbackRow) => {
    if (item.entityType !== "chat_message") return;
    const parsed = parseChatMessageEntityId(item.entityId);
    if (!parsed) return;
    const params = new URLSearchParams();
    params.set("messageTimestamp", parsed.messageTimestamp);
    router.push(`/chat/${parsed.chatId}?${params.toString()}`);
  };

  const getUserDisplay = (item: FeedbackRow) => {
    if (item.userFirstName || item.userLastName) {
      return `${item.userFirstName || ""} ${item.userLastName || ""}`.trim();
    }
    return item.userEmail || item.userId.slice(0, 8);
  };

  if (authLoading) {
    return <Spinner size="lg" className="flex justify-center mt-10" />;
  }

  if (!user || !user.roles.includes("admin")) {
    return <div className="p-8 text-center">Unauthorized</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-bold">User Feedback</h1>
        </div>
        <Button
          onPress={fetchFeedback}
          color="primary"
          variant="flat"
          size="sm"
          startContent={<RefreshCw size={14} />}
        >
          Refresh
        </Button>
      </div>

      <Card>
        <CardBody>
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <Select
              label="Entity Type"
              placeholder="All types"
              className="sm:max-w-[200px]"
              selectedKeys={
                filterEntityType ? new Set([filterEntityType]) : new Set()
              }
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as string | undefined;
                setFilterEntityType(selected ?? "");
                setPage(1);
              }}
            >
              {ENTITY_TYPES.map((type) => (
                <SelectItem key={type}>{type}</SelectItem>
              ))}
            </Select>
            <Select
              label="Thumbs"
              placeholder="All"
              className="sm:max-w-[150px]"
              selectedKeys={
                filterThumbs ? new Set([filterThumbs]) : new Set()
              }
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as string | undefined;
                setFilterThumbs(selected ?? "");
                setPage(1);
              }}
            >
              {THUMBS_OPTIONS.map((opt) => (
                <SelectItem key={opt}>
                  {opt === "up" ? "👍 Up" : "👎 Down"}
                </SelectItem>
              ))}
            </Select>
            <Input
              label="User ID"
              placeholder="Paste a user ID..."
              className="sm:max-w-[300px]"
              value={filterUserId}
              onValueChange={setFilterUserId}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCommitUserId();
              }}
              startContent={<Search size={16} className="text-default-400" />}
              isClearable
              onClear={() => {
                setFilterUserId("");
                setActiveUserId("");
                setPage(1);
              }}
            />
            {hasActiveFilters && (
              <Button
                size="sm"
                variant="flat"
                startContent={<X size={14} />}
                onPress={handleClearFilters}
              >
                Clear
              </Button>
            )}
            {total > 0 && (
              <span className="text-sm text-default-500 ml-auto whitespace-nowrap">
                {total.toLocaleString()} item{total !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <Table
            aria-label="User feedback table"
            bottomContent={
              totalPages > 1 ? (
                <div className="flex w-full justify-center">
                  <Pagination
                    isCompact
                    showControls
                    showShadow
                    color="primary"
                    page={page}
                    total={totalPages}
                    onChange={(p) => setPage(p)}
                  />
                </div>
              ) : null
            }
          >
            <TableHeader>
              <TableColumn>THUMBS</TableColumn>
              <TableColumn>USER</TableColumn>
              <TableColumn>TYPE</TableColumn>
              <TableColumn>COMMENT</TableColumn>
              <TableColumn>DATE</TableColumn>
              <TableColumn>ACTIONS</TableColumn>
            </TableHeader>
            <TableBody
              emptyContent={loading ? <Spinner /> : "No feedback found"}
              items={feedbackItems}
            >
              {(item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    {item.feedback?.thumbs === "up" ? (
                      <Chip
                        size="sm"
                        variant="flat"
                        color="success"
                        startContent={<ThumbsUp size={12} />}
                      >
                        Up
                      </Chip>
                    ) : item.feedback?.thumbs === "down" ? (
                      <Chip
                        size="sm"
                        variant="flat"
                        color="danger"
                        startContent={<ThumbsDown size={12} />}
                      >
                        Down
                      </Chip>
                    ) : (
                      <Chip size="sm" variant="flat">
                        —
                      </Chip>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-small">
                        {getUserDisplay(item)}
                      </span>
                      {item.userEmail && (
                        <span className="text-tiny text-default-400">
                          {item.userEmail}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Chip size="sm" variant="flat" color="default">
                      {item.entityType}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    {item.feedback?.comment ? (
                      <span className="text-small text-default-700 max-w-xs truncate block">
                        {item.feedback.comment}
                      </span>
                    ) : (
                      <span className="text-tiny text-default-400">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-small text-default-500">
                      {new Date(item.updatedAt).toLocaleString()}
                    </span>
                  </TableCell>
                  <TableCell>
                    {item.entityType === "chat_message" && (
                      <Button
                        size="sm"
                        variant="light"
                        color="primary"
                        startContent={<ExternalLink size={14} />}
                        onPress={() => handleGoToMessage(item)}
                      >
                        View
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
