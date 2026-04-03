-- Team Member Tags Migration
-- Adds a free-text tag column to team_members so owners/admins can label
-- member roles (e.g. "Producer", "Editor") for easier identification during sharing.

ALTER TABLE team_members ADD COLUMN tag VARCHAR(50) DEFAULT NULL;
