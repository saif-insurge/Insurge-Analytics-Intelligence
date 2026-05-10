import { Client } from "@upstash/qstash";
import { prisma } from "@/lib/db";

export type CreateAuditInput = {
  organizationId: string;
  userId: string;
  url: string;
  notes?: string;
  notifyEmail?: string;
};

/**
 * Creates an Audit row, then enqueues to the worker via QStash (or direct fetch fallback).
 * Caller is responsible for upserting Organization/User if they're not already known to exist.
 */
export async function createAudit(input: CreateAuditInput): Promise<{ auditId: string }> {
  const { organizationId, userId, url, notes, notifyEmail } = input;
  const domain = new URL(url).hostname;

  const audit = await prisma.audit.create({
    data: {
      organizationId,
      createdById: userId,
      url,
      domain,
      status: "PENDING",
      operatorNotes: notes ?? "",
    },
  });

  const workerUrl = process.env.WORKER_BASE_URL;
  if (workerUrl) {
    if (process.env.QSTASH_TOKEN) {
      const qstash = new Client({ token: process.env.QSTASH_TOKEN });
      await qstash.publishJSON({
        url: `${workerUrl}/audit`,
        body: { auditId: audit.id, notifyEmail },
      });
    } else {
      // Dev fallback: fire-and-forget direct call to the worker
      fetch(`${workerUrl}/audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditId: audit.id, notifyEmail }),
      }).catch(() => {});
    }
  }

  return { auditId: audit.id };
}

/** Upserts Organization and User records — call once per request before createAudit. */
export async function ensureOrgAndUser(opts: {
  organizationId: string;
  userId: string;
  email?: string;
}): Promise<void> {
  await prisma.organization.upsert({
    where: { id: opts.organizationId },
    update: {},
    create: { id: opts.organizationId, name: "Default" },
  });
  await prisma.user.upsert({
    where: { id: opts.userId },
    update: {},
    create: { id: opts.userId, email: opts.email ?? opts.userId, organizationId: opts.organizationId },
  });
}
