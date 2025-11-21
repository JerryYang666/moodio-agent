"use client";

import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button } from "@heroui/button";
import { Bell } from "lucide-react";
import { useState, forwardRef, useImperativeHandle } from "react";

const NOTIFICATION_ASKED_KEY = "moodio_notification_asked";

export interface NotificationPermissionModalRef {
  checkPermission: () => void;
}

export const NotificationPermissionModal = forwardRef<NotificationPermissionModalRef>((props, ref) => {
  const [isOpen, setIsOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    checkPermission: () => {
      try {
        if (!("Notification" in window)) return;

        const hasAsked = localStorage.getItem(NOTIFICATION_ASKED_KEY);
        
        if (Notification.permission === "default" && !hasAsked) {
          setIsOpen(true);
        }
      } catch (error) {
        console.error("Error checking notification permission:", error);
      }
    }
  }));

  const handleAllow = async () => {
    try {
      await Notification.requestPermission();
    } catch (e) {
      console.error(e);
    }
    localStorage.setItem(NOTIFICATION_ASKED_KEY, "true");
    setIsOpen(false);
  };

  const handleDecline = () => {
    localStorage.setItem(NOTIFICATION_ASKED_KEY, "true");
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
});

NotificationPermissionModal.displayName = "NotificationPermissionModal";
