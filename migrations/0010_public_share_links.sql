-- Public Share Links table
-- Stores one-per-resource public share tokens for collections and folders.
-- External (unauthenticated) users can view assets via these tokens.

CREATE TABLE IF NOT EXISTS public_share_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token VARCHAR(64) NOT NULL UNIQUE,
    resource_type VARCHAR(20) NOT NULL,  -- 'collection' or 'folder'
    resource_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_resource UNIQUE (resource_type, resource_id)
);

CREATE INDEX idx_public_share_links_token ON public_share_links(token);
CREATE INDEX idx_public_share_links_resource ON public_share_links(resource_type, resource_id);
