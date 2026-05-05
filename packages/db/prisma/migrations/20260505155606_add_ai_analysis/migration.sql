-- AlterTable
ALTER TABLE "Audit" ADD COLUMN     "aiAnalysis" JSONB,
ADD COLUMN     "detectedPlatforms" JSONB;
