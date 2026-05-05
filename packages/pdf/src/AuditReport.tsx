import React from "react";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { AuditDocument } from "@ga4-audit/audit-core";
import { s, colors, gradeColor, severityColor } from "./styles";

export function AuditReport({ audit }: { audit: AuditDocument }) {
  const site = audit.audit.site;
  const scorecard = audit.scorecard;
  const failFindings = audit.findings.filter((f) => f.status === "fail");
  const evalFindings = audit.findings.filter((f) => f.status === "evaluate");
  const passFindings = audit.findings.filter((f) => f.status === "pass");

  return (
    <Document>
      <CoverPage audit={audit} />
      <ScorecardPage scorecard={scorecard} />
      <EventsPage events={audit.capturedEvents} />
      <FindingsPages findings={audit.findings} platform={site.platform.detected} />
      <FixPlanPage
        findings={failFindings}
        platform={site.platform.detected}
      />
      <NextStepsPage domain={site.domain} />
    </Document>
  );
}

// ─── Cover Page ─────────────────────────────────────────────────────

function CoverPage({ audit }: { audit: AuditDocument }) {
  const site = audit.audit.site;
  const score = audit.scorecard.overall;

  return (
    <Page size="A4" style={s.coverPage}>
      <Text style={s.coverBadge}>GA4 Ecommerce Tracking Audit</Text>
      <Text style={s.coverTitle}>{site.domain}</Text>
      <Text style={s.coverSubtitle}>{site.url}</Text>

      <View style={s.mb24}>
        <Text style={[s.coverScore, { color: gradeColor(score.grade) }]}>
          {score.score}
        </Text>
        <Text style={s.coverScoreLabel}>out of 100</Text>
      </View>

      <View style={s.coverMeta}>
        <Text>Platform: {site.platform.detected} ({site.platform.confidence} confidence)</Text>
        <Text>Tag Manager: {site.stack.tagManager}</Text>
        <Text>GA4 Properties: {site.stack.ga4Properties.join(", ") || "None detected"}</Text>
        <Text>Audit Date: {new Date(audit.audit.completedAt).toLocaleDateString()}</Text>
      </View>

      <PageFooter pageLabel="Cover" />
    </Page>
  );
}

// ─── Scorecard Page ─────────────────────────────────────────────────

function ScorecardPage({ scorecard }: { scorecard: AuditDocument["scorecard"] }) {
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.sectionTitle}>Scorecard</Text>

      {/* Overall */}
      <View style={[s.row, s.spaceBetween, s.mb16]}>
        <View>
          <Text style={{ fontSize: 42, fontWeight: 700, color: gradeColor(scorecard.overall.grade) }}>
            {scorecard.overall.score}
          </Text>
          <Text style={{ fontSize: 10, color: colors.textMuted }}>Overall Score</Text>
        </View>
        <View style={{ alignItems: "flex-end" as const }}>
          <Text style={{ fontSize: 14, fontWeight: 600, color: gradeColor(scorecard.overall.grade) }}>
            {scorecard.overall.grade.toUpperCase()}
          </Text>
          <Text style={{ fontSize: 8, color: colors.textFaint }}>
            {scorecard.overall.grade === "pass" ? "80+ required" : scorecard.overall.grade === "evaluate" ? "50-79 range" : "Below 50"}
          </Text>
        </View>
      </View>

      {/* Category breakdown */}
      <View style={s.scoreGrid}>
        {scorecard.categories.map((cat) => (
          <View key={cat.name} style={s.scoreCard}>
            <Text style={[s.scoreValue, { color: gradeColor(cat.grade) }]}>
              {cat.score}
            </Text>
            <Text style={s.scoreMax}>/{cat.maxScore}</Text>
            <Text style={[s.scoreLabel, s.mb4]}>{cat.label}</Text>
            <Text style={{ fontSize: 7, color: gradeColor(cat.grade) }}>
              {cat.grade.toUpperCase()}
            </Text>
          </View>
        ))}
      </View>

      {/* Category summaries */}
      {scorecard.categories.map((cat) => (
        <View key={cat.name} style={[s.card, s.mb4]}>
          <View style={[s.row, s.spaceBetween, s.mb4]}>
            <Text style={{ fontSize: 10, fontWeight: 600 }}>{cat.label}</Text>
            <Text style={{ fontSize: 9, color: gradeColor(cat.grade) }}>
              {cat.score}/{cat.maxScore}
            </Text>
          </View>
          <Text style={{ fontSize: 8, color: colors.textMuted }}>{cat.summary}</Text>
        </View>
      ))}

      <PageFooter pageLabel="Scorecard" />
    </Page>
  );
}

// ─── Events Page ────────────────────────────────────────────────────

function EventsPage({ events }: { events: AuditDocument["capturedEvents"] }) {
  const funnelEvents = [
    "view_item_list", "select_item", "view_item",
    "add_to_cart", "view_cart", "begin_checkout",
    "add_shipping_info", "add_payment_info",
  ];

  const byName = new Map<string, number>();
  for (const e of events) {
    if (!e.name) continue;
    byName.set(e.name, (byName.get(e.name) ?? 0) + 1);
  }

  const tids = [...new Set(events.map((e) => e.tid).filter(Boolean))];

  return (
    <Page size="A4" style={s.page}>
      <Text style={s.sectionTitle}>Captured Events</Text>

      <Text style={[s.findingSummary, s.mb16]}>
        Total events captured: {events.length} · GA4 Properties: {tids.join(", ")}
      </Text>

      <Text style={[s.sectionSubtitle]}>Ecommerce Funnel Checklist</Text>
      {funnelEvents.map((name) => {
        const count = byName.get(name) ?? 0;
        return (
          <View key={name} style={s.eventRow}>
            <Text style={{ fontSize: 10, color: count > 0 ? colors.success : colors.danger, marginRight: 8 }}>
              {count > 0 ? "✓" : "✗"}
            </Text>
            <Text style={[s.eventName, { color: count > 0 ? colors.text : colors.textFaint }]}>
              {name}
            </Text>
            <Text style={s.eventCount}>{count > 0 ? `${count}x` : "missing"}</Text>
          </View>
        );
      })}

      <View style={{ marginTop: 20 }}>
        <Text style={[s.sectionSubtitle]}>All Events by Frequency</Text>
        {[...byName.entries()]
          .sort(([, a], [, b]) => b - a)
          .map(([name, count]) => {
            const isFunnel = funnelEvents.includes(name);
            return (
              <View key={name} style={s.eventRow}>
                <Text style={[s.eventName, { color: isFunnel ? colors.accent : colors.text }]}>
                  {name}
                </Text>
                <Text style={s.eventCount}>{count}x</Text>
              </View>
            );
          })}
      </View>

      <PageFooter pageLabel="Events" />
    </Page>
  );
}

// ─── Findings Pages ─────────────────────────────────────────────────

function FindingsPages({ findings, platform }: { findings: AuditDocument["findings"]; platform: string }) {
  const categories = [
    { key: "implementation_coverage", label: "Implementation Coverage" },
    { key: "data_quality", label: "Data Quality" },
    { key: "platform_infrastructure", label: "Platform & Infrastructure" },
    { key: "feature_adoption", label: "Feature Adoption" },
  ];

  return (
    <>
      {categories.map((cat) => {
        const catFindings = findings.filter((f) => f.category === cat.key);
        if (catFindings.length === 0) return null;

        return (
          <Page key={cat.key} size="A4" style={s.page}>
            <Text style={s.sectionTitle}>{cat.label}</Text>

            {catFindings.map((finding) => {
              const borderStyle = finding.status === "pass" ? s.cardPass : finding.status === "evaluate" ? s.cardEval : s.cardFail;
              return (
                <View key={finding.id} style={[s.card, borderStyle]} wrap={false}>
                  <View style={[s.row, s.spaceBetween, s.mb4]}>
                    <View style={s.row}>
                      <Text style={[s.severityBadge, { color: severityColor(finding.severity), backgroundColor: colors.bgSubtle }]}>
                        {finding.severity}
                      </Text>
                      <Text style={[s.findingTitle, { marginLeft: 6 }]}>{finding.title}</Text>
                    </View>
                    <Text style={[s.statusBadge, {
                      color: finding.status === "pass" ? colors.success : finding.status === "evaluate" ? colors.warning : colors.danger,
                    }]}>
                      {finding.status}
                    </Text>
                  </View>

                  <Text style={s.findingSummary}>{finding.summary}</Text>

                  {finding.impact && (
                    <Text style={s.findingImpact}>{finding.impact}</Text>
                  )}

                  {finding.fix?.platformSpecific?.[platform as keyof typeof finding.fix.platformSpecific] && (
                    <View style={s.findingFix}>
                      <Text style={{ fontSize: 7, color: colors.accent, marginBottom: 2, fontWeight: 600 }}>
                        Fix for {platform}:
                      </Text>
                      <Text style={{ fontSize: 8, color: colors.textMuted }}>
                        {finding.fix.platformSpecific[platform as keyof typeof finding.fix.platformSpecific]}
                      </Text>
                      {finding.fix.estimatedEffort && (
                        <Text style={{ fontSize: 7, color: colors.textFaint, marginTop: 2 }}>
                          Est. effort: {finding.fix.estimatedEffort}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              );
            })}

            <PageFooter pageLabel={cat.label} />
          </Page>
        );
      })}
    </>
  );
}

// ─── Fix Plan Page ──────────────────────────────────────────────────

function FixPlanPage({ findings, platform }: { findings: AuditDocument["findings"]; platform: string }) {
  const critical = findings.filter((f) => f.severity === "critical" || f.severity === "high");
  const medium = findings.filter((f) => f.severity === "medium");
  const low = findings.filter((f) => f.severity === "low" || f.severity === "info");

  if (findings.length === 0) return null;

  return (
    <Page size="A4" style={s.page}>
      <Text style={s.sectionTitle}>Recommended Fix Plan</Text>
      <Text style={[s.findingSummary, s.mb16]}>
        Prioritized action items based on severity and impact for {platform} platform.
      </Text>

      {critical.length > 0 && (
        <View style={s.mb16}>
          <Text style={[s.sectionSubtitle, { color: colors.danger }]}>
            Immediate (Critical/High)
          </Text>
          {critical.map((f, i) => (
            <View key={f.id} style={[s.card, s.cardFail]}>
              <Text style={s.findingTitle}>{i + 1}. {f.title}</Text>
              {f.fix?.platformSpecific?.[platform as keyof typeof f.fix.platformSpecific] && (
                <Text style={[s.findingSummary, { marginTop: 2 }]}>
                  {f.fix.platformSpecific[platform as keyof typeof f.fix.platformSpecific]}
                </Text>
              )}
              {f.fix?.estimatedEffort && (
                <Text style={{ fontSize: 7, color: colors.textFaint }}>
                  Est. effort: {f.fix.estimatedEffort}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}

      {medium.length > 0 && (
        <View style={s.mb16}>
          <Text style={[s.sectionSubtitle, { color: colors.warning }]}>
            Short-term (Medium)
          </Text>
          {medium.map((f, i) => (
            <View key={f.id} style={[s.card, s.cardEval]}>
              <Text style={s.findingTitle}>{i + 1}. {f.title}</Text>
              <Text style={s.findingSummary}>{f.summary}</Text>
            </View>
          ))}
        </View>
      )}

      {low.length > 0 && (
        <View style={s.mb16}>
          <Text style={[s.sectionSubtitle, { color: colors.textMuted }]}>
            Strategic (Low Priority)
          </Text>
          {low.map((f, i) => (
            <View key={f.id} style={s.card}>
              <Text style={{ fontSize: 9, color: colors.textMuted }}>{i + 1}. {f.title}</Text>
            </View>
          ))}
        </View>
      )}

      <PageFooter pageLabel="Fix Plan" />
    </Page>
  );
}

// ─── Next Steps / CTA Page ──────────────────────────────────────────

function NextStepsPage({ domain }: { domain: string }) {
  return (
    <Page size="A4" style={s.page}>
      <View style={{ marginTop: 80 }}>
        <Text style={s.sectionTitle}>Next Steps</Text>
        <Text style={[s.findingSummary, s.mb24]}>
          This audit identified specific, evidenced issues in your GA4 ecommerce tracking implementation.
          Each finding includes a platform-specific fix recommendation.
        </Text>

        <View style={[s.card, { backgroundColor: colors.accent + "15", borderLeftColor: colors.accent, padding: 20 }]}>
          <Text style={{ fontSize: 14, fontWeight: 700, color: colors.white, marginBottom: 8 }}>
            Ready to fix these issues?
          </Text>
          <Text style={{ fontSize: 10, color: colors.textMuted, lineHeight: 1.6, marginBottom: 12 }}>
            We provide professional GA4 ecommerce implementation services. Get all identified
            issues fixed with platform-specific solutions, validated with live testing.
          </Text>
          <Text style={{ fontSize: 10, color: colors.accent, fontWeight: 600 }}>
            Contact: saif@insurge.co
          </Text>
          <Text style={{ fontSize: 8, color: colors.textFaint, marginTop: 4 }}>
            Typical project: $500–$1,500 depending on complexity
          </Text>
        </View>

        <View style={{ marginTop: 40 }}>
          <Text style={{ fontSize: 8, color: colors.textFaint, lineHeight: 1.6 }}>
            Limitations:{"\n"}
            • We do not validate purchase events (we stop before payment submission){"\n"}
            • We audit a single representative path through the funnel{"\n"}
            • Server-side GTM or first-party endpoints may use patterns we don't detect{"\n"}
            • Mobile-only differences are not audited (desktop viewport){"\n"}
            • Authenticated/login-required flows are out of scope
          </Text>
        </View>
      </View>

      <PageFooter pageLabel="" />
    </Page>
  );
}

// ─── Footer ─────────────────────────────────────────────────────────

function PageFooter({ pageLabel }: { pageLabel: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>GA4 Audit Report</Text>
      <Text>{pageLabel}</Text>
    </View>
  );
}
