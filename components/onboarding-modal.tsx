"use client";

import { useState, useEffect } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure } from "@heroui/modal";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api/client";
import { startRegistration } from "@simplewebauthn/browser";
import { Key, Check } from "lucide-react";
import { addToast } from "@heroui/toast";

export const OnboardingModal = () => {
  const { user, refreshUser } = useAuth();
  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyAdded, setPasskeyAdded] = useState(false);

  useEffect(() => {
    // Check if user is logged in and has the "new_user" role
    if (user && user.roles.includes("new_user")) {
      onOpen();
      setStep(1);
      setPasskeyAdded(false);
      setName("");
    }
  }, [user, onOpen]);

  const handleFinalize = async (skipNameUpdate = false) => {
    setLoading(true);
    try {
      // Split the single name field into first and last name for the backend
      const trimmedName = name.trim();
      const nameParts = trimmedName.split(" ");
      const firstName = skipNameUpdate ? undefined : nameParts[0];
      const lastName = skipNameUpdate ? undefined : (nameParts.length > 1 ? nameParts.slice(1).join(" ") : undefined);

      await api.post("/api/auth/onboarding", {
        firstName: firstName || undefined,
        lastName: lastName || undefined,
      });
      await refreshUser();
      onClose();
    } catch (error) {
      console.error("Failed to complete onboarding:", error);
      addToast({ title: "Failed to complete onboarding", color: "danger" });
    } finally {
      setLoading(false);
    }
  };

  const handleStep1Next = () => {
    setStep(2);
  };

  const handleStep1Skip = () => {
    setName(""); // Clear name if they skip step 1 explicitly
    setStep(2);
  };

  const handleAddPasskey = async () => {
    setPasskeyLoading(true);
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
        setPasskeyAdded(true);
        addToast({ title: "Passkey added successfully", color: "success" });
      } else {
        throw new Error(verification.error || "Verification failed");
      }
    } catch (error) {
      console.error(error);
      addToast({ 
        title: error instanceof Error ? error.message : "Failed to add passkey", 
        color: "danger" 
      });
    } finally {
      setPasskeyLoading(false);
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onOpenChange={onOpenChange}
      isDismissable={false}
      hideCloseButton={true}
      backdrop="blur"
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              {step === 1 ? "Welcome to moodio agent!" : "Enhance your Security"}
            </ModalHeader>
            <ModalBody>
              {step === 1 ? (
                <>
                  <p className="text-default-500 text-sm mb-2">
                    How should Moodio call you?
                  </p>
                  <div className="flex flex-col gap-4">
                    <Input
                      placeholder="Your name"
                      value={name}
                      onValueChange={setName}
                      variant="bordered"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && name.trim()) {
                          handleStep1Next();
                        }
                      }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <p className="text-default-500 text-sm mb-2">
                    Want an easier and faster way to login? Add a passkey to sign in without a password, and no more waiting for the email code.
                  </p>
                  <div className="flex flex-col gap-4 items-center py-4">
                    {passkeyAdded ? (
                      <div className="flex flex-col items-center gap-2 text-success">
                        <div className="p-3 rounded-full bg-success/10">
                          <Check size={32} />
                        </div>
                        <p className="font-medium">Passkey Added!</p>
                      </div>
                    ) : (
                      <Button 
                        size="lg" 
                        color="primary" 
                        variant="flat" 
                        className="w-full max-w-xs"
                        onPress={handleAddPasskey}
                        isLoading={passkeyLoading}
                        startContent={<Key />}
                      >
                        Add Passkey
                      </Button>
                    )}
                  </div>
                </>
              )}
            </ModalBody>
            <ModalFooter>
              {step === 1 ? (
                <>
                  <Button color="danger" variant="light" onPress={handleStep1Skip}>
                    Skip
                  </Button>
                  <Button color="primary" onPress={handleStep1Next} isDisabled={!name.trim()}>
                    Next
                  </Button>
                </>
              ) : (
                <>
                  <Button 
                    color="default" 
                    variant="light" 
                    onPress={() => handleFinalize(false)} 
                    isDisabled={loading}
                  >
                    {passkeyAdded ? "Skip" : "Skip"}
                  </Button>
                  <Button 
                    color="primary" 
                    onPress={() => handleFinalize(false)} 
                    isLoading={loading}
                  >
                    Finish
                  </Button>
                </>
              )}
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
