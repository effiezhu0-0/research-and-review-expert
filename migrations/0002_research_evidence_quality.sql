ALTER TABLE research_evidence ADD COLUMN likes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE research_evidence ADD COLUMN comments INTEGER NOT NULL DEFAULT 0;
ALTER TABLE research_evidence ADD COLUMN collects INTEGER NOT NULL DEFAULT 0;
ALTER TABLE research_evidence ADD COLUMN primary_dimension TEXT;
