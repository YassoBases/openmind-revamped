-- Lesson Worlds: worlds + per-stage rows (stage specs generate, retry and
-- prefetch independently — no single giant spec blob per world).

-- CreateTable
CREATE TABLE "World" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "lessonId" TEXT,
    "subject" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planning',
    "error" TEXT,
    "title" TEXT,
    "plan" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "World_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldStage" (
    "worldId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "error" TEXT,
    "spec" JSONB,
    "stars" INTEGER,
    "bestAccuracy" DOUBLE PRECISION,
    "completedAt" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3),

    CONSTRAINT "WorldStage_pkey" PRIMARY KEY ("worldId","index")
);

-- CreateIndex
CREATE INDEX "World_studentId_deletedAt_createdAt_idx" ON "World"("studentId", "deletedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "World" ADD CONSTRAINT "World_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldStage" ADD CONSTRAINT "WorldStage_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
