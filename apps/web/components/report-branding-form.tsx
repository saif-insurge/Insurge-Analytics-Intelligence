"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { REPORT_DEFAULTS } from "@/lib/report-defaults";

type Branding = {
  reportCompanyName: string;
  reportTagline: string;
  reportCtaHeadline: string;
  reportCtaBody: string;
  reportCtaLabel: string;
  reportCtaUrl: string;
  reportFooterNote: string;
};

const EMPTY: Branding = {
  reportCompanyName: "",
  reportTagline: "",
  reportCtaHeadline: "",
  reportCtaBody: "",
  reportCtaLabel: "",
  reportCtaUrl: "",
  reportFooterNote: "",
};

export function ReportBrandingForm({ previewAuditId }: { previewAuditId: string | null }) {
  const [branding, setBranding] = useState<Branding>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/report-branding")
      .then((r) => r.json())
      .then((data) => {
        if (data.branding) {
          setBranding({
            reportCompanyName: data.branding.reportCompanyName ?? "",
            reportTagline: data.branding.reportTagline ?? "",
            reportCtaHeadline: data.branding.reportCtaHeadline ?? "",
            reportCtaBody: data.branding.reportCtaBody ?? "",
            reportCtaLabel: data.branding.reportCtaLabel ?? "",
            reportCtaUrl: data.branding.reportCtaUrl ?? "",
            reportFooterNote: data.branding.reportFooterNote ?? "",
          });
        }
      })
      .catch(() => setError("Failed to load branding"))
      .finally(() => setLoading(false));
  }, []);

  function update<K extends keyof Branding>(key: K, value: string) {
    setBranding((b) => ({ ...b, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/report-branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(branding),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data?.detail?.fieldErrors
          ? Object.entries(data.detail.fieldErrors)
              .map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`)
              .join("\n")
          : data?.error ?? "Failed to save";
        toast.error(detail);
        setError(detail);
      } else {
        toast.success("Report branding saved");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="border border-border rounded-md bg-bg-elevated/40 p-12 text-center text-text-muted text-sm">
        <div className="animate-pulse font-mono text-[11px] tracking-wider uppercase">Loading branding…</div>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-md bg-bg-elevated/40 p-5 space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field
          label="Company name"
          placeholder={REPORT_DEFAULTS.companyName}
          value={branding.reportCompanyName}
          onChange={(v) => update("reportCompanyName", v)}
          help="Shown in the report header. Defaults to “Insurge”."
        />
        <Field
          label="Tagline"
          placeholder={REPORT_DEFAULTS.tagline}
          value={branding.reportTagline}
          onChange={(v) => update("reportTagline", v)}
          help="Subtitle under the domain on the report page."
        />
      </div>

      <Field
        label="CTA headline"
        placeholder={REPORT_DEFAULTS.ctaHeadline}
        value={branding.reportCtaHeadline}
        onChange={(v) => update("reportCtaHeadline", v)}
      />

      <FieldArea
        label="CTA body"
        placeholder={REPORT_DEFAULTS.ctaBody}
        value={branding.reportCtaBody}
        onChange={(v) => update("reportCtaBody", v)}
        rows={3}
      />

      <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4">
        <Field
          label="CTA button label"
          placeholder={REPORT_DEFAULTS.ctaLabel}
          value={branding.reportCtaLabel}
          onChange={(v) => update("reportCtaLabel", v)}
          help="Used by the header button and the Next Steps CTA at the bottom."
        />
        <Field
          label="CTA URL"
          placeholder={REPORT_DEFAULTS.ctaUrl}
          value={branding.reportCtaUrl}
          onChange={(v) => update("reportCtaUrl", v)}
          help="Must start with https://, http://, mailto:, or tel:."
        />
      </div>

      <Field
        label="Footer note"
        placeholder={REPORT_DEFAULTS.footerNote}
        value={branding.reportFooterNote}
        onChange={(v) => update("reportFooterNote", v)}
      />

      <div className="flex items-center justify-between gap-3 pt-2">
        <div className="text-xs text-text-faint">
          {previewAuditId ? (
            <a
              href={`/report/${previewAuditId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-muted hover:text-accent transition-colors inline-flex items-center gap-1"
            >
              Preview on latest report
              <span className="text-[10px]">↗</span>
            </a>
          ) : (
            <span>Run an audit to preview your branding on a live report.</span>
          )}
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="text-sm font-medium px-4 py-2 bg-accent hover:bg-accent-hover text-accent-ink rounded-sm transition-all hover:translate-y-[-1px] hover:shadow-[0_8px_24px_-8px_rgba(212,255,58,0.5)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {error && <p className="text-xs text-danger whitespace-pre-line">{error}</p>}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  help,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  help?: string;
}) {
  return (
    <label className="block">
      <div className="eyebrow mb-1.5">{label}</div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text placeholder:text-text-faint focus:border-accent/60 focus:outline-none transition-colors"
      />
      {help && <p className="text-[10px] text-text-faint mt-1">{help}</p>}
    </label>
  );
}

function FieldArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block">
      <div className="eyebrow mb-1.5">{label}</div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text placeholder:text-text-faint focus:border-accent/60 focus:outline-none transition-colors resize-y"
      />
    </label>
  );
}
