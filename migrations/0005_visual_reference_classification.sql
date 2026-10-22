ALTER TABLE research_visual_samples ADD COLUMN reference_type TEXT NOT NULL DEFAULT 'inspiration';
ALTER TABLE research_visual_samples ADD COLUMN relevance_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE research_visual_samples ADD COLUMN screenshot_key TEXT;
