ALTER TABLE research_visual_samples ADD COLUMN authority_tags TEXT NOT NULL DEFAULT '[]';
ALTER TABLE research_visual_samples ADD COLUMN game_fit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE research_visual_samples ADD COLUMN visual_quality INTEGER NOT NULL DEFAULT 0;
ALTER TABLE research_visual_samples ADD COLUMN analysis_reason TEXT;
