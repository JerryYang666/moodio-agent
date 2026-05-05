-- Migration: Add element_details JSONB column to collection_images
-- Elements are aggregated assets: up to 4 image IDs, 1 optional video ID,
-- a name, description, and voice ID (FAL provider). Stored as assetType='element'
-- with the structured fields in element_details so the shape stays open to
-- extension (e.g., lora IDs, pose references) without further migrations.

ALTER TABLE collection_images
  ADD COLUMN element_details JSONB;
