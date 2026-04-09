-- Cell Comments Migration
-- Adds a JSONB comment column to production_table_cells for per-cell comments.
-- Shape: { "text": "..." } — extensible for future structured data.

ALTER TABLE production_table_cells ADD COLUMN comment JSONB;
