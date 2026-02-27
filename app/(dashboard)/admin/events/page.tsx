"use client";

import { useEffect, useState } from "react";
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
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import { Select, SelectItem } from "@heroui/select";
import { api } from "@/lib/api/client";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@heroui/spinner";
import { Pagination } from "@heroui/pagination";
import dynamic from "next/dynamic";
import { Search, X } from "lucide-react";

const JsonEditor = dynamic(() => import("@/components/JsonEditor"), {
  ssr: false,
});

interface Event {
  id: string;
  eventType: string;
  userId: string | null;
  timestamp: string;
  ipAddress: string | null;
  metadata: any;
}

export default function EventsPage() {
  const { user, loading: authLoading } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  // Filter state
  const [filterEventType, setFilterEventType] = useState("");
  const [filterUserId, setFilterUserId] = useState("");

  // The committed filter value that triggers API calls (only updated on Enter / clear)
  const [activeUserId, setActiveUserId] = useState("");

  const EVENT_TYPES = [
    "retrieval_search",
    "user_sent_message",
    "image_generation",
    "video_generation",
    "video_generation_refund",
    "video_generation_recovery",
  ];

  useEffect(() => {
    if (user && user.roles.includes("admin")) {
      fetchEvents();
    }
  }, [user, page, filterEventType, activeUserId]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (filterEventType) params.set("type", filterEventType);
      if (activeUserId.trim()) params.set("userId", activeUserId.trim());

      const response = await api.get(`/api/admin/events?${params.toString()}`);
      setEvents(response.data);
      setTotal(response.pagination.total);
      setTotalPages(response.pagination.totalPages);
    } catch (error) {
      console.error("Failed to fetch events:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCommitUserId = () => {
    setActiveUserId(filterUserId.trim());
    setPage(1);
  };

  const handleClearFilters = () => {
    setFilterEventType("");
    setFilterUserId("");
    setActiveUserId("");
    setPage(1);
  };

  const hasActiveFilters = filterEventType || activeUserId;

  const handleViewDetails = (event: Event) => {
    setSelectedEvent(event);
    onOpen();
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
        <h1 className="text-2xl font-bold">Telemetry Events</h1>
        <Button onPress={fetchEvents} color="primary" variant="flat" size="sm">
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardBody>
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <Select
              label="Event Type"
              placeholder="All event types"
              className="sm:max-w-[220px]"
              selectedKeys={filterEventType ? new Set([filterEventType]) : new Set()}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as string | undefined;
                setFilterEventType(selected ?? "");
                setPage(1);
              }}
            >
              {EVENT_TYPES.map((type) => (
                <SelectItem key={type}>{type}</SelectItem>
              ))}
            </Select>
            <Input
              label="User ID"
              placeholder="Paste a user ID..."
              className="sm:max-w-[320px]"
              value={filterUserId}
              onValueChange={setFilterUserId}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCommitUserId();
              }}
              startContent={<Search size={16} className="text-default-400" />}
              isClearable
              onClear={() => { setFilterUserId(""); setActiveUserId(""); setPage(1); }}
            />
            {hasActiveFilters && (
              <Button
                size="sm"
                variant="flat"
                startContent={<X size={14} />}
                onPress={handleClearFilters}
              >
                Clear filters
              </Button>
            )}
            {total > 0 && (
              <span className="text-sm text-default-500 ml-auto whitespace-nowrap">
                {total.toLocaleString()} event{total !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <Table
            aria-label="Events table"
            bottomContent={
              totalPages > 0 ? (
                <div className="flex w-full justify-center">
                  <Pagination
                    isCompact
                    showControls
                    showShadow
                    color="primary"
                    page={page}
                    total={totalPages}
                    onChange={(page) => setPage(page)}
                  />
                </div>
              ) : null
            }
          >
            <TableHeader>
              <TableColumn>EVENT TYPE</TableColumn>
              <TableColumn>USER ID</TableColumn>
              <TableColumn>IP ADDRESS</TableColumn>
              <TableColumn>TIMESTAMP</TableColumn>
              <TableColumn>METADATA</TableColumn>
            </TableHeader>
            <TableBody
              emptyContent={loading ? <Spinner /> : "No events found"}
              items={events}
            >
              {(item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Chip
                      size="sm"
                      variant="flat"
                      color={
                        item.eventType === "image_generation"
                          ? "secondary"
                          : "primary"
                      }
                    >
                      {item.eventType}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    <span className="text-small text-default-500">
                      {item.userId || "Anonymous"}
                    </span>
                  </TableCell>
                  <TableCell>{item.ipAddress || "-"}</TableCell>
                  <TableCell>
                    {new Date(item.timestamp).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="light"
                      onPress={() => handleViewDetails(item)}
                    >
                      View Details
                    </Button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      <Modal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        size="5xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Event Details</ModalHeader>
              <ModalBody>
                {selectedEvent && (
                  <div className="h-[600px]">
                    <JsonEditor
                      value={selectedEvent.metadata}
                      onChange={() => {}}
                      readOnly={true}
                      mode="view"
                    />
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button onPress={onClose}>Close</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
