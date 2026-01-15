"use client";

import { useTranslations } from "next-intl";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button } from "@heroui/button";
import { Bell } from "lucide-react";
import { useState, forwardRef, useImperativeHandle } from "react";

const NOTIFICATION_ASKED_KEY = "moodio_notification_asked";

export interface NotificationPermissionModalRef {
  checkPermission: () => void;
}

export const NotificationPermissionModal = forwardRef<NotificationPermissionModalRef>((props, ref) => {
  const t = useTranslations("notifications");
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
          {t("enableTitle")}
        </ModalHeader>
        <ModalBody className="text-center">
          <p className="text-default-500">
            {t("enableDescription")}
          </p>
        </ModalBody>
        <ModalFooter className="justify-center">
          <Button variant="light" onPress={handleDecline}>
            {t("noThanks")}
          </Button>
          <Button color="primary" onPress={handleAllow}>
            {t("enable")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
});

NotificationPermissionModal.displayName = "NotificationPermissionModal";
