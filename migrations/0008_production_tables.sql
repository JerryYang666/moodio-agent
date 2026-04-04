-- Production Tables (制片大表) Migration
-- Adds 7 tables for the collaborative spreadsheet feature.

-- 1. Top-level table entity
CREATE TABLE production_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. Column definitions (heading row)
CREATE TABLE production_table_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES production_tables(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  cell_type VARCHAR(20) NOT NULL DEFAULT 'text',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. Row shells (sparse — cells created on write)
CREATE TABLE production_table_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES production_tables(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 4. Sparse cell storage
CREATE TABLE production_table_cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES production_tables(id) ON DELETE CASCADE,
  column_id UUID NOT NULL REFERENCES production_table_columns(id) ON DELETE CASCADE,
  row_id UUID NOT NULL REFERENCES production_table_rows(id) ON DELETE CASCADE,
  text_content TEXT,
  media_assets JSONB,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (column_id, row_id)
);

-- 5. Table-level shares
CREATE TABLE production_table_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES production_tables(id) ON DELETE CASCADE,
  shared_with_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission VARCHAR(20) NOT NULL,
  shared_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 6. Column-level edit grants
CREATE TABLE production_table_column_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES production_tables(id) ON DELETE CASCADE,
  column_id UUID NOT NULL REFERENCES production_table_columns(id) ON DELETE CASCADE,
  shared_with_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shared_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (column_id, shared_with_user_id)
);

-- 7. Row-level edit grants
CREATE TABLE production_table_row_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES production_tables(id) ON DELETE CASCADE,
  row_id UUID NOT NULL REFERENCES production_table_rows(id) ON DELETE CASCADE,
  shared_with_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shared_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (row_id, shared_with_user_id)
);

-- Indexes for common query patterns
CREATE INDEX idx_production_tables_user ON production_tables(user_id);
CREATE INDEX idx_production_tables_team ON production_tables(team_id);
CREATE INDEX idx_production_table_columns_table ON production_table_columns(table_id);
CREATE INDEX idx_production_table_rows_table ON production_table_rows(table_id);
CREATE INDEX idx_production_table_cells_table ON production_table_cells(table_id);
CREATE INDEX idx_production_table_cells_column ON production_table_cells(column_id);
CREATE INDEX idx_production_table_cells_row ON production_table_cells(row_id);
CREATE INDEX idx_production_table_shares_table ON production_table_shares(table_id);
CREATE INDEX idx_production_table_shares_user ON production_table_shares(shared_with_user_id);
CREATE INDEX idx_production_table_column_shares_table ON production_table_column_shares(table_id);
CREATE INDEX idx_production_table_row_shares_table ON production_table_row_shares(table_id);
