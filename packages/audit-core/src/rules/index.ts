/** Rule engine — runs all rules against an AuditDocument and produces scored findings. */

export type { Rule } from "./types.js";

import type { AuditDocument, Finding } from "../types.js";
import type { Rule } from "./types.js";
import { coverageRules } from "./coverage.js";
import { qualityRules } from "./quality.js";
import { infrastructureRules } from "./infrastructure.js";
import { featureRules } from "./features.js";
import { resetFindingCounter } from "./helpers.js";

export { coverageRules } from "./coverage.js";
export { qualityRules } from "./quality.js";
export { infrastructureRules } from "./infrastructure.js";
export { featureRules } from "./features.js";
export { computeScorecard, RULE_POINTS, CATEGORY_MAX_SCORES } from "./scoring.js";

/** All registered rules. */
export const ALL_RULES: Rule[] = [
  ...coverageRules,
  ...qualityRules,
  ...infrastructureRules,
  ...featureRules,
];

/** Runs all rules against the audit document and returns all findings. */
export function runRules(audit: AuditDocument): Finding[] {
  resetFindingCounter();
  const findings: Finding[] = [];

  for (const rule of ALL_RULES) {
    const ruleFindings = rule.evaluate(audit);
    findings.push(...ruleFindings);
  }

  return findings;
}
