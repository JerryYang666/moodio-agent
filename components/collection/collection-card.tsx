"use client";

import React from "react";
import { Card, CardBody, CardFooter } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Image } from "@heroui/image";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/dropdown";
import { Folder, MoreVertical, Pencil, Tags, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import CollectionTags from "@/components/collection/collection-tags";

type CollectionCardData = {
  id: string;
  name: string;
  coverImageUrl?: string | null;
  coverImageMdUrl?: string | null;
  tags?: { id: string; label: string; color: string }[];
  isOwner?: boolean;
  permission?: string;
};

type CollectionCardProps = {
  collection: CollectionCardData;
  onPress: () => void;
  thumbnailHeight?: string;
  showPermissionChips?: boolean;
  onRename?: () => void;
  onEditTags?: () => void;
  onDelete?: () => void;
};

export default function CollectionCard({
  collection,
  onPress,
  thumbnailHeight = "h-40",
  showPermissionChips = false,
  onRename,
  onEditTags,
  onDelete,
}: CollectionCardProps) {
  const tCommon = useTranslations("common");
  const tCollections = useTranslations("collections");

  const showMenu = !!(onRename || onEditTags || onDelete);

  return (
    <Card
      isPressable
      onPress={onPress}
      className="hover:scale-105 transition-transform group"
    >
      <CardBody className="p-3 pb-1 relative">
        <div
          className={`w-full ${thumbnailHeight} bg-default-100 rounded-lg overflow-hidden relative`}
        >
          {collection.coverImageUrl || collection.coverImageMdUrl ? (
            <Image
              src={collection.coverImageMdUrl || collection.coverImageUrl || ""}
              alt={collection.name}
              radius="none"
              classNames={{
                wrapper: "w-full h-full !max-w-full",
                img: "w-full h-full object-cover",
              }}
              onError={
                ((e: React.SyntheticEvent<HTMLImageElement>) => {
                  const target = e.currentTarget;
                  if (collection.coverImageUrl && target.src !== collection.coverImageUrl) {
                    target.src = collection.coverImageUrl;
                  }
                }) as unknown as () => void
              }
            />
          ) : (
            <div className="flex items-center justify-center w-full h-full">
              <Folder size={40} className="text-default-400" />
            </div>
          )}
          {(collection.tags ?? []).length > 0 && (
            <div className="absolute bottom-1.5 left-1.5 right-1.5 z-10">
              <CollectionTags tags={collection.tags ?? []} maxVisible={3} />
            </div>
          )}
        </div>
        {showMenu && (
          <div
            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <Dropdown>
              <DropdownTrigger>
                <div
                  role="button"
                  tabIndex={0}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-medium bg-background/80 backdrop-blur-sm cursor-pointer hover:opacity-80"
                >
                  <MoreVertical size={16} />
                </div>
              </DropdownTrigger>
              <DropdownMenu aria-label="Collection actions">
                {onRename ? (
                  <DropdownItem
                    key="rename"
                    startContent={<Pencil size={16} />}
                    onPress={onRename}
                  >
                    {tCommon("rename")}
                  </DropdownItem>
                ) : null}
                {onEditTags ? (
                  <DropdownItem
                    key="editTags"
                    startContent={<Tags size={16} />}
                    onPress={onEditTags}
                  >
                    {tCollections("editTags")}
                  </DropdownItem>
                ) : null}
                {onDelete ? (
                  <DropdownItem
                    key="delete"
                    className="text-danger"
                    color="danger"
                    startContent={<Trash2 size={16} />}
                    onPress={onDelete}
                  >
                    {tCommon("delete")}
                  </DropdownItem>
                ) : null}
              </DropdownMenu>
            </Dropdown>
          </div>
        )}
      </CardBody>
      <CardFooter className="flex flex-col items-start gap-1 px-3 pt-1 pb-3">
        <h3 className="font-semibold text-base truncate w-full">
          {collection.name}
        </h3>
        {showPermissionChips && (
          <div className="flex items-center gap-2">
            <Chip
              size="sm"
              variant="flat"
              color={collection.isOwner ? "primary" : "default"}
              className="capitalize"
            >
              {collection.permission}
            </Chip>
            {!collection.isOwner && (
              <Chip size="sm" variant="flat" color="secondary">
                {tCollections("shared")}
              </Chip>
            )}
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
