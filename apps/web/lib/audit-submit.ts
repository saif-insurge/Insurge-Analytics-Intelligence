import { prisma } from "@/lib/db";
import { tick } from "@/lib/scheduler";

export type CreateAuditInput = {
  organizationId: string;
  userId: string;
  url: string;
  notes?: string;
  notifyEmail?: string;
};

/**
 * Creates an Audit row (status=PENDING) and pings the scheduler so it gets
 * dispatched immediately if a slot is open.
 *
 * Caller is responsible for upserting Organization/User if they're not already
 * known to exist (use `ensureOrgAndUser` below).
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
      notifyEmail: notifyEmail ?? null,
    },
  });

  // Fire scheduler tick. If a slot is open this audit gets RUNNING + dispatched
  // right now; otherwise it waits in PENDING for the next slot to free.
  // Fire-and-forget — don't make the caller wait for the dispatch round trip.
  void tick().catch((err) => console.error("Scheduler tick on submit failed:", err));

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
