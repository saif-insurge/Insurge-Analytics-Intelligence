import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";
import { resolveBranding } from "@/lib/report-defaults";
import { AuditTocSidebar } from "@/components/audit-toc-sidebar";
import {
  CategoryScores,
  EcommerceEventsSection,
  FunnelLogSection,
  AdPixelsSection,
  AiAnalysisSection,
  FindingCard,
  CATEGORY_LABELS,
  type Finding,
  type CapturedEvent,
  type AiAnalysisData,
  type DetectedPlatformData,
  type FunnelStepLogData,
} from "@/components/audit-sections";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const audit = await prisma.audit.findUnique({
    where: { id },
    select: {
      domain: true,
      overallScore: true,
      organization: { select: { reportCompanyName: true, reportTagline: true } },
    },
  });
  if (!audit) return { title: "Report Not Found" };
  const branding = resolveBranding(audit.organization);
  return {
    title: `${branding.companyName} — ${audit.domain} Tracking Audit (${audit.overallScore}/100)`,
    description: `${branding.tagline} for ${audit.domain}. Score: ${audit.overallScore}/100.`,
    openGraph: {
      title: `${branding.companyName} — ${audit.domain} Tracking Audit`,
      description: `Score: ${audit.overallScore}/100. ${branding.tagline}.`,
    },
  };
}

export default async function ReportPage({ params }: Props) {
  const { id } = await params;
  const audit = await prisma.audit.findUnique({
    where: { id },
    include: {
      findings: { orderBy: { severity: "asc" } },
      organization: {
        select: {
          reportCompanyName: true,
          reportTagline: true,
          reportCtaHeadline: true,
          reportCtaBody: true,
          reportCtaLabel: true,
          reportCtaUrl: true,
          reportFooterNote: true,
        },
      },
    },
  });

  if (!audit || audit.status !== "COMPLETE") {
    notFound();
  }

  const branding = resolveBranding(audit.organization);
  const findings = audit.findings as unknown as Finding[];
  const events = (audit.events as unknown as CapturedEvent[] | null) ?? [];
  const aiAnalysis = audit.aiAnalysis as unknown as AiAnalysisData | null;
  const detectedPlatforms = audit.detectedPlatforms as unknown as DetectedPlatformData[] | null;
  const funnelLog = audit.funnelLog as unknown as FunnelStepLogData[] | null;

  // Build TOC sections (only those that actually render).
  const tocSections = [
    { id: "overview", label: "Overview" },
    ...(funnelLog && funnelLog.length > 0 ? [{ id: "funnel-walk", label: "Funnel Walk" }] : []),
    ...(aiAnalysis ? [{ id: "ai-analysis", label: "Analysis" }] : []),
    ...(detectedPlatforms ? [{ id: "ad-pixels", label: "Ad Pixels" }] : []),
    ...(events.length > 0 ? [{ id: "events", label: "Ecommerce Events" }] : []),
    ...(findings.length > 0 ? [{ id: "findings", label: "Findings" }] : []),
    { id: "next-steps", label: "Next Steps" },
  ];

  return (
    <>
      <TrackingPixels auditId={id} domain={audit.domain} />

      {/* Report header — distinct from internal /audits/:id, marketing-friendly */}
      <header className="relative border-b border-border-subtle bg-gradient-to-b from-accent/[0.04] via-bg to-bg overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="content-container py-6 sm:py-10 md:py-14 relative">
          {/* Top strip: logo + powered-by + CTA */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6 sm:mb-10">
            <Image
              src="/logo.png"
              alt={branding.companyName}
              width={96}
              height={96}
              className="rounded-sm"
              priority
            />
            <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
              {branding.companyName !== "Insurge" && (
                <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-text-faint">
                  Powered by Insurge
                </div>
              )}
              {branding.ctaUrl && branding.ctaLabel && (
                <a
                  href={branding.ctaUrl}
                  className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-accent-ink px-4 py-2 rounded-sm text-sm font-semibold tracking-tight transition-all hover:translate-y-[-1px] hover:shadow-[0_8px_24px_-8px_rgba(212,255,58,0.5)]"
                >
                  {branding.ctaLabel}
                  <span className="font-mono text-xs">→</span>
                </a>
              )}
            </div>
          </div>

          {/* Hero */}
          <div className="flex flex-col md:grid md:grid-cols-[1fr_auto] gap-6 md:gap-8 md:items-end">
            <div className="min-w-0">
              <div className="font-mono text-[11px] tracking-[0.22em] uppercase text-text-faint mb-3">
                {branding.tagline}
              </div>
              <h1 className="font-display text-[2rem] sm:text-[2.5rem] md:text-[3.75rem] leading-[0.95] font-semibold tracking-[-0.03em] break-words">
                {audit.domain}
                <span className="text-accent">.</span>
              </h1>
              <p className="text-sm text-text-muted mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>Audited {new Date(audit.completedAt!).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</span>
                {audit.platform && (
                  <span className="font-mono text-text-faint">
                    · platform <span className="text-text-muted capitalize">{audit.platform}</span>
                  </span>
                )}
              </p>
            </div>

            {/* Score card */}
            {audit.overallScore !== null && (
              <div className="w-full md:w-auto md:min-w-[200px] relative overflow-hidden border border-border bg-gradient-to-br from-bg-elevated/80 to-bg-elevated/40 backdrop-blur rounded-lg p-5 md:p-6 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.4)]">
                <div
                  aria-hidden
                  className={`absolute inset-x-0 top-0 h-0.5 ${
                    audit.overallGrade === "pass"
                      ? "bg-success"
                      : audit.overallGrade === "evaluate"
                      ? "bg-warning"
                      : "bg-danger"
                  }`}
                />
                <div className="flex items-center justify-between md:flex-col md:items-end gap-4 md:gap-3">
                  <div className="md:text-right">
                    <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-text-faint">
                      Overall Score
                    </div>
                    <div className="mt-2 flex items-baseline gap-1.5 md:justify-end">
                      <span className={`font-display tnum text-[3.5rem] md:text-[4.25rem] leading-none font-semibold tracking-tight ${gradeColor(audit.overallGrade)}`}>
                        {audit.overallScore}
                      </span>
                      <span className="font-mono text-xs text-text-faint tracking-wider">/100</span>
                    </div>
                  </div>
                  <span className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${gradeBadge(audit.overallGrade)}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      audit.overallGrade === "pass"
                        ? "bg-success"
                        : audit.overallGrade === "evaluate"
                        ? "bg-warning"
                        : "bg-danger"
                    }`} />
                    {audit.overallGrade === "pass" ? "Healthy" : audit.overallGrade === "evaluate" ? "Needs Work" : "Critical Issues"}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="content-container py-6 sm:py-10">
        <div className="lg:grid lg:grid-cols-[180px_1fr] lg:gap-10">
          <AuditTocSidebar sections={tocSections} />
          <div className="min-w-0 [&_section]:scroll-mt-8">
            {/* Overview */}
            <section id="overview">
              <CategoryScores findings={findings} />

              {/* Download PDF CTA — keep as marketing asset */}
              <div className="mb-10">
                <a
                  href={`/api/audits/${audit.id}/pdf`}
                  className="text-sm font-medium px-4 py-2 bg-accent hover:bg-accent-hover text-accent-ink rounded-sm transition-all hover:translate-y-[-1px] hover:shadow-[0_8px_24px_-8px_rgba(212,255,58,0.5)] inline-flex items-center gap-2"
                >
                  <span className="font-mono text-xs">↓</span>
                  Download PDF report
                </a>
              </div>
            </section>

            {/* Funnel Walk */}
            {funnelLog && funnelLog.length > 0 && (
              <section id="funnel-walk">
                <FunnelLogSection steps={funnelLog} />
              </section>
            )}

            {/* AI Analysis (read-only — no re-run) */}
            {aiAnalysis && (
              <section id="ai-analysis">
                <AiAnalysisSection
                  aiAnalysis={aiAnalysis}
                  detectedPlatforms={detectedPlatforms}
                  heading="Analysis"
                />
              </section>
            )}

            {/* Ad Pixels */}
            {detectedPlatforms && (
              <section id="ad-pixels">
                <AdPixelsSection platforms={detectedPlatforms} />
              </section>
            )}

            {/* Ecommerce Events */}
            {events.length > 0 && (
              <section id="events">
                <EcommerceEventsSection events={events} />
              </section>
            )}

            {/* Findings */}
            {findings.length > 0 && (
              <section id="findings">
                <h2 className="font-display text-xl font-semibold mb-4">
                  Findings ({findings.length})
                </h2>

                {Object.entries(CATEGORY_LABELS).map(([key, { label }]) => {
                  const catFindings = findings.filter((f) => f.category === key);
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

            {/* Distinct CTA footer — configurable per org */}
            <section
              id="next-steps"
              className="mt-12 relative overflow-hidden rounded-xl border border-accent/30 bg-gradient-to-br from-accent/[0.08] via-bg-elevated to-bg-elevated p-5 sm:p-8 md:p-12"
            >
              <div
                aria-hidden
                className="absolute inset-0 opacity-[0.05] pointer-events-none"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
                  backgroundSize: "20px 20px",
                }}
              />
              <div className="relative">
                <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-accent mb-3">
                  Next steps
                </div>
                <h2 className="font-display text-xl sm:text-2xl md:text-3xl font-semibold tracking-tight mb-3">
                  {branding.ctaHeadline}
                </h2>
                <p className="text-text-muted text-sm md:text-base leading-relaxed mb-6 max-w-xl whitespace-pre-line">
                  {branding.ctaBody}
                </p>
                <a
                  href={branding.ctaUrl}
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-accent-ink px-6 py-3 rounded-sm font-medium transition-all hover:translate-y-[-1px] hover:shadow-[0_12px_32px_-8px_rgba(212,255,58,0.6)]"
                >
                  {branding.ctaLabel}
                  <span className="font-mono text-xs">→</span>
                </a>
                <p className="text-xs text-text-faint mt-4">{branding.footerNote}</p>
              </div>
            </section>

            {/* Footer */}
            <footer className="mt-12 pt-6 border-t border-border-subtle text-center text-xs text-text-faint">
              Generated by {branding.companyName} · {new Date(audit.completedAt!).toLocaleDateString()}
            </footer>
          </div>
        </div>
      </main>
    </>
  );
}

function TrackingPixels({ auditId, domain }: { auditId: string; domain: string }) {
  const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const gtagId = process.env.NEXT_PUBLIC_GTAG_ID;

  return (
    <>
      {metaPixelId && (
        <script
          dangerouslySetInnerHTML={{
            __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${metaPixelId}');fbq('track','PageView');fbq('trackCustom','ViewAuditReport',{audit_id:'${auditId}',domain:'${domain}'});`,
          }}
        />
      )}
      {gtagId && (
        <>
          <script async src={`https://www.googletagmanager.com/gtag/js?id=${gtagId}`} />
          <script
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gtagId}');gtag('event','view_audit_report',{audit_id:'${auditId}',domain:'${domain}'});`,
            }}
          />
        </>
      )}
    </>
  );
}

function gradeColor(grade: string | null): string {
  if (grade === "pass") return "text-success";
  if (grade === "evaluate") return "text-warning";
  return "text-danger";
}

function gradeBadge(grade: string | null): string {
  if (grade === "pass") return "bg-success/10 text-success border-success/30";
  if (grade === "evaluate") return "bg-warning/10 text-warning border-warning/30";
  return "bg-danger/10 text-danger border-danger/30";
}
