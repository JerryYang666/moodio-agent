"use client";

import { useRouter } from "next/navigation";
import { Card, CardBody, CardFooter, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@heroui/spinner";
import { Users, MessageSquare } from "lucide-react";

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  if (authLoading) {
    return <Spinner size="lg" className="flex justify-center mt-10" />;
  }

  if (!user || !user.roles.includes("admin")) {
    return <div className="p-8 text-center">Unauthorized</div>;
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Admin Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* User Management Card */}
        <Card className="py-4 cursor-pointer hover:scale-[1.02] transition-transform" onPress={() => router.push("/admin/user-management")}>
          <CardHeader className="pb-0 pt-2 px-4 flex-row gap-2 items-center">
            <Users className="w-6 h-6 text-primary" />
            <div className="flex flex-col">
              <p className="text-tiny uppercase font-bold">Management</p>
              <h4 className="font-bold text-large">Users</h4>
            </div>
          </CardHeader>
          <CardBody className="overflow-visible py-2">
            <p className="text-default-500">Manage users, roles, invitations, and OTPs.</p>
          </CardBody>
          <CardFooter>
            <Button color="primary" variant="flat" onPress={() => router.push("/admin/user-management")}>
              Go to User Management
            </Button>
          </CardFooter>
        </Card>

        {/* Chat Management Card */}
        <Card className="py-4 cursor-pointer hover:scale-[1.02] transition-transform" onPress={() => router.push("/admin/chat-management")}>
          <CardHeader className="pb-0 pt-2 px-4 flex-row gap-2 items-center">
            <MessageSquare className="w-6 h-6 text-primary" />
            <div className="flex flex-col">
               <p className="text-tiny uppercase font-bold">Management</p>
               <h4 className="font-bold text-large">Chats</h4>
            </div>
          </CardHeader>
          <CardBody className="overflow-visible py-2">
             <p className="text-default-500">View all chats, monitor activity, and history.</p>
          </CardBody>
          <CardFooter>
            <Button color="primary" variant="flat" onPress={() => router.push("/admin/chat-management")}>
              Go to Chat Management
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
