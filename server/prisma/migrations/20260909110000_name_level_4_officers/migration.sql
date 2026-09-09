-- Name the fourth tier "Officers".
--
-- NYSC names its tiers by role — Directors, Deputy/Provincial Directors,
-- Assistant Directors — so the generic "Level 4" that 20260909100000 falls back
-- to when it cannot derive a name from the third tier reads out of place.
--
-- Only that untouched fallback name is replaced, so a director who has already
-- renamed the tier keeps their own name.

UPDATE "Layer" l
   SET "name" = 'Officers', "updatedAt" = CURRENT_TIMESTAMP
  FROM "Company" c
 WHERE c."workspaceId" = l."workspaceId"
   AND l."number" = 4
   AND l."name" = 'Level 4'
   AND EXISTS (
     SELECT 1 FROM "CompanyFeature" f
      WHERE f."companyId" = c."id"
        AND f."featureKey" = 'four_level_hierarchy'
        AND f."enabled"
   );
