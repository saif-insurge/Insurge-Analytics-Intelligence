-- CreateTable
CREATE TABLE "ModelPrice" (
    "model" TEXT NOT NULL,
    "inputPerMTok" DOUBLE PRECISION NOT NULL,
    "outputPerMTok" DOUBLE PRECISION NOT NULL,
    "displayName" TEXT,
    "provider" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelPrice_pkey" PRIMARY KEY ("model")
);

-- CreateIndex
CREATE INDEX "ModelPrice_provider_idx" ON "ModelPrice"("provider");
