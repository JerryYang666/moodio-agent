"use client";

import { useState, useEffect } from "react";
import { Input } from "@heroui/input";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { useAuth } from "@/hooks/use-auth";
import { startRegistration } from "@simplewebauthn/browser";
import { Key } from "lucide-react";

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", content: "" });
  
  const [passkeys, setPasskeys] = useState<any[]>([]);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || "");
      setLastName(user.lastName || "");
      fetchPasskeys();
    }
  }, [user]);

  const fetchPasskeys = async () => {
    try {
      const res = await fetch("/api/users/passkeys");
      if (res.ok) {
        const data = await res.json();
        setPasskeys(data.passkeys);
      }
    } catch (error) {
      console.error("Failed to fetch passkeys", error);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: "", content: "" });

    try {
      const res = await fetch("/api/users/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName }),
      });

      if (res.ok) {
        setMessage({ type: "success", content: "Profile updated successfully" });
        refreshUser();
      } else {
        setMessage({ type: "error", content: "Failed to update profile" });
      }
    } catch (error) {
      setMessage({ type: "error", content: "An error occurred" });
    } finally {
      setLoading(false);
    }
  };

  const handleAddPasskey = async () => {
    setPasskeyLoading(true);
    setMessage({ type: "", content: "" });
    try {
      // 1. Get options
      const resp = await fetch("/api/auth/passkey/register/options", { method: "POST" });
      const options = await resp.json();
      
      if (options.error) throw new Error(options.error);

      // 2. Start registration
      const attResp = await startRegistration(options);

      // 3. Verify
      const verifyResp = await fetch("/api/auth/passkey/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attResp),
      });

      const verification = await verifyResp.json();

      if (verification.verified) {
        setMessage({ type: "success", content: "Passkey added successfully" });
        fetchPasskeys();
      } else {
        throw new Error(verification.error || "Verification failed");
      }
    } catch (error) {
      console.error(error);
      setMessage({ type: "error", content: error instanceof Error ? error.message : "Failed to add passkey" });
    } finally {
      setPasskeyLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-2">Profile Settings</h1>
        <p className="text-default-500">Manage your account information and security</p>
      </div>

      <Card>
        <CardHeader className="pb-0 pt-4 px-4 flex-col items-start">
          <h2 className="text-lg font-semibold">Personal Information</h2>
        </CardHeader>
        <CardBody>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="First Name"
                value={firstName}
                onValueChange={setFirstName}
                variant="bordered"
              />
              <Input
                label="Last Name"
                value={lastName}
                onValueChange={setLastName}
                variant="bordered"
              />
            </div>
            <div className="flex justify-between items-center">
               <div className="text-sm">
                 {message.content && (
                   <span className={message.type === "error" ? "text-danger" : "text-success"}>
                     {message.content}
                   </span>
                 )}
               </div>
               <Button color="primary" type="submit" isLoading={loading}>
                 Save Changes
               </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="pb-0 pt-4 px-4 flex-col items-start">
          <h2 className="text-lg font-semibold">Security</h2>
          <p className="text-small text-default-500">Manage your passkeys for passwordless login</p>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              <span className="font-medium">Passkeys</span>
            </div>
            <Button 
              size="sm" 
              color="primary" 
              variant="flat" 
              onPress={handleAddPasskey}
              isLoading={passkeyLoading}
            >
              Add Passkey
            </Button>
          </div>
          
          <div className="space-y-2">
            {passkeys.length === 0 ? (
              <p className="text-sm text-default-400 italic">No passkeys registered yet.</p>
            ) : (
              passkeys.map((pk) => (
                <div key={pk.id} className="flex items-center justify-between p-3 rounded-lg bg-default-50 border border-default-100">
                  <div className="flex flex-col">
                     <span className="text-sm font-medium">Passkey ({pk.deviceType})</span>
                     <span className="text-xs text-default-400">Added on {new Date(pk.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

