-- Migration: Asset groups (抽卡组)
-- A "group" is a folder with modality != null. Plain folders stay plain folders.
-- Members of a group are collection_images.folderId rows whose folder has modality set.
-- Per-member triage status lives on collection_images.group_status.
-- The folder picks one designated cover via folders.cover_image_id.
-- The folder remembers the last-used / template generation config for in-place "generate more".
-- video_generations gets target_folder_id so the webhook can attach completed videos back to a group.

-- 1. folders: modality lock, designated cover, default generation config
ALTER TABLE folders
  ADD COLUMN modality VARCHAR(16),
  ADD COLUMN cover_image_id UUID REFERENCES collection_images(id) ON DELETE SET NULL,
  ADD COLUMN default_generation_config JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE folders
  ADD CONSTRAINT folders_modality_check
    CHECK (modality IS NULL OR modality IN ('image', 'video'));

-- Fast filter for "list all groups" / "is this folder a group?"
CREATE INDEX idx_folders_modality ON folders (modality) WHERE modality IS NOT NULL;

-- 2. collection_images: per-member group triage status
ALTER TABLE collection_images
  ADD COLUMN group_status VARCHAR(16);

ALTER TABLE collection_images
  ADD CONSTRAINT collection_images_group_status_check
    CHECK (group_status IS NULL OR group_status IN ('candidate', 'good', 'final'));

-- Fast lookup of "members of this folder grouped by status"
CREATE INDEX idx_collection_images_folder_status
  ON collection_images (folder_id, group_status)
  WHERE folder_id IS NOT NULL;

-- 3. video_generations: optional attach-back target folder
ALTER TABLE video_generations
  ADD COLUMN target_folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;

CREATE INDEX idx_video_generations_target_folder
  ON video_generations (target_folder_id)
  WHERE target_folder_id IS NOT NULL;
