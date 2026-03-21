"use client";

import { useState, useCallback } from "react";
import { Card, CardBody } from "@heroui/card";
import { Spinner } from "@heroui/spinner";
import { Image } from "@heroui/image";
import { Button } from "@heroui/button";
import { Input, Textarea } from "@heroui/input";
import { X, Maximize2, Pencil, Check } from "lucide-react";
import clsx from "clsx";
import { useTranslations } from "next-intl";

interface VideoSuggestCardProps {
  part: any;
  isSelected: boolean;
  effectiveStatus: string;
  onClick: () => void;
  onExpandClick?: (part: any) => void;
  /** Callback when user saves edits to title/videoIdea */
  onSave?: (updates: { title: string; videoIdea: string }) => void;
}

export default function VideoSuggestCard({
  part,
  isSelected,
  effectiveStatus,
  onClick,
  onExpandClick,
  onSave,
}: VideoSuggestCardProps) {
  const t = useTranslations();
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(part.title || "");
  const [editVideoIdea, setEditVideoIdea] = useState(part.videoIdea || "");

  const url = part.imageUrl || "";

  const handleEditClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setEditTitle(part.title || "");
      setEditVideoIdea(part.videoIdea || "");
      setIsEditing(true);
    },
    [part.title, part.videoIdea]
  );

  const handleSave = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsEditing(false);
      if (onSave) {
        onSave({ title: editTitle, videoIdea: editVideoIdea });
      }
    },
    [editTitle, editVideoIdea, onSave]
  );

  const handleCancel = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsEditing(false);
      setEditTitle(part.title || "");
      setEditVideoIdea(part.videoIdea || "");
    },
    [part.title, part.videoIdea]
  );

  return (
    <Card
      className={clsx(
        "w-full transition-all",
        isSelected && "border-4 border-primary",
        effectiveStatus === "generated" && !isEditing && "hover:shadow-md cursor-pointer"
      )}
    >
      <CardBody
        className="p-0 overflow-hidden"
        onClick={isEditing ? undefined : onClick}
      >
        <div className="flex flex-row">
          <div className="w-[150px] min-w-[150px] aspect-square relative group/vsimg">
            {effectiveStatus === "loading" && (
              <div className="w-full h-full flex items-center justify-center bg-default-100">
                <Spinner />
              </div>
            )}
            {effectiveStatus === "error" && (
              <div className="w-full h-full flex items-center justify-center bg-danger-50 text-danger">
                <X />
              </div>
            )}
            {effectiveStatus === "generated" && (
              <>
                <Image
                  src={url}
                  alt={part.title}
                  radius="none"
                  classNames={{
                    wrapper: "w-full h-full !max-w-full",
                    img: "w-full h-full object-cover",
                  }}
                />
                {onExpandClick && !isEditing && (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="solid"
                    aria-label={t("imageDetail.viewFullSize")}
                    title={t("imageDetail.viewFullSize")}
                    className="absolute top-1 right-1 z-10 bg-background/80 backdrop-blur-sm opacity-0 group-hover/vsimg:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onExpandClick(part);
                    }}
                  >
                    <Maximize2 size={14} />
                  </Button>
                )}
              </>
            )}
          </div>
          <div className="flex-1 p-3 flex flex-col justify-center min-w-0">
            {isEditing ? (
              <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                <Input
                  size="sm"
                  label={t("chat.videoSuggestTitle")}
                  value={editTitle}
                  onValueChange={setEditTitle}
                  variant="bordered"
                />
                <Textarea
                  size="sm"
                  label={t("chat.videoSuggestIdea")}
                  value={editVideoIdea}
                  onValueChange={setEditVideoIdea}
                  variant="bordered"
                  minRows={2}
                  maxRows={4}
                />
                <div className="flex gap-1 justify-end">
                  <Button
                    size="sm"
                    variant="light"
                    onClick={handleCancel}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    size="sm"
                    color="primary"
                    startContent={<Check size={14} />}
                    onClick={handleSave}
                  >
                    {t("common.save")}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="font-semibold text-sm truncate">
                  {part.title === "Loading..." && effectiveStatus !== "loading"
                    ? ""
                    : part.title}
                </p>
                {part.videoIdea && (
                  <p className="text-xs text-default-500 mt-1 line-clamp-4">
                    {part.videoIdea}
                  </p>
                )}
              </>
            )}
          </div>
          {/* Edit button - only show when generated and not editing */}
          {effectiveStatus === "generated" && !isEditing && onSave && (
            <div className="flex items-start p-2">
              <Button
                isIconOnly
                size="sm"
                variant="light"
                aria-label={t("common.edit")}
                onClick={handleEditClick}
              >
                <Pencil size={14} />
              </Button>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
