"use client";

import React, { useEffect, useState } from "react";
import { Card, CardBody, CardFooter } from "@heroui/card";
import { Image } from "@heroui/image";
import { Spinner } from "@heroui/spinner";
import { useTranslations } from "next-intl";
import { PlayCircle, Image as ImageIcon } from "lucide-react";

interface RecentItem {
  id: string;
  type: "image" | "video";
  url: string;
  videoUrl?: string;
  createdAt: number;
  status?: string;
}

export function RecentActivity() {
  const t = useTranslations();
  const [items, setItems] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRecentActivity() {
      try {
        const [assetsRes, videosRes] = await Promise.all([
          fetch("/api/assets?limit=10"),
          fetch("/api/video/generations?limit=10"),
        ]);

        if (!assetsRes.ok || !videosRes.ok) {
          throw new Error("Failed to fetch recent activity");
        }

        const assetsData = await assetsRes.json();
        const videosData = await videosRes.json();

        const recentItems: RecentItem[] = [];

        if (assetsData.assets) {
          assetsData.assets.forEach((asset: any) => {
            recentItems.push({
              id: asset.id,
              type: asset.assetType || "image",
              url: asset.imageUrl,
              createdAt: new Date(asset.addedAt).getTime(),
            });
          });
        }

        if (videosData.generations) {
          videosData.generations.forEach((gen: any) => {
            recentItems.push({
              id: gen.id,
              type: "video",
              url: gen.thumbnailUrl || gen.sourceImageUrl,
              videoUrl: gen.videoUrl,
              createdAt: new Date(gen.createdAt).getTime(),
              status: gen.status,
            });
          });
        }

        // Sort by newest first and take top 6
        recentItems.sort((a, b) => b.createdAt - a.createdAt);

        // Deduplicate by ID just in case
        const seen = new Set();
        const deduplicated = recentItems.filter(item => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });

        setItems(deduplicated.slice(0, 6));
      } catch (err) {
        console.error("Error fetching recent activity:", err);
        setError(t("dashboard.failedToLoadRecentActivity"));
      } finally {
        setLoading(false);
      }
    }

    fetchRecentActivity();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-gray-50 dark:bg-gray-900 rounded-xl">
        <Spinner size="md" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 dark:bg-gray-900 rounded-xl text-danger">
        {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-gray-50 dark:bg-gray-900 rounded-xl text-gray-500">
        <p>{t("dashboard.noRecentActivity")}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {items.map((item) => (
        <Card key={item.id} className="border-none bg-background/60 dark:bg-default-100/50" shadow="sm">
          <CardBody className="p-0 overflow-hidden relative group">
            {item.url ? (
              <Image
                src={item.url}
                alt="Recent generation"
                className="w-full h-32 object-cover transition-transform duration-300 group-hover:scale-105"
                classNames={{
                  wrapper: "w-full h-full",
                }}
              />
            ) : (
              <div className="w-full h-32 bg-default-200 flex items-center justify-center">
                <ImageIcon className="text-default-400" size={32} />
              </div>
            )}

            {/* Status badge for videos in progress */}
            {item.type === "video" && item.status && item.status !== "completed" && (
              <div className="absolute top-2 right-2 z-10 bg-black/50 text-white text-xs px-2 py-1 rounded-full backdrop-blur-sm">
                {item.status}
              </div>
            )}

            {/* Icon overlay based on type */}
            <div className="absolute bottom-2 right-2 z-10 bg-black/50 text-white p-1.5 rounded-full backdrop-blur-sm">
              {item.type === "video" ? (
                <PlayCircle size={16} />
              ) : (
                <ImageIcon size={16} />
              )}
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
