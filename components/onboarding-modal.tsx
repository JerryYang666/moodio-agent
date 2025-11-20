"use client";

import { useState, useEffect } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure } from "@heroui/modal";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api/client";

export const OnboardingModal = () => {
  const { user, refreshUser } = useAuth();
  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if user is logged in and has the "new_user" role
    if (user && user.roles.includes("new_user")) {
      onOpen();
    }
  }, [user, onOpen]);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      // Split the single name field into first and last name for the backend
      const trimmedName = name.trim();
      const nameParts = trimmedName.split(" ");
      const firstName = nameParts[0];
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : undefined;

      await api.post("/api/auth/onboarding", {
        firstName: firstName || undefined,
        lastName: lastName || undefined,
      });
      await refreshUser();
      onClose();
    } catch (error) {
      console.error("Failed to update profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    setLoading(true);
    try {
      // Even if they skip, we call the endpoint to remove the 'new_user' role
      // sending empty names
      await api.post("/api/auth/onboarding", {
        firstName: undefined,
        lastName: undefined,
      });
      await refreshUser();
      onClose();
    } catch (error) {
      console.error("Failed to skip onboarding:", error);
    } finally {
      setLoading(false);
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
            <ModalHeader className="flex flex-col gap-1">Welcome to moodio agent!</ModalHeader>
            <ModalBody>
              <p className="text-default-500 text-sm mb-4">
                How should Moodio call you?
              </p>
              <div className="flex flex-col gap-4">
                <Input
                  placeholder="Your name"
                  value={name}
                  onValueChange={setName}
                  variant="bordered"
                />
              </div>
            </ModalBody>
            <ModalFooter>
              <Button color="danger" variant="light" onPress={handleSkip} isDisabled={loading}>
                Skip
              </Button>
              <Button color="primary" onPress={handleSubmit} isLoading={loading} isDisabled={!name.trim()}>
                Save & Continue
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
