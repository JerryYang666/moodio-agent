"use client";

import { useState } from "react";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { api } from "@/lib/api/client";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@heroui/spinner";

export default function SystemManagementPage() {
  const { user, loading: authLoading } = useAuth();
  const [cleaningTokens, setCleaningTokens] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);

  const handleCleanupTokens = async () => {
    setCleaningTokens(true);
    setCleanupResult(null);
    try {
      await api.post("/api/admin/cleanup-tokens", {});
      setCleanupResult("Successfully deleted expired refresh tokens.");
    } catch (error) {
      setCleanupResult("Failed to delete expired refresh tokens.");
      console.error(error);
    } finally {
      setCleaningTokens(false);
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
      <h1 className="text-2xl font-bold">System Management</h1>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Refresh Tokens</h2>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-500">
              Delete expired refresh tokens from the database. This operation scans the entire refresh tokens table and removes tokens that have passed their expiration time.
            </p>
            <div className="flex items-center gap-4">
              <Button 
                color="danger" 
                variant="flat"
                onPress={handleCleanupTokens}
                isLoading={cleaningTokens}
              >
                Delete Expired Refresh Tokens
              </Button>
              {cleanupResult && (
                <p className={`text-sm ${cleanupResult.includes("Failed") ? "text-red-500" : "text-green-500"}`}>
                  {cleanupResult}
                </p>
              )}
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

