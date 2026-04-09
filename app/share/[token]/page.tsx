"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { PublicGallery, type PublicAsset } from "@/components/public-share/PublicGallery";
import { PublicLightbox } from "@/components/public-share/PublicLightbox";
import { Folder, Image as ImageIcon } from "lucide-react";

interface ShareData {
  name: string;
  resourceType: string;
  ownerName: string;
  assets: PublicAsset[];
  pagination: {
    page: number;
    totalPages: number;
    totalAssets: number;
  };
}

export default function PublicSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const t = useTranslations("publicShare");

  const [data, setData] = useState<ShareData | null>(null);
  const [allAssets, setAllAssets] = useState<PublicAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const isLightboxOpen = lightboxIndex >= 0;

  const fetchPage = useCallback(
    async (page: number) => {
      const res = await fetch(`/api/public-share/${token}?page=${page}`);
      if (!res.ok) throw new Error("Not found");
      return (await res.json()) as ShareData;
    },
    [token]
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchPage(1)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setAllAssets(result.assets);
        setTotalPages(result.pagination.totalPages);
        setCurrentPage(1);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || currentPage >= totalPages) return;
    setIsLoadingMore(true);
    try {
      const nextPage = currentPage + 1;
      const result = await fetchPage(nextPage);
      setAllAssets((prev) => [...prev, ...result.assets]);
      setCurrentPage(nextPage);
    } catch {
      // Silently fail
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, currentPage, totalPages, fetchPage]);

  // Infinite scroll trigger
  useEffect(() => {
    if (currentPage >= totalPages) return;

    const handleScroll = () => {
      const scrollBottom =
        window.innerHeight + window.scrollY;
      const docHeight = document.documentElement.scrollHeight;
      if (docHeight - scrollBottom < 800) {
        handleLoadMore();
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleLoadMore, currentPage, totalPages]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 px-4">
        <div className="text-default-500 text-lg text-center">
          {t("linkNotFound")}
        </div>
        <Button
          as="a"
          href="/auth/login"
          color="primary"
          variant="flat"
        >
          {t("joinMoodio")}
        </Button>
      </div>
    );
  }

  const ResourceIcon = data.resourceType === "folder" ? Folder : ImageIcon;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-divider">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo */}
          <a href="/auth/login" className="flex items-center gap-2 shrink-0">
            <svg width="24" height="26" viewBox="0 0 32 34" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M19.9173 18.0346L19.8464 17.949C19.634 17.6921 19.6636 17.3793 19.9204 17.1668L30.7791 8.32928L31.1216 8.046C31.3784 7.83355 31.408 7.52068 31.1956 7.26382L30.9123 6.92135L30.2749 6.15079C24.397 -0.955483 13.9157 -1.94703 6.80946 3.93092C-0.296813 9.80886 -1.28836 20.2901 4.58959 27.3964C10.4675 34.5027 20.9488 35.4942 28.055 29.6162C28.8256 28.9789 29.611 28.1851 30.3107 27.4621C30.3963 27.3913 30.4111 27.2348 30.5824 27.0932C30.7684 26.7951 30.798 26.4823 30.4999 26.2962L19.9173 18.0346ZM18.7483 7.03331C19.4332 6.46676 20.5283 6.57035 21.0948 7.2553C21.6614 7.94024 21.5578 9.03529 20.8729 9.60184C20.1879 10.1684 19.0929 10.0648 18.5263 9.37985C17.9598 8.69491 18.0634 7.59986 18.7483 7.03331ZM11.0109 22.085C10.326 22.6515 9.23093 22.5479 8.66438 21.863C8.09783 21.178 8.20142 20.083 8.88636 19.5164C9.57131 18.9499 10.6664 19.0535 11.2329 19.7384C11.7995 20.4234 11.6959 21.5184 11.0109 22.085ZM20.8093 26.9578C20.1244 27.5244 19.0293 27.4208 18.4628 26.7358C17.8962 26.0509 17.9998 24.9558 18.6847 24.3893C19.3697 23.8228 20.4647 23.9263 21.0313 24.6113C21.5978 25.2962 21.4942 26.3913 20.8093 26.9578ZM11.1907 11.8426C10.5057 12.4092 9.41069 12.3056 8.84414 11.6206C8.27759 10.9357 8.38118 9.84064 9.06613 9.27409C9.75107 8.70754 10.8461 8.81113 11.4127 9.49607C11.9792 10.181 11.8756 11.2761 11.1907 11.8426Z" fill="#7C3AED"/>
            </svg>
            <span className="font-semibold text-sm hidden sm:block">Moodio</span>
          </a>

          {/* Resource info */}
          <div className="flex items-center gap-2 min-w-0 px-4">
            <ResourceIcon size={16} className="text-default-500 shrink-0" />
            <h1 className="text-sm font-medium truncate">{data.name}</h1>
            <span className="text-xs text-default-400 shrink-0 hidden sm:block">
              {t("sharedBy", { name: data.ownerName })}
            </span>
          </div>

          {/* CTA */}
          <Button
            as="a"
            href="/auth/login"
            color="primary"
            size="sm"
            className="shrink-0"
          >
            {t("joinMoodio")}
          </Button>
        </div>
      </header>

      {/* Gallery */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {allAssets.length === 0 ? (
          <div className="text-center py-20 text-default-500">
            {t("noAssets", { resourceType: data.resourceType })}
          </div>
        ) : (
          <>
            <PublicGallery
              assets={allAssets}
              onAssetClick={(index) => setLightboxIndex(index)}
            />

            {isLoadingMore && (
              <div className="flex justify-center py-8">
                <Spinner size="md" />
              </div>
            )}
          </>
        )}
      </main>

      {/* Lightbox */}
      <PublicLightbox
        assets={allAssets}
        currentIndex={lightboxIndex}
        isOpen={isLightboxOpen}
        onClose={() => setLightboxIndex(-1)}
        onNavigate={setLightboxIndex}
      />
    </div>
  );
}
