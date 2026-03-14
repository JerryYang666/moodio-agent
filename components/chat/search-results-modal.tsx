"use client";

import React, { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button } from "@heroui/button";
import { ExternalLink } from "lucide-react";
import {
  setTextSearch,
  setSelectedFilters,
} from "@/lib/redux/slices/querySlice";
import type { RootState } from "@/lib/redux/store";
import VideoGrid from "@/components/browse/VideoGrid";

interface SearchResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  query: {
    textSearch: string;
    filterIds: number[];
  };
  desktopId?: string;
}

export default function SearchResultsModal({
  isOpen,
  onClose,
  query,
  desktopId,
}: SearchResultsModalProps) {
  const dispatch = useDispatch();
  const router = useRouter();
  const t = useTranslations("browse");
  const tSearch = useTranslations("chat.search");

  // Save previous query state so we can restore on close
  const prevQueryRef = useRef<{ textSearch: string; selectedFilters: number[] } | null>(null);
  const currentQuery = useSelector((state: RootState) => state.query);

  useEffect(() => {
    if (isOpen) {
      // Save current state before overwriting
      prevQueryRef.current = {
        textSearch: currentQuery.textSearch,
        selectedFilters: [...currentQuery.selectedFilters],
      };
      // Apply the search query
      dispatch(setTextSearch(query.textSearch));
      dispatch(setSelectedFilters(query.filterIds));
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) return;
    const handleLearnFromVideo = () => handleClose();
    window.addEventListener("learn-from-video", handleLearnFromVideo);
    return () => window.removeEventListener("learn-from-video", handleLearnFromVideo);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = () => {
    // Restore previous query state
    if (prevQueryRef.current) {
      dispatch(setTextSearch(prevQueryRef.current.textSearch));
      dispatch(setSelectedFilters(prevQueryRef.current.selectedFilters));
      prevQueryRef.current = null;
    }
    onClose();
  };

  const handleGoToBrowse = () => {
    // Keep the current search query in Redux (don't restore) and navigate
    prevQueryRef.current = null;
    onClose();
    router.push("/browse");
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
      size="5xl"
      classNames={{
        base: "max-w-[95vw] max-h-[95vh] m-auto",
        wrapper: "z-[70]",
      }}
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="border-b border-default-200">
              {query.textSearch ? `"${query.textSearch}"` : tSearch("searchQuery")}
            </ModalHeader>
            <ModalBody className="p-4 overflow-hidden!">
              <div className="h-[calc(95vh-160px)] overflow-hidden">
                <VideoGrid hideSummary={true} desktopId={desktopId} />
              </div>
            </ModalBody>
            <ModalFooter className="justify-center border-t border-default-200">
              <Button
                color="primary"
                variant="flat"
                startContent={<ExternalLink size={16} />}
                onPress={handleGoToBrowse}
              >
                {tSearch("goToBrowse")}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
