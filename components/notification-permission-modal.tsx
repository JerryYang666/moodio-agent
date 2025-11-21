"use client";

import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button } from "@heroui/button";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";

export function NotificationPermissionModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Check if browser supports notifications
    if (!("Notification" in window)) return;

    // Only show if permission is default (not granted or denied)
    // and we haven't asked in this session (optional, or rely on local storage)
    const hasAsked = localStorage.getItem("notification_asked");
    
    if (Notification.permission === "default" && !hasAsked) {
      // Small delay to not annoy immediately on load
      const timer = setTimeout(() => setIsOpen(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAllow = async () => {
    try {
      await Notification.requestPermission();
    } catch (e) {
      console.error(e);
    }
    localStorage.setItem("notification_asked", "true");
    setIsOpen(false);
  };

  const handleDecline = () => {
    localStorage.setItem("notification_asked", "true");
    setIsOpen(false);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={setIsOpen} hideCloseButton>
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1 items-center text-center">
          <div className="bg-primary/10 p-3 rounded-full mb-2">
            <Bell size={24} className="text-primary" />
          </div>
          Enable Notifications
        </ModalHeader>
        <ModalBody className="text-center">
          <p className="text-default-500">
            Image generation can take some time. Enable notifications to get alerted when your results are ready, so you can freely browse other tabs or pages.
          </p>
        </ModalBody>
        <ModalFooter className="justify-center">
          <Button variant="light" onPress={handleDecline}>
            No thanks
          </Button>
          <Button color="primary" onPress={handleAllow}>
            Enable Notifications
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

