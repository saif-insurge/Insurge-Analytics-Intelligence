/** Scoring system — point allocations per rule and scorecard computation. */

import type { Finding, FindingCategory, FindingStatus, Scorecard } from "../types.js";

/** Point allocation per rule. If a rule isn't listed, it defaults to 0 points. */
export const RULE_POINTS: Record<string, number> = {
  // Coverage (30 total)
  "ga4.ecommerce.view_item_list.missing": 5,
  "ga4.ecommerce.view_item.missing": 5,
  "ga4.ecommerce.add_to_cart.missing": 7,
  "ga4.ecommerce.view_cart.missing": 3,
  "ga4.ecommerce.begin_checkout.missing": 5,
  "ga4.ecommerce.naming.snake_case": 3,
  "ga4.ecommerce.naming.canonical": 2,

  // Quality (30 total)
  "ga4.params.currency.missing": 6,
  "ga4.params.value.missing": 6,
  "ga4.items.item_id.missing": 6,
  "ga4.items.item_name.missing": 5,
  "ga4.items.item_id.inconsistent": 4,
  "ga4.items.price_zero": 3,

  // Infrastructure (25 total)
  "ga4.tags.duplicate_property": 8,
  "ga4.tags.legacy_ua": 4,
  "ga4.consent.mode_v2_missing": 5,
  "ga4.tags.gtm_present": 5,
  "ga4.tags.hardcoded": 3,

  // Features (15 total)
  "feature_tracking.search.untracked": 4,
  "feature_tracking.wishlist.untracked": 3,
  "feature_tracking.newsletter.untracked": 4,
  "feature_tracking.high_intent_buttons.untracked": 4,
};

/** Category max scores. */
export const CATEGORY_MAX_SCORES: Record<FindingCategory, number> = {
  implementation_coverage: 30,
  data_quality: 30,
  platform_infrastructure: 25,
  feature_adoption: 15,
};

/** Category display labels. */
const CATEGORY_LABELS: Record<FindingCategory, string> = {
  implementation_coverage: "Implementation Coverage",
  data_quality: "Data Quality",
  platform_infrastructure: "Platform & Infrastructure",
  feature_adoption: "Feature Adoption",
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
  const categories: FindingCategory[] = [
    "implementation_coverage",
    "data_quality",
    "platform_infrastructure",
    "feature_adoption",
  ];

  const categoryScores = categories.map((category) => {
    const categoryFindings = findings.filter((f) => f.category === category);
    const maxScore = CATEGORY_MAX_SCORES[category];
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
      label: CATEGORY_LABELS[category],
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
