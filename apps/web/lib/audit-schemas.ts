import { z } from "zod";

export const CreateSingleAuditSchema = z.object({
  url: z.string().url().startsWith("http"),
  notes: z.string().optional(),
  notifyEmail: z.string().email().optional(),
});

export const CreateBulkAuditSchema = z.object({
  urls: z.array(z.string().url().startsWith("http")).min(1).max(100),
  notes: z.string().optional(),
  notifyEmail: z.string().email().optional(),
});
