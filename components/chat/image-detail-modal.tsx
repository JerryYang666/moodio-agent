"use client";

import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { Button } from "@heroui/button";

interface ImageDetailModalProps {
  isOpen: boolean;
  onOpenChange: () => void;
  selectedImage: {
    url: string;
    title: string;
    prompt: string;
  } | null;
  onClose: () => void;
}

export default function ImageDetailModal({
  isOpen,
  onOpenChange,
  selectedImage,
  onClose,
}: ImageDetailModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="5xl"
      backdrop="blur"
      scrollBehavior="inside"
      classNames={{
        base: "max-h-[90vh]",
      }}
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              {selectedImage?.title}
            </ModalHeader>
            <ModalBody>
              {selectedImage && (
                <div className="flex flex-col md:flex-row gap-6 md:h-full">
                  <div className="w-full md:w-1/2 flex items-center justify-center bg-black/5 rounded-lg min-h-[200px] md:min-h-[400px]">
                    <img
                      src={selectedImage.url}
                      alt={selectedImage.title}
                      className="max-w-full max-h-[40vh] md:max-h-[60vh] object-contain rounded-lg"
                    />
                  </div>
                  <div className="w-full md:w-1/2 flex flex-col">
                    <div className="bg-default-100 p-4 rounded-lg text-sm md:flex-1 md:overflow-y-auto">
                      <p className="font-semibold mb-2 text-base">Prompt:</p>
                      <p className="text-default-600 leading-relaxed whitespace-pre-wrap">
                        {selectedImage.prompt}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button color="primary" onPress={onClose}>
                Close
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

