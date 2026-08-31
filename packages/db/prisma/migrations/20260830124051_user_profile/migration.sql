/*
  Warnings:

  - You are about to drop the column `autoSubmitThreshold` on the `Exam` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[loginId]` on the table `UserProfile` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN     "lastStrikeAt" TIMESTAMP(3),
ADD COLUMN     "strikes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Exam" DROP COLUMN "autoSubmitThreshold";

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "loginId" TEXT,
ADD COLUMN     "passwordHash" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_loginId_key" ON "UserProfile"("loginId");
