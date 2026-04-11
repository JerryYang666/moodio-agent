"use client";

import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
} from "@heroui/modal";
import { Button } from "@heroui/button";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { LoginForm } from "@/components/auth/LoginForm";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess?: () => void;
}

export function LoginModal({ isOpen, onClose, onLoginSuccess }: LoginModalProps) {
  const t = useTranslations("previewBrowse");

  const handleLoginSuccess = () => {
    if (onLoginSuccess) {
      onLoginSuccess();
    } else {
      window.location.href = "/browse";
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      isDismissable={false}
      hideCloseButton
      size="md"
      scrollBehavior="inside"
    >
      <ModalContent>
        <ModalHeader className="flex items-center justify-between pb-0">
          <span className="text-default-500 text-sm font-normal">
            {t("loginRequired")}
          </span>
          <Button
            isIconOnly
            variant="light"
            size="sm"
            aria-label="Close"
            onPress={onClose}
            className="text-default-400 -mr-2"
          >
            <X size={18} />
          </Button>
        </ModalHeader>
        <ModalBody className="px-6 pb-6">
          <LoginForm onLoginSuccess={handleLoginSuccess} />
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
