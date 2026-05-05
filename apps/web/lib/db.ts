/**
 * Re-export prisma from the db package.
 * The DATABASE_URL env var is loaded by Next.js from .env.local or .env
 */
export { prisma, Prisma } from "@ga4-audit/db";
