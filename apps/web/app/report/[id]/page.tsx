import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const audit = await prisma.audit.findUnique({
    where: { id },
    select: { domain: true, overallScore: true },
  });
  if (!audit) return { title: "Report Not Found" };
  return {
    title: `Insurge — ${audit.domain} Tracking Audit (${audit.overallScore}/100)`,
    description: `GA4 ecommerce tracking audit for ${audit.domain}. Score: ${audit.overallScore}/100. View findings and recommendations.`,
    openGraph: {
      title: `Insurge — ${audit.domain} Tracking Audit`,
      description: `Score: ${audit.overallScore}/100. Automated GA4 ecommerce tracking analysis with platform-specific recommendations.`,
    },
  };
}

export default async function ReportPage({ params }: Props) {
  const { id } = await params;
  const audit = await prisma.audit.findUnique({
    where: { id },
    include: { findings: { orderBy: { severity: "asc" } } },
  });

  if (!audit || audit.status !== "COMPLETE") {
    notFound();
  }

  const findings = audit.findings;
  const failFindings = findings.filter((f) => f.status === "fail");
  const evalFindings = findings.filter((f) => f.status === "evaluate");
  const passFindings = findings.filter((f) => f.status === "pass");

  return (
    <>
      <TrackingPixels auditId={id} domain={audit.domain} />

      <main className="content-container py-12">
        {/* Report header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 bg-accent-subtle border border-accent/20 rounded-full">
            <img src="/logo.png" alt="Insurge" width={16} height={16} />
            <span className="text-xs font-medium text-accent-hover">Insurge — GA4 Ecommerce Tracking Audit</span>
          </div>
          <h1 className="font-display text-3xl font-bold mb-2">{audit.domain}</h1>
          <p className="text-sm text-text-muted">
            Audited {new Date(audit.completedAt!).toLocaleDateString()} · Platform: {audit.platform ?? "custom"}
          </p>

          {/* Score */}
          <div className="mt-8 inline-flex flex-col items-center">
            <div className={`text-6xl font-display font-bold ${gradeColor(audit.overallGrade)}`}>
              {audit.overallScore}
            </div>
            <div className="text-sm text-text-muted mt-1">out of 100</div>
            <div className={`mt-2 px-3 py-1 rounded-full text-xs font-medium ${gradeBadge(audit.overallGrade)}`}>
              {audit.overallGrade === "pass" ? "Good" : audit.overallGrade === "evaluate" ? "Needs Work" : "Critical Issues"}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-12">
          <div className="glass rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-danger">{failFindings.length}</div>
            <div className="text-xs text-text-muted mt-1">Issues Found</div>
          </div>
          <div className="glass rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-warning">{evalFindings.length}</div>
            <div className="text-xs text-text-muted mt-1">To Review</div>
          </div>
          <div className="glass rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-success">{passFindings.length}</div>
            <div className="text-xs text-text-muted mt-1">Passing</div>
          </div>
        </div>

        {/* Failing issues */}
        {failFindings.length > 0 && (
          <section className="mb-10">
            <h2 className="font-display text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-danger" />
              Issues Requiring Attention
            </h2>
            <div className="space-y-3">
              {failFindings.map((f) => (
                <div key={f.id} className="border border-danger/20 bg-danger/5 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold">{f.title}</h3>
                    <span className="shrink-0 text-[10px] font-semibold text-danger uppercase">{f.severity}</span>
                  </div>
                  <p className="text-sm text-text-muted mt-2">{f.summary}</p>
                  {f.impact && <p className="text-xs text-text-faint mt-2">{f.impact}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Items to review */}
        {evalFindings.length > 0 && (
          <section className="mb-10">
            <h2 className="font-display text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-warning" />
              Items to Review
            </h2>
            <div className="space-y-3">
              {evalFindings.map((f) => (
                <div key={f.id} className="border border-warning/20 bg-warning/5 rounded-lg p-4">
                  <h3 className="text-sm font-semibold">{f.title}</h3>
                  <p className="text-sm text-text-muted mt-1">{f.summary}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Passing */}
        {passFindings.length > 0 && (
          <section className="mb-10">
            <h2 className="font-display text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-success" />
              Passing ({passFindings.length})
            </h2>
            <div className="space-y-1">
              {passFindings.map((f) => (
                <div key={f.id} className="flex items-center gap-2 text-sm text-text-muted py-1">
                  <span className="text-success">✓</span>
                  {f.title}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="mt-16 glass rounded-xl p-8 text-center">
          <h2 className="font-display text-xl font-bold mb-2">Ready to fix these issues?</h2>
          <p className="text-text-muted text-sm mb-6">
            We provide professional GA4 ecommerce implementation services.
            Get all identified issues fixed with platform-specific solutions.
          </p>
          <a
            href="mailto:saif@insurge.co"
            className="inline-block bg-accent hover:bg-accent-hover text-white px-6 py-3 rounded-lg font-medium transition-colors glow-accent"
          >
            Get a Quote
          </a>
          <p className="text-xs text-text-faint mt-3">Typical project: $500–$1,500 depending on complexity</p>
        </section>

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-border-subtle text-center text-xs text-text-faint">
          Generated by Insurge · {new Date(audit.completedAt!).toLocaleDateString()}
        </footer>
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
  if (grade === "pass") return "bg-success/10 text-success";
  if (grade === "evaluate") return "bg-warning/10 text-warning";
  return "bg-danger/10 text-danger";
}
