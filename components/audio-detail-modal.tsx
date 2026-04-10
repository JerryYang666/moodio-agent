"use client";

import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { Button } from "@heroui/button";
import { Music, Download } from "lucide-react";
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
                  <div className="rounded-lg overflow-hidden bg-gradient-to-br from-violet-500/20 to-purple-600/20 flex flex-col items-center justify-center gap-6 py-12">
                    <Music size={64} className="text-violet-400" />
                    {asset.audioUrl && (
                      <audio
                        src={asset.audioUrl}
                        controls
                        autoPlay
                        className="w-full max-w-md px-4"
                      />
                    )}
                  </div>
                  <div className="bg-default-100 p-4 rounded-lg">
                    <h4 className="font-medium mb-2">
                      {asset.generationDetails?.title || labels.untitledAudio}
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
              {asset?.audioUrl && (
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
