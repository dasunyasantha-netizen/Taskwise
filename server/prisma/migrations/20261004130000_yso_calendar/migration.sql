CREATE TABLE "YsoCalendarEntry" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "personnelId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "startTime" TEXT,
  "endTime" TEXT,
  "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "YsoCalendarEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "YsoCalendarEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "YsoCalendarEntry_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "YsoCalendarEntry_time_check" CHECK (
    ("startTime" IS NULL AND "endTime" IS NULL) OR
    ("startTime" IS NOT NULL AND "startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND ("endTime" IS NULL OR ("endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "endTime" > "startTime")))
  )
);
CREATE INDEX "YsoCalendarEntry_workspaceId_personnelId_date_idx" ON "YsoCalendarEntry"("workspaceId", "personnelId", "date");
