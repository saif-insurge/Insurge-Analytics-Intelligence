import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureOrgAndUser } from "@/lib/audit-submit";

// URL must use a safe scheme — block javascript:, data:, etc.
const SAFE_URL_REGEX = /^(https?:\/\/|mailto:|tel:)/i;

const BrandingSchema = z.object({
  reportCompanyName: z.string().trim().max(200).nullable().optional(),
  reportTagline: z.string().trim().max(200).nullable().optional(),
  reportCtaHeadline: z.string().trim().max(200).nullable().optional(),
  reportCtaBody: z.string().trim().max(1000).nullable().optional(),
  reportCtaLabel: z.string().trim().max(200).nullable().optional(),
  reportCtaUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || SAFE_URL_REGEX.test(v), {
      message: "URL must start with https://, http://, mailto:, or tel:",
    })
    .nullable()
    .optional(),
  reportFooterNote: z.string().trim().max(200).nullable().optional(),
});

const FIELDS = [
  "reportCompanyName",
  "reportTagline",
  "reportCtaHeadline",
  "reportCtaBody",
  "reportCtaLabel",
  "reportCtaUrl",
  "reportFooterNote",
] as const;

const SELECT_BRANDING = {
  reportCompanyName: true,
  reportTagline: true,
  reportCtaHeadline: true,
  reportCtaBody: true,
  reportCtaLabel: true,
  reportCtaUrl: true,
  reportFooterNote: true,
} as const;

/** GET /api/settings/report-branding — returns the current org's branding fields. */
export async function GET() {
  try {
    const { organizationId, userId } = await requireAuth();
    await ensureOrgAndUser({ organizationId, userId });
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: SELECT_BRANDING,
    });
    return NextResponse.json({ branding: org ?? {} });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal error", detail: message }, { status: 500 });
  }
}

/** PATCH /api/settings/report-branding — partial update; empty strings become null. */
export async function PATCH(req: Request) {
  try {
    const { organizationId, userId } = await requireAuth();
    await ensureOrgAndUser({ organizationId, userId });

    const body = await req.json();
    const parsed = BrandingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", detail: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Normalize: empty/whitespace-only strings → null so the report falls back to defaults.
    const data: Record<string, string | null> = {};
    for (const key of FIELDS) {
      const v = parsed.data[key];
      if (v === undefined) continue;
      data[key] = v && v.trim().length > 0 ? v : null;
    }

    const org = await prisma.organization.update({
      where: { id: organizationId },
      data,
      select: SELECT_BRANDING,
    });

    return NextResponse.json({ branding: org });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal error", detail: message }, { status: 500 });
  }
}
