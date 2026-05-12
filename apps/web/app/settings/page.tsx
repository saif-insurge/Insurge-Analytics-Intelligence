"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ReportBrandingForm } from "@/components/report-branding-form";
import { ModelPricingForm } from "@/components/model-pricing-form";

type AuditCostRow = {
  id: string;
  domain: string;
  funnelTokens: number;
  funnelCost: number;
  funnelModel: string | null;
  analysisTokens: number;
  analysisCost: number;
  analysisModel: string | null;
  totalCost: number;
  date: string;
};

type CostStats = {
  totalCost: number;
  totalFunnelCost: number;
  totalAnalysisCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalAudits: number;
  averageCostPerAudit: number;
  audits: AuditCostRow[];
};

export default function SettingsPage() {
  const [costs, setCosts] = useState<CostStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [costsError, setCostsError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/costs")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok || data.error) {
          setCostsError(data.error ?? `HTTP ${r.status}`);
          return;
        }
        // Coerce in case the API returns null/undefined for fields we expect numeric.
        const safe: CostStats = {
          totalCost: Number(data.totalCost ?? 0),
          totalFunnelCost: Number(data.totalFunnelCost ?? 0),
          totalAnalysisCost: Number(data.totalAnalysisCost ?? 0),
          totalInputTokens: Number(data.totalInputTokens ?? 0),
          totalOutputTokens: Number(data.totalOutputTokens ?? 0),
          totalTokens: Number(data.totalTokens ?? 0),
          totalAudits: Number(data.totalAudits ?? 0),
          averageCostPerAudit: Number(data.averageCostPerAudit ?? 0),
          audits: Array.isArray(data.audits) ? data.audits : [],
        };
        setCosts(safe);
      })
      .catch((err) => setCostsError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="content-container py-6">
      <header className="mb-10 rise">
        <div className="flex items-baseline justify-between gap-6 mb-1">
          <span className="eyebrow">/ Configuration · §02</span>
          <span className="eyebrow">Operator Console</span>
        </div>
        <div className="hairline mb-6" />
        <h1 className="font-display text-[3rem] leading-[0.95] font-semibold tracking-[-0.03em]">
          Settings<span className="text-accent">.</span>
        </h1>
        <p className="text-sm text-text-muted mt-3 max-w-md">
          Model configuration, token accounting, and a running ledger of inference cost.
        </p>
      </header>

      {/* API Keys */}
      <Section number="01" title="API Keys" subtitle="Submit audits programmatically from external tools">
        <Link
          href="/settings/api-keys"
          className="block border border-border rounded-md bg-bg-elevated/40 p-5 hover:border-accent/40 transition-colors group"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-sm">Manage API Keys</div>
              <p className="text-xs text-text-muted mt-1">Create, view, and revoke keys for the audit submission API.</p>
            </div>
            <span className="text-text-faint group-hover:text-accent transition-colors">→</span>
          </div>
        </Link>
      </Section>

      {/* Model Pricing — per-model token rates used by the Inference Ledger */}
      <Section number="02" title="Model Pricing" subtitle="USD per 1M tokens · edit rates here to recompute historical cost">
        <ModelPricingForm />
      </Section>

      {/* Report Branding */}
      <Section
        number="03"
        title="Report Branding"
        subtitle="Customize the public /report page shared with prospects"
      >
        <ReportBrandingForm previewAuditId={costs?.audits?.[0]?.id ?? null} />
      </Section>

      {/* Cost Overview */}
      <Section number="04" title="Inference Ledger" subtitle="Cumulative AI spend across all audits">
        {loading ? (
          <div className="border border-border rounded-md bg-bg-elevated/40 p-12 text-center text-text-muted text-sm">
            <div className="animate-pulse font-mono text-[11px] tracking-wider uppercase">
              Loading ledger…
            </div>
          </div>
        ) : !costs ? (
          <div className="border border-danger/30 bg-danger/[0.05] rounded-md p-8 text-center text-danger text-sm">
            Failed to load costs
          </div>
        ) : (
          <>
            {/* Hero stat: total spend */}
            <div className="border border-border rounded-md bg-bg-elevated/40 p-6 mb-3">
              <div className="flex items-end justify-between gap-6 flex-wrap">
                <div>
                  <span className="eyebrow">Total AI Spend</span>
                  <div className="font-display tnum text-[4rem] leading-none font-semibold mt-2 tracking-tight">
                    <span className="text-accent">$</span>
                    {costs.totalCost.toFixed(4)}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-8 text-right">
                  <Stat label="Audits" value={String(costs.totalAudits)} />
                  <Stat label="Avg / Audit" value={`$${costs.averageCostPerAudit.toFixed(4)}`} />
                  <Stat label="Total Tokens" value={costs.totalTokens.toLocaleString()} />
                </div>
              </div>
            </div>

            {/* Cost breakdown by source */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
              <CostCard
                label="Funnel Agent (Stagehand)"
                cost={costs.totalFunnelCost}
                hint="LLM cost during synthetic shopper walk"
              />
              <CostCard
                label="Tracking Analysis (Post-walk)"
                cost={costs.totalAnalysisCost}
                hint="OpenAI analysis of captured requests"
              />
            </div>

            {/* Per-audit ledger */}
            {costs.audits.length > 0 && (
              <div className="border border-border rounded-md overflow-hidden bg-bg-elevated/40">
                <div className="px-5 pt-4 pb-3 flex items-center gap-2">
                  <span className="eyebrow">Cost Per Audit</span>
                  <span className="text-text-faint text-xs font-mono">·</span>
                  <span className="text-text-faint text-xs font-mono tnum">
                    {costs.audits.length} entries
                  </span>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-y border-border bg-bg-subtle/40">
                      <th className="text-left px-5 py-2.5"><span className="eyebrow">Domain</span></th>
                      <th className="text-right px-3 py-2.5"><span className="eyebrow">Funnel</span></th>
                      <th className="text-right px-3 py-2.5"><span className="eyebrow">Analysis</span></th>
                      <th className="text-right px-3 py-2.5"><span className="eyebrow">Total</span></th>
                      <th className="text-right px-5 py-2.5"><span className="eyebrow">Date</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {costs.audits.map((a) => (
                      <tr key={a.id} className="border-b border-border-subtle last:border-0 hover:bg-bg-subtle/40 transition-colors">
                        <td className="text-sm px-5 py-3">
                          <Link href={`/audits/${a.id}`} className="text-text hover:text-accent transition-colors inline-flex items-center gap-1.5">
                            {a.domain}
                            <span className="font-mono text-[10px] text-text-faint">→</span>
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="text-xs font-mono tnum text-text-muted">${a.funnelCost.toFixed(4)}</div>
                          <div className="text-[10px] font-mono text-text-faint">{a.funnelTokens.toLocaleString()} tok</div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="text-xs font-mono tnum text-text-muted">${a.analysisCost.toFixed(4)}</div>
                          <div className="text-[10px] font-mono text-text-faint">{a.analysisTokens.toLocaleString()} tok</div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className="text-sm font-mono tnum text-accent">${a.totalCost.toFixed(4)}</span>
                        </td>
                        <td className="text-xs text-text-faint px-5 py-3 font-mono text-right">
                          {new Date(a.date).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Section>
    </main>
  );
}

function Section({
  number,
  title,
  subtitle,
  children,
}: {
  number: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-12">
      <div className="flex items-baseline gap-3 mb-4">
        <span className="font-mono text-[11px] tracking-wider text-accent">§{number}</span>
        <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
        {subtitle && <span className="text-xs text-text-faint">— {subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="eyebrow mb-1">{label}</div>
      <div className="text-lg font-display font-semibold tnum text-text">{value}</div>
    </div>
  );
}

function CostCard({ label, cost, hint }: { label: string; cost: number; hint?: string }) {
  return (
    <div className="border border-border rounded-md bg-bg-elevated/40 p-5">
      <div className="eyebrow mb-2">{label}</div>
      <div className="font-display tnum text-3xl font-semibold tracking-tight">
        <span className="text-accent">$</span>
        {cost.toFixed(4)}
      </div>
      {hint && <div className="font-mono text-[10px] text-text-faint mt-2">{hint}</div>}
    </div>
  );
}
