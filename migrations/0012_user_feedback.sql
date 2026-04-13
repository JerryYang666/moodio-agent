CREATE TABLE user_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(512) NOT NULL,
  feedback JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX user_feedback_user_entity_idx
  ON user_feedback (user_id, entity_type, entity_id);

CREATE INDEX user_feedback_entity_type_idx
  ON user_feedback (entity_type, entity_id);
