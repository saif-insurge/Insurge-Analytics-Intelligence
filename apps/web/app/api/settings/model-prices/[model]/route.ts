import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { invalidatePricingCache } from "@/lib/pricing";
import { ModelPriceInput } from "../route";

/**
 * PUT    /api/settings/model-prices/<urlencoded-model>  — update a row
 * DELETE /api/settings/model-prices/<urlencoded-model>  — remove a row
 *
 * The `model` segment must be URL-encoded since model strings often contain
 * `/` (e.g. "google%2Fgemini-3-flash-preview").
 */

type Params = { params: Promise<{ model: string }> };

export async function PUT(req: Request, { params }: Params) {
  try {
    await requireAuth();
    const { model: rawModel } = await params;
    const model = decodeURIComponent(rawModel);

    const body = await req.json();
    // Allow PUT body without the model field — we take it from the URL.
    const parsed = ModelPriceInput.safeParse({ ...body, model });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", detail: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const row = await prisma.modelPrice.update({
      where: { model },
      data: {
        inputPerMTok: parsed.data.inputPerMTok,
        outputPerMTok: parsed.data.outputPerMTok,
        displayName: parsed.data.displayName ?? null,
        provider: parsed.data.provider ?? null,
        notes: parsed.data.notes ?? null,
      },
    });
    invalidatePricingCache();
    return NextResponse.json({ price: row });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal error", detail: message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requireAuth();
    const { model: rawModel } = await params;
    const model = decodeURIComponent(rawModel);
    await prisma.modelPrice.delete({ where: { model } });
    invalidatePricingCache();
    return NextResponse.json({ deleted: model });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal error", detail: message }, { status: 500 });
  }
}
