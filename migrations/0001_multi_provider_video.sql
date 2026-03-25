-- Multi-Provider Video System Migration
-- Adds provider columns to video_generations and remaps model IDs

-- Step 1: Add new columns
ALTER TABLE video_generations ADD COLUMN IF NOT EXISTS provider VARCHAR(50);
ALTER TABLE video_generations ADD COLUMN IF NOT EXISTS provider_model_id VARCHAR(255);

-- Step 1b: Rename fal_request_id to provider_request_id
ALTER TABLE video_generations RENAME COLUMN fal_request_id TO provider_request_id;

-- Step 2: Backfill existing rows - all existing generations were via fal
UPDATE video_generations
SET provider = 'fal',
    provider_model_id = model_id
WHERE provider IS NULL;

-- Step 3: Remap model_id from fal endpoint strings to stable display IDs
UPDATE video_generations SET model_id = 'seedance-v1.5-pro' WHERE model_id = 'fal-ai/bytedance/seedance/v1.5/pro/image-to-video';
UPDATE video_generations SET model_id = 'hailuo-2.3-fast-pro' WHERE model_id = 'fal-ai/minimax/hailuo-2.3-fast/pro/image-to-video';
UPDATE video_generations SET model_id = 'hailuo-2.3-pro' WHERE model_id = 'fal-ai/minimax/hailuo-2.3/pro/image-to-video';
UPDATE video_generations SET model_id = 'hailuo-02-pro' WHERE model_id = 'fal-ai/minimax/hailuo-02/pro/image-to-video';
UPDATE video_generations SET model_id = 'wan-v2.6' WHERE model_id = 'wan/v2.6/image-to-video';
UPDATE video_generations SET model_id = 'kling-v2.6-pro' WHERE model_id = 'fal-ai/kling-video/v2.6/pro/image-to-video';
UPDATE video_generations SET model_id = 'kling-o1-pro' WHERE model_id = 'fal-ai/kling-video/o1/image-to-video';
UPDATE video_generations SET model_id = 'kling-o3-pro' WHERE model_id = 'fal-ai/kling-video/o3/pro/image-to-video';
UPDATE video_generations SET model_id = 'kling-v3-pro' WHERE model_id = 'fal-ai/kling-video/v3/pro/image-to-video';
UPDATE video_generations SET model_id = 'veo-3.1' WHERE model_id = 'fal-ai/veo3.1/image-to-video';
UPDATE video_generations SET model_id = 'veo-3.1-first-last-frame' WHERE model_id = 'fal-ai/veo3.1/first-last-frame-to-video';
UPDATE video_generations SET model_id = 'sora-2-pro' WHERE model_id = 'fal-ai/sora-2/image-to-video/pro';

-- Step 4: Remap model_id in model_pricing table
UPDATE model_pricing SET model_id = 'seedance-v1.5-pro' WHERE model_id = 'fal-ai/bytedance/seedance/v1.5/pro/image-to-video';
UPDATE model_pricing SET model_id = 'hailuo-2.3-fast-pro' WHERE model_id = 'fal-ai/minimax/hailuo-2.3-fast/pro/image-to-video';
UPDATE model_pricing SET model_id = 'hailuo-2.3-pro' WHERE model_id = 'fal-ai/minimax/hailuo-2.3/pro/image-to-video';
UPDATE model_pricing SET model_id = 'hailuo-02-pro' WHERE model_id = 'fal-ai/minimax/hailuo-02/pro/image-to-video';
UPDATE model_pricing SET model_id = 'wan-v2.6' WHERE model_id = 'wan/v2.6/image-to-video';
UPDATE model_pricing SET model_id = 'kling-v2.6-pro' WHERE model_id = 'fal-ai/kling-video/v2.6/pro/image-to-video';
UPDATE model_pricing SET model_id = 'kling-o1-pro' WHERE model_id = 'fal-ai/kling-video/o1/image-to-video';
UPDATE model_pricing SET model_id = 'kling-o3-pro' WHERE model_id = 'fal-ai/kling-video/o3/pro/image-to-video';
UPDATE model_pricing SET model_id = 'kling-v3-pro' WHERE model_id = 'fal-ai/kling-video/v3/pro/image-to-video';
UPDATE model_pricing SET model_id = 'veo-3.1' WHERE model_id = 'fal-ai/veo3.1/image-to-video';
UPDATE model_pricing SET model_id = 'veo-3.1-first-last-frame' WHERE model_id = 'fal-ai/veo3.1/first-last-frame-to-video';
UPDATE model_pricing SET model_id = 'sora-2-pro' WHERE model_id = 'fal-ai/sora-2/image-to-video/pro';
