-- AlterTable
ALTER TABLE "Audit" ADD COLUMN     "funnelInferenceMs" INTEGER,
ADD COLUMN     "funnelInputTokens" INTEGER,
ADD COLUMN     "funnelModel" TEXT,
ADD COLUMN     "funnelOutputTokens" INTEGER;
