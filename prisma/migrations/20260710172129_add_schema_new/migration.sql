-- AlterTable
ALTER TABLE "User" ADD COLUMN     "activityLevel" TEXT,
ADD COLUMN     "birthday" TIMESTAMP(3),
ADD COLUMN     "goal" TEXT,
ADD COLUMN     "targetWeight" DOUBLE PRECISION;
