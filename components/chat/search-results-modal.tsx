"use client";

import React, { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Modal, ModalContent, ModalBody, ModalFooter } from "@heroui/modal";
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
}

export default function SearchResultsModal({
  isOpen,
  onClose,
  query,
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
      size="full"
      scrollBehavior="inside"
      classNames={{
        base: "max-w-[90vw] max-h-[85vh] m-auto",
        body: "p-4",
      }}
    >
      <ModalContent>
        {() => (
          <>
            <ModalBody>
              <VideoGrid hideSummary={true} />
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
