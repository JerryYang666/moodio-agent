"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Card } from "@heroui/card";
import { Spinner } from "@heroui/spinner";
import { Chip } from "@heroui/chip";
import { useAuth } from "@/hooks/use-auth";

export default function Home() {
  const router = useRouter();
  const { user, loading, error, logout, loggingOut } = useAuth();
  const [testResult, setTestResult] = useState<any>(null);
  const [testLoading, setTestLoading] = useState(false);

  const handleTestProtectedAPI = async () => {
    setTestLoading(true);
    setTestResult(null);

    try {
      const data = await fetch("/api/test/protected", {
        headers: {
          "Content-Type": "application/json",
        },
      });
      setTestResult(await data.json());
    } catch (err) {
      setTestResult({
        error:
          err instanceof Error ? err.message : "Failed to fetch protected data",
      });
    } finally {
      setTestLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="p-6 max-w-md">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </Card>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const displayName =
    user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.firstName || user.email.split("@")[0];

  return (
    <div className="flex items-center justify-center min-h-[60vh] pt-20">
      <Card className="w-full max-w-2xl p-8">
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-2">Welcome back!</h1>
            <p className="text-xl text-gray-600 dark:text-gray-400">
              {displayName}
            </p>
          </div>

          <div className="space-y-4 p-6 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Email
                </p>
                <p className="font-medium">{user.email}</p>
              </div>

              {user.firstName && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    First Name
                  </p>
                  <p className="font-medium">{user.firstName}</p>
                </div>
              )}

              {user.lastName && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Last Name
                  </p>
                  <p className="font-medium">{user.lastName}</p>
                </div>
              )}

              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Auth Provider
                </p>
                <p className="font-medium capitalize">{user.authProvider}</p>
              </div>

              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Roles
                </p>
                <div className="flex gap-2 flex-wrap">
                  {user.roles.map((role) => (
                    <Chip
                      key={role}
                      color="primary"
                      size="sm"
                      variant="flat"
                    >
                      {role}
                    </Chip>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Member Since
                </p>
                <p className="font-medium">
                  {new Date(user.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-center gap-4 pt-4">
              <Button
                color="primary"
                variant="flat"
                size="lg"
                onPress={handleTestProtectedAPI}
                isLoading={testLoading}
              >
                Test Protected API
              </Button>
              <Button
                color="secondary"
                variant="flat"
                size="lg"
                onPress={() => router.push("/chat")}
              >
                Go to agent
              </Button>
            </div>

            {testResult && (
              <div className="p-4 rounded-lg bg-gray-100 dark:bg-gray-800">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-mono">
                  Response from /api/test/protected:
                </p>
                <pre className="text-sm overflow-x-auto">
                  {JSON.stringify(testResult, null, 2)}
                </pre>
              </div>
            )}
          </div>

          <div className="flex justify-center pt-4 border-t border-gray-200 dark:border-gray-700 mt-6">
            <Button
              color="danger"
              variant="flat"
              size="lg"
              onPress={logout}
              isLoading={loggingOut}
            >
              Logout
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
