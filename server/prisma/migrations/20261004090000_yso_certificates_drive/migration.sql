-- YSO certificates move to the workspace's Google Drive (the Letters folder).
-- Only Drive metadata stays in the database; file bytes are never stored.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "YsoAttachment") THEN
    RAISE EXCEPTION 'YsoAttachment has stored certificates; move them to Google Drive before applying this migration';
  END IF;
END $$;

ALTER TABLE "YsoAttachment" DROP COLUMN "bytes";
ALTER TABLE "YsoAttachment" ADD COLUMN "driveFileId" TEXT NOT NULL;
ALTER TABLE "YsoAttachment" ADD COLUMN "size" INTEGER NOT NULL;

-- Subfolder (inside the Letters folder) that holds YSO certificate scans.
ALTER TABLE "LetterSettings" ADD COLUMN "ysoFolderId" TEXT;
