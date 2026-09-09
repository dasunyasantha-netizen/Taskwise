-- Four-level hierarchy for the Youth Council tenant.
--
-- Levels 2 and 3 are split into Head Office and Provincial departments. Level 4
-- is a new tier of job-role departments (Doctors, Engineers, ...) whose members
-- report to a level 3 manager and carry no office category. Head Office and
-- Provincial hold identical permissions and data access — the category is a
-- classification used for grouping, filtering and reporting only.
--
-- All of it is gated by the `four_level_hierarchy` company feature, which this
-- migration enables for Youth Council alone. Every other company keeps three
-- levels, an optional supervisor, and no office category.

-- ── Columns (schema-wide; only entitled companies ever populate them) ────────

ALTER TABLE "Department" ADD COLUMN "officeCategory" TEXT;
ALTER TABLE "Notice"     ADD COLUMN "officeCategory" TEXT;

CREATE INDEX "Department_workspaceId_officeCategory_idx"
  ON "Department" ("workspaceId", "officeCategory");

-- ── Youth Council tenant setup ──────────────────────────────────────────────

DO $$
DECLARE
  yc_company_id   TEXT;
  yc_workspace_id TEXT;
  layer3_name     TEXT;
  layer4_name     TEXT;
  tagged_count    INTEGER;
BEGIN
  -- Youth Council is the legacy tenant: the single company back-filled from the
  -- original workspace by 20260727090000_add_company_onboarding. It is the only
  -- company granted unprefixed login, which makes this match unambiguous.
  SELECT c."id", c."workspaceId"
    INTO yc_company_id, yc_workspace_id
    FROM "Company" c
   WHERE c."allowUnprefixedLogin" = true
     AND (UPPER(c."prefix") = 'YC' OR c."registrationNumber" LIKE 'LEGACY-%')
   ORDER BY c."createdAt"
   LIMIT 1;

  IF yc_company_id IS NULL THEN
    -- Expected on a fresh or test database that has no legacy tenant.
    RAISE NOTICE 'four_level_hierarchy: no Youth Council company found; skipping tenant setup.';
    RETURN;
  END IF;

  INSERT INTO "CompanyFeature" ("id", "companyId", "featureKey", "enabled", "createdAt", "updatedAt")
  VALUES ('youth-council-four-level-hierarchy', yc_company_id, 'four_level_hierarchy', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT ("companyId", "featureKey") DO UPDATE
    SET "enabled" = true, "updatedAt" = CURRENT_TIMESTAMP;

  IF yc_workspace_id IS NULL THEN
    RAISE NOTICE 'four_level_hierarchy: Youth Council has no workspace; feature enabled, layers skipped.';
    RETURN;
  END IF;

  -- Youth Council reads "Level" rather than "Layer". Only rename tiers still
  -- carrying the seeded default name, so a director's own naming is preserved.
  UPDATE "Layer"
     SET "name" = 'Level ' || "number", "updatedAt" = CURRENT_TIMESTAMP
   WHERE "workspaceId" = yc_workspace_id
     AND "name" = 'Layer ' || "number";

  -- Name level 4 after its sibling so custom naming schemes carry through.
  -- Level 4 reports to level 3, so without a level 3 there is nothing to hang it
  -- from and the tier is left out rather than creating a broken ladder.
  SELECT l."name" INTO layer3_name
    FROM "Layer" l
   WHERE l."workspaceId" = yc_workspace_id AND l."number" = 3;

  IF layer3_name IS NULL THEN
    layer4_name := NULL;
    RAISE NOTICE 'four_level_hierarchy: Youth Council has no level 3; feature enabled, level 4 skipped.';
  ELSE
    layer4_name := COALESCE(NULLIF(regexp_replace(layer3_name, '3$', '4'), layer3_name), 'Level 4');

    INSERT INTO "Layer" ("id", "workspaceId", "number", "name", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, yc_workspace_id, 4, layer4_name, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
     WHERE NOT EXISTS (
       SELECT 1 FROM "Layer" WHERE "workspaceId" = yc_workspace_id AND "number" = 4
     );
  END IF;

  -- Existing level 2 and 3 departments are tagged Provincial. Directors retag
  -- the head-office ones afterwards from the hierarchy screen.
  UPDATE "Department" d
     SET "officeCategory" = 'PROVINCIAL', "updatedAt" = CURRENT_TIMESTAMP
    FROM "Layer" l
   WHERE d."layerId" = l."id"
     AND l."workspaceId" = yc_workspace_id
     AND l."number" IN (2, 3)
     AND d."officeCategory" IS NULL;

  GET DIAGNOSTICS tagged_count = ROW_COUNT;
  RAISE NOTICE 'four_level_hierarchy: enabled for company %, added level 4 as %, tagged % departments PROVINCIAL.',
    yc_company_id, layer4_name, tagged_count;
END $$;
