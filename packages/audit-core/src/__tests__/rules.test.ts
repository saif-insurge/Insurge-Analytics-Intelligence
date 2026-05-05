import { describe, it, expect } from "vitest";
import { runRules, computeScorecard, ALL_RULES } from "../rules/index.js";
import { goodAudit } from "./fixtures/audit-good.js";
import { brokenAudit } from "./fixtures/audit-broken.js";
import type { Finding } from "../types.js";

// ─── Good site ──────────────────────────────────────────────────────

describe("rules: good site", () => {
  const findings = runRules(goodAudit);

  it("runs all rules", () => {
    expect(findings.length).toBeGreaterThan(0);
  });

  it("has mostly passing findings", () => {
    const passes = findings.filter((f) => f.status === "pass");
    const fails = findings.filter((f) => f.status === "fail");
    expect(passes.length).toBeGreaterThan(fails.length);
  });

  // Coverage
  it("passes view_item_list", () => {
    const f = findings.find((f) => f.ruleId === "ga4.ecommerce.view_item_list.missing");
    expect(f?.status).toBe("pass");
  });

  it("passes view_item", () => {
    const f = findings.find((f) => f.ruleId === "ga4.ecommerce.view_item.missing");
    expect(f?.status).toBe("pass");
  });

  it("passes add_to_cart", () => {
    const f = findings.find((f) => f.ruleId === "ga4.ecommerce.add_to_cart.missing");
    expect(f?.status).toBe("pass");
  });

  it("passes view_cart", () => {
    const f = findings.find((f) => f.ruleId === "ga4.ecommerce.view_cart.missing");
    expect(f?.status).toBe("pass");
  });

  it("passes begin_checkout", () => {
    const f = findings.find((f) => f.ruleId === "ga4.ecommerce.begin_checkout.missing");
    expect(f?.status).toBe("pass");
  });

  it("passes snake_case naming", () => {
    const f = findings.find((f) => f.ruleId === "ga4.ecommerce.naming.snake_case");
    expect(f?.status).toBe("pass");
  });

  // Quality
  it("passes currency check", () => {
    const f = findings.find((f) => f.ruleId === "ga4.params.currency.missing");
    expect(f?.status).toBe("pass");
  });

  it("passes item_id check", () => {
    const f = findings.find((f) => f.ruleId === "ga4.items.item_id.missing");
    expect(f?.status).toBe("pass");
  });

  // Infrastructure
  it("passes single property check", () => {
    const f = findings.find((f) => f.ruleId === "ga4.tags.duplicate_property");
    expect(f?.status).toBe("pass");
  });

  it("passes GTM check", () => {
    const f = findings.find((f) => f.ruleId === "ga4.tags.gtm_present");
    expect(f?.status).toBe("pass");
  });

  it("passes consent mode check", () => {
    const f = findings.find((f) => f.ruleId === "ga4.consent.mode_v2_missing");
    expect(f?.status).toBe("pass");
  });
});

// ─── Broken site ────────────────────────────────────────────────────

describe("rules: broken site", () => {
  const findings = runRules(brokenAudit);

  it("has mostly failing findings", () => {
    const fails = findings.filter((f) => f.status === "fail");
    expect(fails.length).toBeGreaterThanOrEqual(5);
  });

  // Coverage failures
  it("fails view_item_list.missing (no view_item_list events)", () => {
    const f = findings.find((f) => f.ruleId === "ga4.ecommerce.view_item_list.missing");
    expect(f?.status).toBe("fail");
    expect(f?.severity).toBe("critical");
  });

  it("fails add_to_cart.missing (AddToCart is non-canonical)", () => {
    const f = findings.find((f) => f.ruleId === "ga4.ecommerce.add_to_cart.missing");
    expect(f?.status).toBe("fail");
  });

  it("fails view_cart.missing", () => {
    const f = findings.find((f) => f.ruleId === "ga4.ecommerce.view_cart.missing");
    expect(f?.status).toBe("fail");
  });

  it("fails begin_checkout.missing", () => {
    const f = findings.find((f) => f.ruleId === "ga4.ecommerce.begin_checkout.missing");
    expect(f?.status).toBe("fail");
  });

  it("fails snake_case (PageView, AddToCart)", () => {
    const f = findings.find((f) => f.ruleId === "ga4.ecommerce.naming.snake_case");
    expect(f?.status).toBe("fail");
  });

  it("fails canonical naming (PageView → page_view, AddToCart → add_to_cart)", () => {
    const f = findings.find((f) => f.ruleId === "ga4.ecommerce.naming.canonical");
    expect(f?.status).toBe("fail");
  });

  // Quality failures
  it("fails currency missing on view_item", () => {
    const f = findings.find((f) => f.ruleId === "ga4.params.currency.missing");
    expect(f?.status).toBe("fail");
  });

  it("fails item_name missing", () => {
    const f = findings.find((f) => f.ruleId === "ga4.items.item_name.missing");
    expect(f?.status).toBe("fail");
  });

  it("evaluates price_zero", () => {
    const f = findings.find((f) => f.ruleId === "ga4.items.price_zero");
    expect(f?.status).toBe("evaluate");
  });

  // Infrastructure failures
  it("fails duplicate property (G-BROKEN1, G-BROKEN2)", () => {
    const f = findings.find((f) => f.ruleId === "ga4.tags.duplicate_property");
    expect(f?.status).toBe("fail");
  });

  it("evaluates legacy UA", () => {
    const f = findings.find((f) => f.ruleId === "ga4.tags.legacy_ua");
    expect(f?.status).toBe("evaluate");
  });

  it("evaluates consent mode missing", () => {
    const f = findings.find((f) => f.ruleId === "ga4.consent.mode_v2_missing");
    expect(f?.status).toBe("evaluate");
  });

  // Feature detection
  it("evaluates untracked search", () => {
    const f = findings.find((f) => f.ruleId === "feature_tracking.search.untracked");
    expect(f?.status).toBe("evaluate");
  });

  it("evaluates untracked wishlist", () => {
    const f = findings.find((f) => f.ruleId === "feature_tracking.wishlist.untracked");
    expect(f?.status).toBe("evaluate");
  });

  it("evaluates untracked newsletter", () => {
    const f = findings.find((f) => f.ruleId === "feature_tracking.newsletter.untracked");
    expect(f?.status).toBe("evaluate");
  });
});

// ─── Scoring ────────────────────────────────────────────────────────

describe("computeScorecard", () => {
  it("scores good site highly", () => {
    const findings = runRules(goodAudit);
    const scorecard = computeScorecard(findings);
    expect(scorecard.overall.score).toBeGreaterThanOrEqual(60);
    expect(scorecard.overall.grade).not.toBe("fail");
  });

  it("scores broken site low", () => {
    const findings = runRules(brokenAudit);
    const scorecard = computeScorecard(findings);
    expect(scorecard.overall.score).toBeLessThan(50);
    expect(scorecard.overall.grade).toBe("fail");
  });

  it("has 4 categories", () => {
    const findings = runRules(goodAudit);
    const scorecard = computeScorecard(findings);
    expect(scorecard.categories).toHaveLength(4);
  });

  it("category scores sum to overall", () => {
    const findings = runRules(goodAudit);
    const scorecard = computeScorecard(findings);
    const sum = scorecard.categories.reduce((s, c) => s + c.score, 0);
    expect(sum).toBe(scorecard.overall.score);
  });

  it("max score is 100", () => {
    const findings = runRules(goodAudit);
    const scorecard = computeScorecard(findings);
    expect(scorecard.overall.maxScore).toBe(100);
  });
});

// ─── Rule registry ──────────────────────────────────────────────────

describe("rule registry", () => {
  it("has 22 rules registered", () => {
    expect(ALL_RULES.length).toBe(22);
  });

  it("all rules have unique IDs", () => {
    const ids = ALL_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all rules have a category", () => {
    for (const rule of ALL_RULES) {
      expect(["implementation_coverage", "data_quality", "platform_infrastructure", "feature_adoption"]).toContain(rule.category);
    }
  });
});
