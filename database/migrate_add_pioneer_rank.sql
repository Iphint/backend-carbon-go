-- Add Pioneer rank if not already present
INSERT IGNORE INTO rank_types (name, name_en, name_id)
SELECT 'Pioneer', 'Pioneer', 'Pioneer'
WHERE NOT EXISTS (SELECT 1 FROM rank_types WHERE name = 'Pioneer');

-- Backfill bilingual names for any rank types that still have NULL bilingual fields
UPDATE rank_types SET name_en = name WHERE name_en IS NULL;
UPDATE rank_types SET name_id = name WHERE name_id IS NULL;
