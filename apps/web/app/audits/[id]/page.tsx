"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ConfirmDeleteModal } from "@/components/confirm-delete-modal";

type Finding = {
  id: string;
  ruleId: string;
  category: string;
  severity: string;
  status: string;
  title: string;
  summary: string;
  impact?: string;
  fix?: { platformSpecific?: Record<string, string>; estimatedEffort?: string };
};

type CapturedEvent = {
  name: string;
  tid: string;
  transport: string;
  params: Record<string, unknown>;
  items: Record<string, unknown>[];
};

type DetectedPlatformData = {
  name: string;
  category: "cdp" | "analytics" | "ads" | "pixel" | "tag_manager";
  requestCount: number;
  sampleUrls: string[];
  detectedEvents: string[];
};

type AiAnalysisData = {
  summary: string;
  ga4Present: boolean;
  insights: { category: "observation" | "issue" | "recommendation"; text: string }[];
  tokensUsed: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
};

type FunnelStepLogData = {
  step: number;
  name: string;
  instruction: string;
  urlBefore: string;
  urlAfter: string;
  success: boolean;
  error?: string;
  eventsCaptureDuringStep: number;
  timestamp: string;
  durationMs: number;
};

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

/** Canonical GA4 ecommerce funnel events in order. */
const FUNNEL_EVENTS = [
  { name: "view_item_list", label: "View Item List" },
  { name: "select_item", label: "Select Item" },
  { name: "view_item", label: "View Item" },
  { name: "add_to_cart", label: "Add to Cart" },
  { name: "view_cart", label: "View Cart" },
  { name: "begin_checkout", label: "Begin Checkout" },
  { name: "add_shipping_info", label: "Add Shipping Info" },
  { name: "add_payment_info", label: "Add Payment Info" },
];

const KNOWN_NON_ECOMMERCE = new Set([
  "page_view", "scroll", "user_engagement", "first_visit", "session_start",
  "view_item_list", "select_item", "view_item", "add_to_cart", "remove_from_cart",
  "view_cart", "begin_checkout", "add_shipping_info", "add_payment_info",
  "purchase", "refund", "add_to_wishlist", "view_promotion", "select_promotion",
  "search", "generate_lead", "sign_up",
]);

const CATEGORY_LABELS: Record<string, { label: string; maxScore: number }> = {
  implementation_coverage: { label: "Implementation Coverage", maxScore: 30 },
  data_quality: { label: "Data Quality", maxScore: 30 },
  platform_infrastructure: { label: "Platform & Infrastructure", maxScore: 25 },
  feature_adoption: { label: "Feature Adoption", maxScore: 15 },
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
    <main className="content-container py-10">
      {/* Back link */}
      <Link href="/audits" className="text-sm text-text-faint hover:text-text-muted transition-colors">
        ← Back to audits
      </Link>

      {/* Header */}
      <div className="mt-4 mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">{audit.domain}</h1>
          <p className="text-sm text-text-muted mt-1">
            {audit.url} · {audit.platform ?? "custom"} · {new Date(audit.queuedAt).toLocaleDateString()}
          </p>
        </div>

        {audit.overallScore !== null && (
          <div className="text-right">
            <div className={`text-4xl font-display font-bold ${gradeColor(audit.overallGrade)}`}>
              {audit.overallScore}
            </div>
            <div className="text-xs text-text-muted">/100 · {audit.overallGrade}</div>
          </div>
        )}
      </div>

      {/* In-progress state */}
      {isInProgress && <InProgressBanner status={audit.status} />}

      {/* Failed state */}
      {audit.status === "FAILED" && (
        <div className="mb-6 px-5 py-4 bg-danger/5 border border-danger/20 rounded-lg">
          <p className="font-medium text-danger">Audit failed</p>
          {audit.failureReason && <p className="text-sm text-text-muted mt-1">{audit.failureReason}</p>}
        </div>
      )}

      {/* Results */}
      {audit.status === "COMPLETE" && (
        <>
          {/* Category scores */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            {Object.entries(CATEGORY_LABELS).map(([key, { label, maxScore }]) => {
              const catFindings = audit.findings.filter((f) => f.category === key);
              const failures = catFindings.filter((f) => f.status === "fail").length;
              return (
                <div key={key} className="glass rounded-lg p-4">
                  <div className="text-xs text-text-muted mb-2">{label}</div>
                  <div className="text-lg font-semibold">
                    {failures === 0 ? (
                      <span className="text-success">All clear</span>
                    ) : (
                      <span className="text-danger">{failures} issue{failures > 1 ? "s" : ""}</span>
                    )}
                  </div>
                  <div className="text-xs text-text-faint mt-1">/{maxScore} pts</div>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="mb-8 flex items-center gap-3">
            <a
              href={`/api/audits/${audit.id}/pdf`}
              className="text-sm px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-md transition-colors"
            >
              Download PDF
            </a>
            <button
              onClick={copyShareLink}
              className="text-sm px-4 py-2 bg-bg-elevated border border-border hover:border-accent/50 rounded-md transition-colors cursor-pointer"
            >
              {copied ? "✓ Copied!" : "Copy Share Link"}
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
              className="text-sm px-4 py-2 bg-bg-elevated border border-border hover:border-accent/50 rounded-md transition-colors cursor-pointer disabled:opacity-50"
            >
              {rerunning ? "Re-running..." : "Re-run Audit"}
            </button>
            <div className="flex-1" />
            <button
              onClick={() => setDeleteModalOpen(true)}
              className="text-xs px-3 py-2 text-danger/70 hover:text-danger hover:bg-danger/10 border border-transparent hover:border-danger/20 rounded-md transition-colors cursor-pointer"
            >
              Delete Audit
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

          {/* Funnel Walk Log */}
          {audit.funnelLog && audit.funnelLog.length > 0 && (
            <FunnelLogSection steps={audit.funnelLog} />
          )}

          {/* AI Analysis & Detected Platforms */}
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

          {/* Ad Pixels & Conversion Tracking */}
          {audit.detectedPlatforms && (
            <AdPixelsSection platforms={audit.detectedPlatforms} />
          )}

          {/* Ecommerce Events */}
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

          {/* Findings */}
          <div>
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
          </div>
        </>
      )}
    </main>
  );
}

function FindingCard({ finding, platform }: { finding: Finding; platform: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const severityClass: Record<string, string> = {
    critical: "text-severity-critical",
    high: "text-severity-high",
    medium: "text-severity-medium",
    low: "text-severity-low",
    info: "text-severity-info",
  };
  const borderClass = finding.status === "pass" ? "border-l-success" : finding.status === "evaluate" ? "border-l-warning" : "border-l-danger";

  return (
    <div className={`border border-border rounded-lg border-l-2 ${borderClass} overflow-hidden`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-bg-subtle/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <span className={`text-[10px] font-semibold uppercase tracking-wide ${severityClass[finding.severity] ?? "text-text-muted"}`}>
            {finding.severity}
          </span>
          <span className="text-sm font-medium">{finding.title}</span>
        </div>
        <span className={`text-xs font-medium ${finding.status === "pass" ? "text-success" : finding.status === "evaluate" ? "text-warning" : "text-danger"}`}>
          {finding.status}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border-subtle">
          <p className="text-sm text-text-muted mt-3">{finding.summary}</p>
          {finding.impact && (
            <p className="text-sm text-text-faint mt-2 italic">{finding.impact}</p>
          )}
          {finding.fix?.platformSpecific && platform && finding.fix.platformSpecific[platform] && (
            <div className="mt-3 p-3 bg-bg-subtle rounded-md">
              <div className="text-xs font-medium text-accent mb-1">Fix for {platform}:</div>
              <p className="text-sm text-text-muted">{finding.fix.platformSpecific[platform]}</p>
              {finding.fix.estimatedEffort && (
                <p className="text-xs text-text-faint mt-1">Estimated effort: {finding.fix.estimatedEffort}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
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
    <main className="content-container py-20 text-center text-text-muted">
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
    <main className="content-container py-20 text-center">
      <p className="text-danger">{message}</p>
      <Link href="/audits" className="text-sm text-accent mt-4 inline-block">← Back to audits</Link>
    </main>
  );
}

function EcommerceEventsSection({ events }: { events: CapturedEvent[] }) {
  // Group events by name
  const byName = new Map<string, CapturedEvent[]>();
  for (const e of events) {
    if (!e.name) continue;
    const existing = byName.get(e.name) ?? [];
    existing.push(e);
    byName.set(e.name, existing);
  }

  // Separate into funnel, supplementary ecommerce, and custom
  const funnelEventNames = new Set(FUNNEL_EVENTS.map((f) => f.name));
  const customEvents = [...byName.entries()].filter(
    ([name]) => !KNOWN_NON_ECOMMERCE.has(name),
  );

  // GA4 property IDs
  const tids = [...new Set(events.map((e) => e.tid).filter(Boolean))];

  return (
    <div className="mb-8">
      <h2 className="font-display text-xl font-semibold mb-4">Ecommerce Events</h2>

      {/* GA4 Properties */}
      <div className="mb-4 flex items-center gap-2 text-sm text-text-muted">
        <span>GA4 Properties:</span>
        {tids.map((tid) => (
          <span key={tid} className="px-2 py-0.5 bg-bg-subtle border border-border rounded text-xs font-mono">
            {tid}
          </span>
        ))}
      </div>

      {/* Funnel checklist */}
      <div className="glass rounded-lg p-5 mb-4">
        <h3 className="text-sm font-medium text-text-muted mb-3 uppercase tracking-wide">Funnel Event Checklist</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {FUNNEL_EVENTS.map((funnelEvent) => {
            const captured = byName.get(funnelEvent.name);
            const found = captured && captured.length > 0;
            const itemCount = captured?.reduce((sum, e) => sum + (e.items?.length ?? 0), 0) ?? 0;
            return (
              <div
                key={funnelEvent.name}
                className={`flex items-center gap-2 p-2 rounded-md ${found ? "bg-success/5 border border-success/20" : "bg-bg-subtle border border-border-subtle"}`}
              >
                <span className={found ? "text-success" : "text-text-faint"}>
                  {found ? "✓" : "✗"}
                </span>
                <div>
                  <div className={`text-xs font-medium ${found ? "text-text" : "text-text-faint"}`}>
                    {funnelEvent.name}
                  </div>
                  {found && (
                    <div className="text-[10px] text-text-muted">
                      {captured!.length}x · {itemCount} items
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* All captured events summary */}
      <div className="glass rounded-lg p-5 mb-4">
        <h3 className="text-sm font-medium text-text-muted mb-3 uppercase tracking-wide">
          All Captured Events ({events.length} total)
        </h3>
        <div className="space-y-1">
          {[...byName.entries()]
            .sort(([, a], [, b]) => b.length - a.length)
            .map(([name, evts]) => {
              const isFunnel = funnelEventNames.has(name);
              const isCustom = !KNOWN_NON_ECOMMERCE.has(name);
              return (
                <div key={name} className="flex items-center justify-between py-1.5 border-b border-border-subtle last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-sm ${isFunnel ? "text-accent" : isCustom ? "text-warning" : "text-text-muted"}`}>
                      {name}
                    </span>
                    {isFunnel && <span className="text-[10px] px-1.5 py-0.5 bg-accent/10 text-accent rounded">funnel</span>}
                    {isCustom && <span className="text-[10px] px-1.5 py-0.5 bg-warning/10 text-warning rounded">custom</span>}
                  </div>
                  <span className="text-xs text-text-faint">{evts.length}x</span>
                </div>
              );
            })}
        </div>
      </div>

      {/* Custom events warning */}
      {customEvents.length > 0 && (
        <div className="glass rounded-lg p-5 border-l-2 border-l-warning">
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <span className="text-warning">⚠</span>
            Non-standard Events Detected
          </h3>
          <p className="text-xs text-text-muted mb-3">
            These events don't match GA4's recommended ecommerce event names. They won't populate standard ecommerce reports.
          </p>
          <div className="flex flex-wrap gap-2">
            {customEvents.map(([name, evts]) => (
              <span key={name} className="text-xs px-2 py-1 bg-warning/10 border border-warning/20 text-warning rounded-md font-mono">
                {name} ({evts.length}x)
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FunnelLogSection({ steps }: { steps: FunnelStepLogData[] }) {
  return (
    <div className="mb-8">
      <h2 className="font-display text-xl font-semibold mb-4">Funnel Walk Log</h2>
      <div className="glass rounded-lg overflow-hidden">
        <div className="divide-y divide-border-subtle">
          {steps.map((step) => (
            <div key={step.step} className="px-5 py-3">
              <div className="flex items-center gap-3 mb-1.5">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step.success ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
                  {step.success ? "✓" : "✗"}
                </span>
                <span className="text-sm font-medium capitalize">{step.name.replace(/_/g, " ")}</span>
                <span className="text-[10px] text-text-faint font-mono">{step.durationMs}ms</span>
                {step.eventsCaptureDuringStep > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-accent/10 text-accent rounded">
                    {step.eventsCaptureDuringStep} events
                  </span>
                )}
              </div>
              <div className="ml-8 space-y-1">
                <p className="text-xs text-text-muted">{step.instruction}</p>
                <div className="flex items-center gap-2 text-[10px] font-mono">
                  <span className="text-text-faint truncate max-w-xs" title={step.urlBefore}>
                    {shortenUrl(step.urlBefore)}
                  </span>
                  {step.urlBefore !== step.urlAfter && (
                    <>
                      <span className="text-text-faint">→</span>
                      <span className="text-accent truncate max-w-xs" title={step.urlAfter}>
                        {shortenUrl(step.urlAfter)}
                      </span>
                    </>
                  )}
                </div>
                {step.error && (
                  <p className="text-[10px] text-danger mt-1">{step.error}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function shortenUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search.slice(0, 30);
  } catch {
    return url.slice(0, 60);
  }
}

function AdPixelsSection({ platforms }: { platforms: DetectedPlatformData[] }) {
  const adPlatforms = platforms.filter((p) => p.category === "pixel" || p.category === "ads");
  if (adPlatforms.length === 0) return null;

  // Known standard events per platform for reference
  const standardEvents: Record<string, string[]> = {
    "Meta Pixel": ["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "AddPaymentInfo", "Purchase", "Lead", "CompleteRegistration", "Search"],
    "TikTok Pixel": ["ViewContent", "AddToCart", "PlaceAnOrder", "CompletePayment", "ClickButton", "SubmitForm", "Download"],
    "Snapchat Pixel": ["PAGE_VIEW", "VIEW_CONTENT", "ADD_CART", "START_CHECKOUT", "PURCHASE", "SIGN_UP"],
    "Pinterest Tag": ["pagevisit", "viewcategory", "addtocart", "checkout", "lead", "signup"],
    "Google Ads": ["conversion", "remarketing", "view_through_conversion"],
    "Twitter/X Pixel": ["PageView", "Purchase", "Download", "SignUp", "AddToCart"],
    "LinkedIn Insight": ["conversion"],
    "Microsoft/Bing Ads": ["pageLoad", "conversion"],
  };

  return (
    <div className="mb-8">
      <h2 className="font-display text-xl font-semibold mb-4">Ad Pixels & Conversion Tracking</h2>
      <div className="space-y-3">
        {adPlatforms.map((platform) => {
          const expected = standardEvents[platform.name] ?? [];
          const detected = platform.detectedEvents;
          const missing = expected.filter((e) => !detected.includes(e));

          return (
            <div key={platform.name} className="glass rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${platform.requestCount > 0 ? "bg-success" : "bg-danger"}`} />
                  <h3 className="text-sm font-semibold">{platform.name}</h3>
                  <span className="text-[10px] px-2 py-0.5 bg-success/10 text-success border border-success/20 rounded-full">
                    Active — {platform.requestCount} requests
                  </span>
                </div>
              </div>

              {/* Detected events */}
              {detected.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs text-text-muted mb-1.5">Events Detected</div>
                  <div className="flex flex-wrap gap-1.5">
                    {detected.map((event) => (
                      <span key={event} className="text-xs px-2 py-0.5 bg-success/10 text-success border border-success/20 rounded font-mono">
                        {event}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing standard events */}
              {missing.length > 0 && detected.length > 0 && (
                <div>
                  <div className="text-xs text-text-muted mb-1.5">Standard Events Not Detected</div>
                  <div className="flex flex-wrap gap-1.5">
                    {missing.map((event) => (
                      <span key={event} className="text-xs px-2 py-0.5 bg-bg-subtle text-text-faint border border-border-subtle rounded font-mono">
                        {event}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* No events detected at all */}
              {detected.length === 0 && (
                <div className="text-xs text-text-faint">
                  Pixel is loading but no specific events were captured during the audit. Events may fire on interaction or be sent server-side.
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Platforms NOT detected */}
      {(() => {
        const majorPixels = ["Meta Pixel", "Google Ads", "TikTok Pixel", "Snapchat Pixel", "Pinterest Tag"];
        const detectedNames = new Set(adPlatforms.map((p) => p.name));
        const notDetected = majorPixels.filter((p) => !detectedNames.has(p));
        if (notDetected.length === 0) return null;
        return (
          <div className="mt-3 glass rounded-lg p-4">
            <div className="text-xs text-text-muted mb-2">Not Detected</div>
            <div className="flex flex-wrap gap-2">
              {notDetected.map((name) => (
                <span key={name} className="text-xs px-2 py-1 bg-bg-subtle text-text-faint border border-border-subtle rounded">
                  {name}
                </span>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function AiAnalysisSection({
  aiAnalysis,
  detectedPlatforms,
  onReanalyze,
  analyzing,
}: {
  aiAnalysis: AiAnalysisData | null;
  detectedPlatforms: DetectedPlatformData[] | null;
  onReanalyze?: () => void;
  analyzing?: boolean;
}) {
  const categoryIcons: Record<string, { icon: string; color: string }> = {
    observation: { icon: "🔍", color: "text-info" },
    issue: { icon: "⚠", color: "text-warning" },
    recommendation: { icon: "💡", color: "text-accent" },
  };

  const categoryColors: Record<string, string> = {
    cdp: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    analytics: "bg-info/10 text-info border-info/20",
    ads: "bg-warning/10 text-warning border-warning/20",
    pixel: "bg-danger/10 text-danger border-danger/20",
    tag_manager: "bg-success/10 text-success border-success/20",
  };

  return (
    <div className="mb-8 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">Tracking Intelligence</h2>
        {onReanalyze && (
          <button
            onClick={onReanalyze}
            disabled={analyzing}
            className="text-xs px-3 py-1.5 bg-bg-elevated border border-border hover:border-accent/50 rounded-md transition-colors cursor-pointer disabled:opacity-50"
          >
            {analyzing ? "Analyzing..." : "Re-run Analysis"}
          </button>
        )}
      </div>

      {/* AI Summary */}
      {aiAnalysis && (
        <div className="glass rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-accent">✦</span>
            <h3 className="text-sm font-medium uppercase tracking-wide text-text-muted">AI Analysis</h3>
            {!aiAnalysis.ga4Present && (
              <span className="text-[10px] px-2 py-0.5 bg-danger/10 text-danger border border-danger/20 rounded-full">No GA4 detected</span>
            )}
          </div>
          <p className="text-sm text-text leading-relaxed mb-4">{aiAnalysis.summary}</p>

          {/* Insights */}
          {aiAnalysis.insights.length > 0 && (
            <div className="space-y-2">
              {aiAnalysis.insights.map((insight, i) => {
                const style = categoryIcons[insight.category] ?? categoryIcons.observation!;
                return (
                  <div key={i} className="flex items-start gap-2.5 py-2 border-b border-border-subtle last:border-0">
                    <span className={`mt-0.5 ${style.color}`}>{style.icon}</span>
                    <div>
                      <span className={`text-[10px] font-medium uppercase tracking-wide ${style.color}`}>
                        {insight.category}
                      </span>
                      <p className="text-sm text-text-muted mt-0.5">{insight.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {aiAnalysis.tokensUsed > 0 && (
            <div className="flex items-center justify-end gap-3 mt-3 text-[10px] text-text-faint">
              <span>{aiAnalysis.inputTokens?.toLocaleString() ?? "?"} in / {aiAnalysis.outputTokens?.toLocaleString() ?? "?"} out tokens</span>
              {aiAnalysis.estimatedCostUsd !== undefined && aiAnalysis.estimatedCostUsd > 0 && (
                <span className="px-1.5 py-0.5 bg-bg-subtle rounded">
                  ${aiAnalysis.estimatedCostUsd.toFixed(4)}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Detected Platforms */}
      {detectedPlatforms && detectedPlatforms.length > 0 && (
        <div className="glass rounded-lg p-5">
          <h3 className="text-sm font-medium uppercase tracking-wide text-text-muted mb-3">
            Detected Tracking Platforms ({detectedPlatforms.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {detectedPlatforms.map((platform) => (
              <div
                key={platform.name}
                className={`flex items-center justify-between p-3 rounded-md border ${categoryColors[platform.category] ?? "bg-bg-subtle text-text-muted border-border"}`}
              >
                <div>
                  <div className="text-sm font-medium">{platform.name}</div>
                  <div className="text-[10px] opacity-70 capitalize">{platform.category.replace("_", " ")}</div>
                  {platform.detectedEvents.length > 0 && (
                    <div className="text-[10px] opacity-60 mt-0.5">
                      Events: {platform.detectedEvents.slice(0, 4).join(", ")}
                      {platform.detectedEvents.length > 4 && "..."}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">{platform.requestCount}</div>
                  <div className="text-[10px] opacity-60">requests</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function gradeColor(grade: string | null): string {
  if (grade === "pass") return "text-success";
  if (grade === "evaluate") return "text-warning";
  return "text-danger";
}
