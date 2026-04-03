"use client";

import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { Button } from "@heroui/button";
import { Image } from "@heroui/image";
import { Video, Download } from "lucide-react";
import type { AssetItem } from "@/lib/types/asset";

export interface VideoDetailModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  asset: AssetItem | null;
  onDownload: (asset: AssetItem) => void;
  labels: {
    videoDetails: string;
    untitledVideo: string;
    download: string;
    close: string;
  };
}

export default function VideoDetailModal({
  isOpen,
  onOpenChange,
  asset,
  onDownload,
  labels,
}: VideoDetailModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="4xl"
      scrollBehavior="inside"
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center gap-2">
              <Video size={20} />
              {labels.videoDetails}
            </ModalHeader>
            <ModalBody>
              {asset && (
                <div className="space-y-4">
                  <div className="rounded-lg overflow-hidden bg-black">
                    {asset.videoUrl ? (
                      <video
                        src={asset.videoUrl}
                        controls
                        autoPlay
                        playsInline
                        className="w-full max-h-[60vh]"
                      />
                    ) : (
                      <div className="aspect-video flex items-center justify-center">
                        <Image
                          src={asset.imageUrl}
                          alt={asset.generationDetails?.title || "Video"}
                          classNames={{
                            wrapper: "w-full h-full",
                            img: "w-full h-full object-contain",
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="bg-default-100 p-4 rounded-lg">
                    <h4 className="font-medium mb-2">
                      {asset.generationDetails?.title || labels.untitledVideo}
                    </h4>
                    {asset.generationDetails?.prompt && (
                      <p className="text-sm text-default-600 whitespace-pre-wrap">
                        {asset.generationDetails.prompt}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              {asset?.videoUrl && (
                <Button
                  color="primary"
                  startContent={<Download size={16} />}
                  onPress={() => onDownload(asset)}
                >
                  {labels.download}
                </Button>
              )}
              <Button variant="light" onPress={onClose}>
                {labels.close}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
