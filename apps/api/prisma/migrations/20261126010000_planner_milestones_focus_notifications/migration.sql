-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SessionStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "SessionStatus" ADD VALUE 'PAUSED';
ALTER TYPE "SessionStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
ALTER TYPE "SubmissionStatus" ADD VALUE 'COMPLETED';

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "priority" "Priority" NOT NULL DEFAULT 'MEDIUM';

-- AlterTable
ALTER TABLE "LearningSession" ADD COLUMN     "elapsedSecs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "milestoneId" TEXT,
ADD COLUMN     "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "runningSince" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "dedupeKey" TEXT;

-- AlterTable
ALTER TABLE "UserPreferences" ADD COLUMN     "defaultDifficulty" "Difficulty",
ADD COLUMN     "defaultSubjectIds" TEXT[],
ADD COLUMN     "notifyAssignments" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyEvents" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyExams" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyRevision" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifySessions" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "LearningMilestone" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FocusSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "subjectId" TEXT,
    "label" TEXT,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3) NOT NULL,
    "durationSecs" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FocusSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LearningMilestone_goalId_position_idx" ON "LearningMilestone"("goalId", "position");

-- CreateIndex
CREATE INDEX "LearningMilestone_userId_idx" ON "LearningMilestone"("userId");

-- CreateIndex
CREATE INDEX "FocusSession_userId_endedAt_idx" ON "FocusSession"("userId", "endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "LearningSession" ADD CONSTRAINT "LearningSession_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "LearningMilestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningMilestone" ADD CONSTRAINT "LearningMilestone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningMilestone" ADD CONSTRAINT "LearningMilestone_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "LearningGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FocusSession" ADD CONSTRAINT "FocusSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FocusSession" ADD CONSTRAINT "FocusSession_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LearningSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FocusSession" ADD CONSTRAINT "FocusSession_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

