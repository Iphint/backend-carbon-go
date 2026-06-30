-- Add bilingual columns to milestones
ALTER TABLE milestones
  ADD COLUMN name_en VARCHAR(120) NULL AFTER name,
  ADD COLUMN name_id VARCHAR(120) NULL AFTER name_en,
  ADD COLUMN description_en TEXT NULL AFTER description,
  ADD COLUMN description_id TEXT NULL AFTER description_en;

-- Add bilingual columns to badges
ALTER TABLE badges
  ADD COLUMN name_en VARCHAR(120) NULL AFTER name,
  ADD COLUMN name_id VARCHAR(120) NULL AFTER name_en,
  ADD COLUMN description_en TEXT NULL AFTER description,
  ADD COLUMN description_id TEXT NULL AFTER description_en;

-- Add bilingual columns to quests
ALTER TABLE quests
  ADD COLUMN name_en VARCHAR(160) NULL AFTER name,
  ADD COLUMN name_id VARCHAR(160) NULL AFTER name_en,
  ADD COLUMN description_en TEXT NULL AFTER description,
  ADD COLUMN description_id TEXT NULL AFTER description_en;

-- Add bilingual columns + requirement FKs to rank_types
ALTER TABLE rank_types
  ADD COLUMN name_en VARCHAR(40) NULL AFTER name,
  ADD COLUMN name_id VARCHAR(40) NULL AFTER name_en,
  ADD COLUMN description_en TEXT NULL AFTER name_id,
  ADD COLUMN description_id TEXT NULL AFTER description_en,
  ADD COLUMN milestone_id BIGINT UNSIGNED NULL AFTER description_id,
  ADD COLUMN badge_id BIGINT UNSIGNED NULL AFTER milestone_id,
  ADD COLUMN quest_id BIGINT UNSIGNED NULL AFTER badge_id;

-- Backfill existing rank_types with default bilingual names
UPDATE rank_types SET name_en = name, name_id = name WHERE name_en IS NULL;
