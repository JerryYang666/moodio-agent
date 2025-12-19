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
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import { api } from "@/lib/api/client";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@heroui/spinner";
import { Pagination } from "@heroui/pagination";
import dynamic from "next/dynamic";

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

  useEffect(() => {
    if (user && user.roles.includes("admin")) {
      fetchEvents();
    }
  }, [user, page]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const response = await api.get(
        `/api/admin/events?page=${page}&limit=${limit}`
      );
      setEvents(response.data);
      setTotal(response.pagination.total);
      setTotalPages(response.pagination.totalPages);
    } catch (error) {
      console.error("Failed to fetch events:", error);
    } finally {
      setLoading(false);
    }
  };

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
