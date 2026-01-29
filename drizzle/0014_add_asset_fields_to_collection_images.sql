-- Custom SQL migration file, put your code below! --

-- Add asset_id and asset_type columns to collection_images
-- asset_id: The actual asset reference (same as imageId for images, video ID for videos)
-- asset_type: "image" or "video"

-- Add new columns (asset_id nullable initially for migration)
ALTER TABLE "collection_images" ADD COLUMN "asset_id" varchar(255);
ALTER TABLE "collection_images" ADD COLUMN "asset_type" varchar(20) NOT NULL DEFAULT 'image';

-- Migrate existing data: for all existing images, assetId = imageId
UPDATE "collection_images" SET "asset_id" = "image_id";

-- Make asset_id NOT NULL after migration
ALTER TABLE "collection_images" ALTER COLUMN "asset_id" SET NOT NULL;