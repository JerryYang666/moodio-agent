"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/table";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { User as UserAvatar } from "@heroui/user";
import { Input } from "@heroui/input";
import { Pagination } from "@heroui/pagination";
import { api } from "@/lib/api/client";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@heroui/spinner";
import { SearchIcon } from "@/components/icons";

interface ChatData {
  id: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
  userId: string;
  userEmail: string;
  userFirstName: string | null;
  userLastName: string | null;
}

export default function ChatManagementPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [chats, setChats] = useState<ChatData[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination & Search State
  const [filterValue, setFilterValue] = useState("");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  useEffect(() => {
    if (user && user.roles.includes("admin")) {
      fetchChats();
    }
  }, [user]);

  const fetchChats = async () => {
    try {
      const data = await api.get("/api/admin/chats");
      setChats(data.chats);
    } catch (error) {
      console.error("Failed to fetch chats:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filter logic
  const filteredItems = useMemo(() => {
    let filteredChats = [...chats];

    if (filterValue) {
      const lowerFilter = filterValue.toLowerCase();
      filteredChats = filteredChats.filter((chat) => 
        (chat.name && chat.name.toLowerCase().includes(lowerFilter)) ||
        chat.userEmail.toLowerCase().includes(lowerFilter) ||
        (chat.userFirstName && chat.userFirstName.toLowerCase().includes(lowerFilter)) ||
        (chat.userLastName && chat.userLastName.toLowerCase().includes(lowerFilter))
      );
    }

    return filteredChats;
  }, [chats, filterValue]);

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

  if (authLoading) {
    return <Spinner size="lg" className="flex justify-center mt-10" />;
  }

  if (!user || !user.roles.includes("admin")) {
    return <div className="p-8 text-center">Unauthorized</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Chat Management</h1>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">All Chats</h2>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <div className="flex justify-between gap-3 items-end">
               <Input
                isClearable
                className="w-full sm:max-w-[44%]"
                placeholder="Search by chat name or user..."
                startContent={<SearchIcon />}
                value={filterValue}
                onClear={() => onClear()}
                onValueChange={onSearchChange}
              />
            </div>
            <Table 
              aria-label="Chat table"
              selectionMode="single"
              color="primary"
              onRowAction={(key) => router.push(`/chat/${key}`)}
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
                <TableColumn>CHAT NAME</TableColumn>
                <TableColumn>USER</TableColumn>
                <TableColumn>STARTED</TableColumn>
                <TableColumn>LAST UPDATED</TableColumn>
              </TableHeader>
              <TableBody
                emptyContent={loading ? <Spinner /> : "No chats found"}
                items={items}
              >
                {(item) => (
                  <TableRow key={item.id} className="cursor-pointer">
                    <TableCell>
                      {item.name || "Untitled Chat"}
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
                      {new Date(item.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {new Date(item.updatedAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
