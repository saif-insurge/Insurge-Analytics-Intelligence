/** Scoring system — point allocations per rule and scorecard computation. */

import type { Finding, FindingCategory, FindingStatus, Scorecard } from "../types.js";

/**
 * Point allocation per rule. If a rule isn't listed, it defaults to 0 points.
 * Per-category totals match CATEGORY_MAX_SCORES so a category can hit max.
 *
 * `feature_tracking.*` rules are kept here for backward-compat — old findings
 * in the DB may reference them — but new audits don't run those rules.
 */
export const RULE_POINTS: Record<string, number> = {
  // Coverage (35 total)
  "ga4.ecommerce.view_item_list.missing": 6,
  "ga4.ecommerce.view_item.missing": 6,
  "ga4.ecommerce.add_to_cart.missing": 8,
  "ga4.ecommerce.view_cart.missing": 3,
  "ga4.ecommerce.begin_checkout.missing": 6,
  "ga4.ecommerce.naming.snake_case": 4,
  "ga4.ecommerce.naming.canonical": 2,

  // Quality (35 total)
  "ga4.params.currency.missing": 7,
  "ga4.params.value.missing": 7,
  "ga4.items.item_id.missing": 7,
  "ga4.items.item_name.missing": 6,
  "ga4.items.item_id.inconsistent": 5,
  "ga4.items.price_zero": 3,

  // Infrastructure (30 total)
  "ga4.tags.duplicate_property": 10,
  "ga4.tags.legacy_ua": 5,
  "ga4.consent.mode_v2_missing": 6,
  "ga4.tags.gtm_present": 6,
  "ga4.tags.hardcoded": 3,

  // Features — deprecated, no longer scored (kept for historical findings)
  "feature_tracking.search.untracked": 0,
  "feature_tracking.wishlist.untracked": 0,
  "feature_tracking.newsletter.untracked": 0,
  "feature_tracking.high_intent_buttons.untracked": 0,
};

/**
 * Category max scores. Renormalized to 100 after dropping feature_adoption.
 * `feature_adoption` is intentionally absent — the rules don't run anymore
 * (we don't reliably measure those signals during the funnel walk) and
 * the category is no longer surfaced in the UI.
 */
export const CATEGORY_MAX_SCORES: Partial<Record<FindingCategory, number>> = {
  implementation_coverage: 35,
  data_quality: 35,
  platform_infrastructure: 30,
};

/** Category display labels. Same exclusion as CATEGORY_MAX_SCORES. */
const CATEGORY_LABELS: Partial<Record<FindingCategory, string>> = {
  implementation_coverage: "Implementation Coverage",
  data_quality: "Data Quality",
  platform_infrastructure: "Platform & Infrastructure",
};

/** Grade based on percentage: 80%+ = pass, 50-79% = evaluate, <50% = fail. */
function gradeFromPercentage(pct: number): FindingStatus {
  if (pct >= 80) return "pass";
  if (pct >= 50) return "evaluate";
  return "fail";
}

/** Compute points earned for a finding based on its status. */
function pointsForFinding(finding: Finding): number {
  const maxPoints = RULE_POINTS[finding.ruleId] ?? 0;
  if (finding.status === "pass") return maxPoints;
  if (finding.status === "evaluate") return Math.round(maxPoints / 2);
  return 0;
}

/** Compute the full scorecard from a list of findings. */
export function computeScorecard(findings: Finding[]): Scorecard {
  // Only the active scored categories (feature_adoption is deprecated).
  const categories: FindingCategory[] = [
    "implementation_coverage",
    "data_quality",
    "platform_infrastructure",
  ];

  const categoryScores = categories.map((category) => {
    const categoryFindings = findings.filter((f) => f.category === category);
    const maxScore = CATEGORY_MAX_SCORES[category] ?? 0;
    const earned = categoryFindings.reduce((sum, f) => sum + pointsForFinding(f), 0);
    const score = Math.min(earned, maxScore);
    const pct = maxScore > 0 ? (score / maxScore) * 100 : 100;

    // Generate category summary
    const failCount = categoryFindings.filter((f) => f.status === "fail").length;
    const passCount = categoryFindings.filter((f) => f.status === "pass").length;
    const evalCount = categoryFindings.filter((f) => f.status === "evaluate").length;
    let summary = "";
    if (failCount === 0 && evalCount === 0) {
      summary = "All checks passed.";
    } else if (failCount > 0) {
      summary = `${failCount} issue(s) found requiring attention.`;
    } else {
      summary = `${evalCount} item(s) to review.`;
    }

    return {
      name: category,
      label: CATEGORY_LABELS[category] ?? category,
      score,
      maxScore,
      grade: gradeFromPercentage(pct),
      summary,
    };
  });

  const totalScore = categoryScores.reduce((sum, c) => sum + c.score, 0);
  const totalMax = 100;
  const overallPct = (totalScore / totalMax) * 100;

  return {
    overall: {
      grade: gradeFromPercentage(overallPct),
      score: totalScore,
      maxScore: 100,
    },
    categories: categoryScores,
  };
}
