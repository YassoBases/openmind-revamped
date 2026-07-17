-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" TEXT,
    "grade" INTEGER NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "color" TEXT NOT NULL DEFAULT '#58CC02',
    "interest" TEXT,
    "learningContext" TEXT,
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dailyGoal" INTEGER NOT NULL DEFAULT 3,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "streakCount" INTEGER NOT NULL DEFAULT 0,
    "streakLastPlayedAt" TIMESTAMP(3),
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnProgress" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "pathId" TEXT NOT NULL,
    "experienceId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearnProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnEvidence" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "representation" TEXT NOT NULL,
    "context" TEXT,
    "source" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "verification" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "hints" INTEGER NOT NULL DEFAULT 0,
    "recovered" BOOLEAN NOT NULL DEFAULT false,
    "errorPattern" TEXT,
    "toolId" TEXT,
    "pathId" TEXT,
    "experienceId" TEXT,
    "stepIndex" INTEGER,
    "ms" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearnEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "gameType" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generating',
    "error" TEXT,
    "spec" JSONB,
    "shellVersion" TEXT NOT NULL DEFAULT '',
    "thumbnailUrl" TEXT,
    "bestScore" INTEGER NOT NULL DEFAULT 0,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "lastPlayedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaySession" (
    "id" TEXT NOT NULL,
    "gameId" TEXT,
    "studentId" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorMessage" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "responseType" TEXT,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TutorMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XpEvent" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XpEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreakEvent" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreakEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecCache" (
    "key" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecCache_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Student_tokenHash_key" ON "Student"("tokenHash");

-- CreateIndex
CREATE INDEX "LearnProgress_studentId_completedAt_idx" ON "LearnProgress"("studentId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LearnProgress_studentId_pathId_experienceId_key" ON "LearnProgress"("studentId", "pathId", "experienceId");

-- CreateIndex
CREATE INDEX "LearnEvidence_studentId_skillId_createdAt_idx" ON "LearnEvidence"("studentId", "skillId", "createdAt");

-- CreateIndex
CREATE INDEX "Game_studentId_deletedAt_lastPlayedAt_idx" ON "Game"("studentId", "deletedAt", "lastPlayedAt");

-- CreateIndex
CREATE INDEX "PlaySession_studentId_createdAt_idx" ON "PlaySession"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "TutorMessage_studentId_conversationId_createdAt_idx" ON "TutorMessage"("studentId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "XpEvent_studentId_createdAt_idx" ON "XpEvent"("studentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StreakEvent_studentId_day_key" ON "StreakEvent"("studentId", "day");

-- AddForeignKey
ALTER TABLE "LearnProgress" ADD CONSTRAINT "LearnProgress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnEvidence" ADD CONSTRAINT "LearnEvidence_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaySession" ADD CONSTRAINT "PlaySession_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaySession" ADD CONSTRAINT "PlaySession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorMessage" ADD CONSTRAINT "TutorMessage_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpEvent" ADD CONSTRAINT "XpEvent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreakEvent" ADD CONSTRAINT "StreakEvent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
