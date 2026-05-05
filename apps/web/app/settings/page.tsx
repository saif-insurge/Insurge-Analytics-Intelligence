"use client";

import { useEffect, useState } from "react";

type CostStats = {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalAudits: number;
  averageCostPerAudit: number;
  audits: { id: string; domain: string; cost: number; tokens: number; date: string }[];
};

export default function SettingsPage() {
  const [costs, setCosts] = useState<CostStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings/costs")
      .then((r) => r.json())
      .then(setCosts)
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="content-container py-10">
      <h1 className="font-display text-2xl font-bold mb-2">Settings</h1>
      <p className="text-sm text-text-muted mb-8">AI configuration and cost tracking</p>

      {/* AI Model Configuration */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">AI Model Configuration</h2>
        <div className="glass rounded-lg p-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-text-muted mb-1">Model</label>
              <div className="text-sm font-mono text-text">gpt-5.4</div>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Input Cost</label>
              <div className="text-sm font-mono text-text">
                ${process.env.NEXT_PUBLIC_AI_INPUT_COST ?? "2.50"} / MTok
              </div>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Output Cost</label>
              <div className="text-sm font-mono text-text">
                ${process.env.NEXT_PUBLIC_AI_OUTPUT_COST ?? "15.00"} / MTok
              </div>
            </div>
          </div>
          <p className="text-[10px] text-text-faint mt-3">
            Pricing is configured via environment variables: AI_INPUT_COST_PER_MTOK, AI_OUTPUT_COST_PER_MTOK
          </p>
        </div>
      </section>

      {/* Cost Overview */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">AI Cost Overview</h2>
        {loading ? (
          <div className="glass rounded-lg p-8 text-center text-text-muted text-sm">Loading cost data...</div>
        ) : !costs ? (
          <div className="glass rounded-lg p-8 text-center text-text-muted text-sm">Failed to load costs</div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <StatCard label="Total AI Spend" value={`$${costs.totalCost.toFixed(4)}`} />
              <StatCard label="Audits with AI" value={String(costs.totalAudits)} />
              <StatCard label="Avg Cost / Audit" value={`$${costs.averageCostPerAudit.toFixed(4)}`} />
              <StatCard label="Total Tokens" value={costs.totalTokens.toLocaleString()} />
            </div>

            {/* Token breakdown */}
            <div className="glass rounded-lg p-5 mb-6">
              <h3 className="text-sm font-medium text-text-muted mb-3">Token Breakdown</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-text-faint">Input Tokens</div>
                  <div className="text-lg font-semibold">{costs.totalInputTokens.toLocaleString()}</div>
                  <div className="text-[10px] text-text-faint">
                    ${((costs.totalInputTokens / 1_000_000) * 2.5).toFixed(4)} at $2.50/MTok
                  </div>
                </div>
                <div>
                  <div className="text-xs text-text-faint">Output Tokens</div>
                  <div className="text-lg font-semibold">{costs.totalOutputTokens.toLocaleString()}</div>
                  <div className="text-[10px] text-text-faint">
                    ${((costs.totalOutputTokens / 1_000_000) * 15).toFixed(4)} at $15.00/MTok
                  </div>
                </div>
              </div>
            </div>

            {/* Per-audit cost table */}
            {costs.audits.length > 0 && (
              <div className="glass rounded-lg overflow-hidden">
                <h3 className="text-sm font-medium text-text-muted px-5 pt-4 pb-2">Cost per Audit</h3>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="text-xs font-medium text-text-faint px-5 py-2">Domain</th>
                      <th className="text-xs font-medium text-text-faint px-5 py-2">Tokens</th>
                      <th className="text-xs font-medium text-text-faint px-5 py-2">Cost</th>
                      <th className="text-xs font-medium text-text-faint px-5 py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costs.audits.map((a) => (
                      <tr key={a.id} className="border-b border-border-subtle">
                        <td className="text-sm px-5 py-2.5">
                          <a href={`/audits/${a.id}`} className="text-text hover:text-accent transition-colors">
                            {a.domain}
                          </a>
                        </td>
                        <td className="text-xs text-text-muted px-5 py-2.5 font-mono">{a.tokens.toLocaleString()}</td>
                        <td className="text-xs text-text-muted px-5 py-2.5 font-mono">${a.cost.toFixed(4)}</td>
                        <td className="text-xs text-text-faint px-5 py-2.5">{new Date(a.date).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-lg p-4">
      <div className="text-xs text-text-muted mb-1">{label}</div>
      <div className="text-lg font-semibold font-mono">{value}</div>
    </div>
  );
}
