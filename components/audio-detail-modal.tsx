"use client";

import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { Button } from "@heroui/button";
import { Music } from "lucide-react";
import AudioPlayer from "@/components/audio-player";
import type { AssetItem } from "@/lib/types/asset";

export interface AudioDetailModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  asset: AssetItem | null;
  onDownload: (asset: AssetItem) => void;
  labels: {
    audioDetails: string;
    untitledAudio: string;
    download: string;
    close: string;
  };
}

export default function AudioDetailModal({
  isOpen,
  onOpenChange,
  asset,
  onDownload,
  labels,
}: AudioDetailModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="2xl"
      scrollBehavior="inside"
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center gap-2">
              <Music size={20} />
              {labels.audioDetails}
            </ModalHeader>
            <ModalBody>
              {asset && (
                <div className="space-y-4">
                  {asset.audioUrl ? (
                    <AudioPlayer
                      src={asset.audioUrl}
                      title={asset.generationDetails?.title || labels.untitledAudio}
                      variant="full"
                      autoPlay
                      onDownload={() => onDownload(asset)}
                    />
                  ) : (
                    <div className="rounded-lg overflow-hidden bg-linear-to-br from-violet-500/20 to-purple-600/20 flex items-center justify-center py-12">
                      <Music size={64} className="text-violet-400" />
                    </div>
                  )}
                  {asset.generationDetails?.prompt && (
                    <div className="bg-default-100 p-4 rounded-lg">
                      <p className="text-sm text-default-600 whitespace-pre-wrap">
                        {asset.generationDetails.prompt}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </ModalBody>
            <ModalFooter>
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
