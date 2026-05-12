"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ConfirmDeleteModal } from "@/components/confirm-delete-modal";
import { AuditTocSidebar, type TocSection } from "@/components/audit-toc-sidebar";
import {
  FindingCard,
  EcommerceEventsSection,
  FunnelLogSection,
  AdPixelsSection,
  AiAnalysisSection,
  CategoryScores,
  CATEGORY_LABELS,
  type Finding,
  type CapturedEvent,
  type DetectedPlatformData,
  type AiAnalysisData,
  type FunnelStepLogData,
} from "@/components/audit-sections";

type Audit = {
  id: string;
  url: string;
  domain: string;
  status: string;
  overallScore: number | null;
  overallGrade: string | null;
  platform: string | null;
  platformConfidence: string | null;
  queuedAt: string;
  completedAt: string | null;
  failureReason: string | null;
  operatorNotes: string | null;
  findings: Finding[];
  events: CapturedEvent[] | null;
  aiAnalysis: AiAnalysisData | null;
  detectedPlatforms: DetectedPlatformData[] | null;
  funnelLog: FunnelStepLogData[] | null;
};

export default function AuditDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const fetchAudit = useCallback(() => {
    if (!id) return;
    fetch(`/api/audits/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setAudit(data.audit);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  useEffect(() => {
    if (!audit) return;
    if (!["PENDING", "RUNNING", "ANALYZING", "RENDERING"].includes(audit.status)) return;
    const interval = setInterval(fetchAudit, 3000);
    return () => clearInterval(interval);
  }, [audit?.status, fetchAudit]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!audit) return null;

  const isInProgress = ["PENDING", "RUNNING", "ANALYZING", "RENDERING"].includes(audit.status);

  function copyShareLink() {
    const shareUrl = `${window.location.origin}/report/${audit!.id}`;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className="content-container py-6">
      {/* Back link */}
      <Link
        href="/audits"
        className="inline-flex items-center gap-2 font-mono text-[11px] text-text-faint hover:text-accent transition-colors"
      >
        ← Back to log
      </Link>

      {/* Editorial header */}
      <header className="mt-6 mb-10 rise">
        <div className="flex items-baseline justify-between gap-6 mb-1">
          <span className="eyebrow">
            / Record · {new Date(audit.queuedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          </span>
          <span className="eyebrow tnum">ID·{audit.id.slice(-8)}</span>
        </div>
        <div className="hairline mb-6" />

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 sm:gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[2.5rem] sm:text-[3.25rem] leading-[0.95] font-semibold tracking-[-0.03em] truncate break-words">
              {audit.domain}
              <span className="text-accent">.</span>
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-xs">
              <a
                href={audit.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-text-muted hover:text-accent transition-colors inline-flex items-center gap-1"
              >
                {audit.url}
                <span className="text-[10px]">↗</span>
              </a>
              {audit.platform && (
                <span className="font-mono text-text-faint">
                  · platform <span className="text-text-muted capitalize">{audit.platform}</span>
                </span>
              )}
              <span className="font-mono text-text-faint">
                · {new Date(audit.queuedAt).toLocaleString()}
              </span>
            </div>
          </div>

          {audit.overallScore !== null && (
            <div className="sm:text-right shrink-0">
              <span className="eyebrow">Overall</span>
              <div className="flex items-baseline sm:block gap-3">
                <div className={`font-display tnum text-[3.5rem] sm:text-[5rem] leading-none font-semibold ${gradeColor(audit.overallGrade)} sm:mt-1`}>
                  {audit.overallScore}
                </div>
                <div className="font-mono text-[10px] text-text-faint sm:mt-1 tracking-wider uppercase">
                  /100 · {audit.overallGrade}
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* In-progress state */}
      {isInProgress && (
        <>
          <InProgressBanner status={audit.status} />
          <div className="mb-8 -mt-4 flex justify-end">
            <button
              onClick={async () => {
                if (!confirm(`Cancel the audit for ${audit.domain}? The worker will stop within ~10 seconds.`)) return;
                setCancelling(true);
                try {
                  const res = await fetch(`/api/audits/${audit.id}/cancel`, { method: "POST" });
                  const d = await res.json();
                  if (res.ok && d.cancelled) {
                    fetchAudit();
                  }
                } finally {
                  setCancelling(false);
                }
              }}
              disabled={cancelling}
              className="text-sm px-4 py-2 text-warning hover:bg-warning/[0.07] border border-warning/30 hover:border-warning/50 rounded-sm transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-2"
            >
              <span className="font-mono text-xs">⊘</span>
              {cancelling ? "Cancelling…" : "Cancel audit"}
            </button>
          </div>
        </>
      )}

      {/* Failed state */}
      {audit.status === "FAILED" && (
        <div className="mb-6 px-5 py-4 bg-danger/5 border border-danger/20 rounded-lg">
          <p className="font-medium text-danger">Audit failed</p>
          {audit.failureReason && <p className="text-sm text-text-muted mt-1">{audit.failureReason}</p>}
        </div>
      )}

      {/* Results */}
      {audit.status === "COMPLETE" && (() => {
        // Build TOC sections dynamically — only include those that actually render.
        const tocSections: TocSection[] = [
          { id: "overview", label: "Overview" },
        ];
        if (audit.funnelLog && audit.funnelLog.length > 0) {
          tocSections.push({ id: "funnel-walk", label: "Funnel Walk" });
        }
        tocSections.push({ id: "ai-analysis", label: "AI Analysis" });
        if (audit.detectedPlatforms) {
          tocSections.push({ id: "ad-pixels", label: "Ad Pixels" });
        }
        tocSections.push({ id: "events", label: "Ecommerce Events" });
        if (audit.findings.length > 0) {
          tocSections.push({ id: "findings", label: "Findings" });
        }

        return (
        <div className="lg:grid lg:grid-cols-[180px_1fr] lg:gap-10">
          <AuditTocSidebar sections={tocSections} />
          <div className="min-w-0 [&_section]:scroll-mt-8">
          <section id="overview">
          <CategoryScores findings={audit.findings} />

          {/* Actions */}
          <div className="mb-10 flex items-center gap-2 flex-wrap">
            <a
              href={`/api/audits/${audit.id}/pdf`}
              className="text-sm font-medium px-4 py-2 bg-accent hover:bg-accent-hover text-accent-ink rounded-sm transition-all hover:translate-y-[-1px] hover:shadow-[0_8px_24px_-8px_rgba(212,255,58,0.5)] inline-flex items-center gap-2"
            >
              <span className="font-mono text-xs">↓</span>
              Download PDF
            </a>
            <button
              onClick={copyShareLink}
              className="text-sm px-4 py-2 bg-bg-elevated border border-border hover:border-accent/50 hover:text-accent rounded-sm transition-colors cursor-pointer inline-flex items-center gap-2"
            >
              {copied ? (
                <>
                  <span className="text-accent">✓</span>
                  Copied!
                </>
              ) : (
                <>
                  <span className="font-mono text-xs">⌘</span>
                  Copy Share Link
                </>
              )}
            </button>
            <button
              onClick={async () => {
                setRerunning(true);
                try {
                  const res = await fetch("/api/audits", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url: audit.url }),
                  });
                  const data = await res.json();
                  if (data.auditId) router.push(`/audits/${data.auditId}`);
                } finally {
                  setRerunning(false);
                }
              }}
              disabled={rerunning}
              className="text-sm px-4 py-2 bg-bg-elevated border border-border hover:border-accent/50 hover:text-accent rounded-sm transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-2"
            >
              <span className="font-mono text-xs">↻</span>
              {rerunning ? "Re-running…" : "Re-run Audit"}
            </button>
            <div className="flex-1" />
            <button
              onClick={() => setDeleteModalOpen(true)}
              className="text-xs px-3 py-2 text-text-faint hover:text-danger hover:bg-danger/[0.07] border border-transparent hover:border-danger/30 rounded-sm transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <span className="font-mono">✕</span>
              Delete
            </button>
          </div>

          {/* Delete confirmation modal */}
          <ConfirmDeleteModal
            open={deleteModalOpen}
            onOpenChange={setDeleteModalOpen}
            title="Delete this audit?"
            description={`This will permanently delete the audit for ${audit.domain}, including all findings, captured events, and analysis data.`}
            confirmPhrase={audit.domain}
            loading={deleting}
            onConfirm={async () => {
              setDeleting(true);
              try {
                const res = await fetch("/api/audits", {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ids: [audit.id] }),
                });
                if (res.ok) {
                  router.push("/audits");
                }
              } finally {
                setDeleting(false);
              }
            }}
          />
          </section>

          {/* Funnel Walk Log */}
          {audit.funnelLog && audit.funnelLog.length > 0 && (
            <section id="funnel-walk">
              <FunnelLogSection steps={audit.funnelLog} />
            </section>
          )}

          {/* AI Analysis & Detected Platforms */}
          <section id="ai-analysis">
          {(audit.aiAnalysis || audit.detectedPlatforms) ? (
            <AiAnalysisSection
              aiAnalysis={audit.aiAnalysis}
              detectedPlatforms={audit.detectedPlatforms}
              onReanalyze={async () => {
                setAnalyzing(true);
                try {
                  await fetch(`/api/audits/${audit.id}/reanalyze`, { method: "POST" });
                  fetchAudit();
                } finally {
                  setAnalyzing(false);
                }
              }}
              analyzing={analyzing}
            />
          ) : (
            <div className="mb-8 glass rounded-lg p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-xl font-semibold mb-1">Tracking Intelligence</h2>
                  <p className="text-sm text-text-muted">
                    {audit.aiAnalysis === null
                      ? "AI analysis was not available when this audit was run."
                      : "No analysis data available."}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    setAnalyzing(true);
                    try {
                      await fetch(`/api/audits/${audit.id}/reanalyze`, { method: "POST" });
                      fetchAudit();
                    } finally {
                      setAnalyzing(false);
                    }
                  }}
                  disabled={analyzing}
                  className="text-sm px-4 py-2 bg-accent hover:bg-accent-hover disabled:bg-accent/50 text-white rounded-md transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  {analyzing ? "Analyzing..." : "Run AI Analysis"}
                </button>
              </div>
            </div>
          )}
          </section>

          {/* Ad Pixels & Conversion Tracking */}
          {audit.detectedPlatforms && (
            <section id="ad-pixels">
              <AdPixelsSection platforms={audit.detectedPlatforms} />
            </section>
          )}

          {/* Ecommerce Events */}
          <section id="events">
          {audit.events && audit.events.length > 0 ? (
            <EcommerceEventsSection events={audit.events} />
          ) : (
            <div className="mb-8 glass rounded-lg p-5 border-l-2 border-l-warning">
              <h2 className="font-display text-xl font-semibold mb-2 flex items-center gap-2">
                <span className="text-warning">⚠</span>
                No GA4 Events Captured
              </h2>
              <p className="text-sm text-text-muted">
                The audit browser did not capture any GA4 events from this site. Possible reasons:
              </p>
              <ul className="text-sm text-text-faint mt-2 space-y-1 list-disc list-inside">
                <li>The site blocked the automated browser (bot detection)</li>
                <li>GA4 is behind a consent manager that denied analytics in headless mode</li>
                <li>Events fire via a non-standard endpoint our interceptor doesn't match</li>
                <li>The site doesn't have GA4 implemented</li>
              </ul>
            </div>
          )}
          </section>

          {/* Findings */}
          {audit.findings.length > 0 && (
            <section id="findings">
              <h2 className="font-display text-xl font-semibold mb-4">
                Findings ({audit.findings.length})
              </h2>

              {Object.entries(CATEGORY_LABELS).map(([key, { label }]) => {
                const catFindings = audit.findings.filter((f) => f.category === key);
                if (catFindings.length === 0) return null;
                return (
                  <div key={key} className="mb-6">
                    <h3 className="text-sm font-medium text-text-muted mb-3 uppercase tracking-wide">{label}</h3>
                    <div className="space-y-2">
                      {catFindings.map((f) => (
                        <FindingCard key={f.id} finding={f} platform={audit.platform} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          )}
          </div>
        </div>
        );
      })()}
    </main>
  );
}

function InProgressBanner({ status }: { status: string }) {
  const steps = ["PENDING", "RUNNING", "ANALYZING", "RENDERING"];
  const current = steps.indexOf(status);

  return (
    <div className="mb-8 p-5 glass rounded-lg">
      <div className="flex items-center gap-3 mb-4">
        <svg className="animate-spin h-4 w-4 text-accent" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-sm font-medium">Audit in progress</span>
      </div>
      <div className="flex gap-1">
        {steps.map((step, i) => (
          <div key={step} className="flex-1">
            <div className={`h-1 rounded-full ${i <= current ? "bg-accent" : "bg-bg-subtle"} transition-colors`} />
            <div className={`text-[10px] mt-1 ${i === current ? "text-accent" : "text-text-faint"}`}>
              {step.toLowerCase()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <main className="content-container py-10 text-center text-text-muted">
      <svg className="animate-spin h-6 w-6 mx-auto text-accent" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <p className="mt-3 text-sm">Loading audit...</p>
    </main>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <main className="content-container py-10 text-center">
      <p className="text-danger">{message}</p>
      <Link href="/audits" className="text-sm text-accent mt-4 inline-block">← Back to audits</Link>
    </main>
  );
}

function gradeColor(grade: string | null): string {
  if (grade === "pass") return "text-success";
  if (grade === "evaluate") return "text-warning";
  return "text-danger";
}
