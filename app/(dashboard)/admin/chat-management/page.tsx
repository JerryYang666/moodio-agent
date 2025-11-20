"use client";

import { useEffect, useState } from "react";
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
import { api } from "@/lib/api/client";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@heroui/spinner";

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
          <Table 
            aria-label="Chat table"
            selectionMode="single"
            color="primary"
            onRowAction={(key) => router.push(`/chat/${key}`)}
          >
            <TableHeader>
              <TableColumn>CHAT NAME</TableColumn>
              <TableColumn>USER</TableColumn>
              <TableColumn>STARTED</TableColumn>
              <TableColumn>LAST UPDATED</TableColumn>
            </TableHeader>
            <TableBody
              emptyContent={loading ? <Spinner /> : "No chats found"}
              items={chats}
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
        </CardBody>
      </Card>
    </div>
  );
}
