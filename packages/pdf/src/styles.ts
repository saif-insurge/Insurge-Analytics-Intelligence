import { StyleSheet, Font } from "@react-pdf/renderer";

// Register fonts from Google Fonts CDN
Font.register({
  family: "Inter",
  fonts: [
    { src: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hjQ.ttf", fontWeight: 400 },
    { src: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fAZ9hjQ.ttf", fontWeight: 500 },
    { src: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYAZ9hjQ.ttf", fontWeight: 600 },
    { src: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYAZ9hjQ.ttf", fontWeight: 700 },
  ],
});

Font.registerHyphenationCallback((word) => [word]);

export const colors = {
  bg: "#0a0a0f",
  bgElevated: "#12121a",
  bgSubtle: "#1a1a25",
  border: "#2a2a3a",
  text: "#e8e8ed",
  textMuted: "#8b8b9e",
  textFaint: "#5a5a6e",
  accent: "#6366f1",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",
  white: "#ffffff",
};

export const s = StyleSheet.create({
  // Page
  page: {
    backgroundColor: colors.bg,
    padding: 40,
    fontFamily: "Inter",
    fontSize: 10,
    color: colors.text,
  },

  // Cover page
  coverPage: {
    backgroundColor: colors.bg,
    padding: 60,
    fontFamily: "Inter",
    color: colors.text,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },
  coverBadge: {
    fontSize: 9,
    color: colors.accent,
    marginBottom: 16,
    textTransform: "uppercase" as const,
    letterSpacing: 2,
  },
  coverTitle: {
    fontSize: 32,
    fontWeight: 700,
    color: colors.white,
    marginBottom: 8,
  },
  coverSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 40,
  },
  coverScore: {
    fontSize: 72,
    fontWeight: 700,
    marginBottom: 4,
  },
  coverScoreLabel: {
    fontSize: 14,
    color: colors.textMuted,
  },
  coverMeta: {
    marginTop: 60,
    fontSize: 9,
    color: colors.textFaint,
  },

  // Section headers
  sectionTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: colors.white,
    marginBottom: 16,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: 600,
    color: colors.text,
    marginBottom: 10,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },

  // Cards
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: 6,
    padding: 14,
    marginBottom: 8,
    borderLeft: `3px solid ${colors.border}`,
  },
  cardPass: { borderLeftColor: colors.success },
  cardFail: { borderLeftColor: colors.danger },
  cardEval: { borderLeftColor: colors.warning },

  // Scorecard
  scoreGrid: {
    flexDirection: "row" as const,
    gap: 10,
    marginBottom: 20,
  },
  scoreCard: {
    flex: 1,
    backgroundColor: colors.bgElevated,
    borderRadius: 6,
    padding: 12,
    alignItems: "center" as const,
  },
  scoreValue: {
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 2,
  },
  scoreLabel: {
    fontSize: 8,
    color: colors.textMuted,
    textAlign: "center" as const,
  },
  scoreMax: {
    fontSize: 8,
    color: colors.textFaint,
  },

  // Findings
  findingTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: colors.text,
    marginBottom: 4,
  },
  findingSummary: {
    fontSize: 9,
    color: colors.textMuted,
    lineHeight: 1.5,
    marginBottom: 4,
  },
  findingImpact: {
    fontSize: 8,
    color: colors.textFaint,
    marginBottom: 4,
  },
  findingFix: {
    fontSize: 8,
    color: colors.accent,
    backgroundColor: colors.bgSubtle,
    padding: 8,
    borderRadius: 4,
    marginTop: 4,
  },
  severityBadge: {
    fontSize: 7,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 2,
  },
  statusBadge: {
    fontSize: 7,
    fontWeight: 600,
    textTransform: "uppercase" as const,
  },

  // Event checklist
  eventRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingVertical: 4,
    borderBottom: `1px solid ${colors.bgSubtle}`,
  },
  eventName: {
    fontSize: 9,
    fontWeight: 500,
    flex: 1,
  },
  eventCount: {
    fontSize: 8,
    color: colors.textMuted,
    width: 40,
    textAlign: "right" as const,
  },

  // Footer
  footer: {
    position: "absolute" as const,
    bottom: 20,
    left: 40,
    right: 40,
    fontSize: 7,
    color: colors.textFaint,
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
  },

  // Flex helpers
  row: { flexDirection: "row" as const, alignItems: "center" as const },
  spaceBetween: { justifyContent: "space-between" as const },
  mb4: { marginBottom: 4 },
  mb8: { marginBottom: 8 },
  mb16: { marginBottom: 16 },
  mb24: { marginBottom: 24 },
});

export function gradeColor(grade: string | null | undefined): string {
  if (grade === "pass") return colors.success;
  if (grade === "evaluate") return colors.warning;
  return colors.danger;
}

export function severityColor(severity: string): string {
  if (severity === "critical") return colors.danger;
  if (severity === "high") return "#f97316";
  if (severity === "medium") return colors.warning;
  if (severity === "low") return colors.textMuted;
  return colors.info;
}
