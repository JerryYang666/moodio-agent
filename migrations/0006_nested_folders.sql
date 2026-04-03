-- Migration: Nested folders under collections
-- Adds unlimited-depth folder hierarchy using PostgreSQL ltree extension.
-- Folders behave like sub-collections with hierarchical permission inheritance.

-- 1. Enable ltree extension for materialized path queries
CREATE EXTENSION IF NOT EXISTS ltree;

-- 2. Folders table (unlimited nesting under collections)
CREATE TABLE folders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  parent_id     UUID REFERENCES folders(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  path          LTREE NOT NULL,
  depth         INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Subtree queries via GiST index on ltree path
CREATE INDEX idx_folders_path_gist ON folders USING GIST (path);

-- List immediate children of a folder
CREATE INDEX idx_folders_parent_id ON folders (parent_id);

-- List all top-level folders in a collection
CREATE INDEX idx_folders_collection_id ON folders (collection_id);

-- Most common query: list folders by collection + parent
CREATE INDEX idx_folders_collection_parent ON folders (collection_id, parent_id);

-- 3. Folder shares table (mirrors project_shares / collection_shares pattern)
CREATE TABLE folder_shares (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id           UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  shared_with_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission          VARCHAR(20) NOT NULL,
  shared_at           TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_folder_shares_folder_user ON folder_shares (folder_id, shared_with_user_id);
CREATE INDEX idx_folder_shares_user ON folder_shares (shared_with_user_id);

-- 4. Add folder_id to collection_images for assets inside folders
ALTER TABLE collection_images
  ADD COLUMN folder_id UUID REFERENCES folders(id) ON DELETE CASCADE;

CREATE INDEX idx_collection_images_folder_id ON collection_images (folder_id);
