/** Platform & infrastructure rules — check tag setup, duplicate properties, consent mode. */

import type { Rule } from "./types.js";
import { makeFinding, getUniqueTids } from "./helpers.js";

export const duplicateProperty: Rule = {
  id: "ga4.tags.duplicate_property",
  category: "platform_infrastructure",
  description: "Checks for multiple GA4 measurement IDs (data fragmentation)",
  evaluate: (audit) => {
    const tids = getUniqueTids(audit);
    if (tids.length <= 1) {
      if (tids.length === 0) return [];
      return [makeFinding(duplicateProperty, {
        severity: "info", status: "pass",
        title: "Single GA4 property detected",
        summary: `Only one GA4 measurement ID found: ${tids[0]}.`,
      })];
    }

    return [makeFinding(duplicateProperty, {
      severity: "medium", status: "evaluate",
      title: "Multiple GA4 properties detected — verify intent",
      summary: `Found ${tids.length} GA4 properties: ${tids.join(", ")}. Multiple properties can be deliberate (parent + child rollups, dev + prod overlap, source migration, dual setup for an agency handover) — or they can be unintentional duplicates that fragment your data.`,
      evidence: { observed: tids },
      impact: "If unintentional: ecommerce data is split across properties, users/sessions/conversions are counted separately, and unified reporting becomes harder. If intentional: no impact, but worth documenting why.",
      fix: {
        platformSpecific: {
          shopify: "Review theme.liquid, GTM container, and any installed apps for duplicate GA4 tags. If both properties are intentional (e.g. one for the brand, one for a parent property), document it. Otherwise consolidate.",
          woocommerce: "Check for duplicate GA4 plugins and hardcoded gtag snippets. If both are intentional, document it. Otherwise remove duplicates.",
          custom: "Audit all GA4 tag installations. Confirm whether each property is intentional or leftover from a migration.",
        },
        estimatedEffort: "30 min to verify, 1-2 hours to consolidate if needed",
      },
    })];
  },
};

export const legacyUa: Rule = {
  id: "ga4.tags.legacy_ua",
  category: "platform_infrastructure",
  description: "Checks if legacy Universal Analytics tracking is still active",
  evaluate: (audit) => {
    const uaTids = getUniqueTids(audit).filter((tid) => /^UA-\d+-\d+$/.test(tid));

    if (uaTids.length === 0) return [];

    return [makeFinding(legacyUa, {
      severity: "medium", status: "evaluate",
      title: "Legacy Universal Analytics tracking detected",
      summary: `Found UA property ID(s): ${uaTids.join(", ")}. Universal Analytics stopped processing data in July 2024.`,
      evidence: { observed: uaTids },
      impact: "UA tags add unnecessary page weight and network requests. The data they collect is no longer accessible in UA reports.",
      fix: {
        platformSpecific: {
          shopify: "Remove the UA tracking code from your theme and GTM container.",
          woocommerce: "Uninstall any UA-specific plugins and remove hardcoded UA snippets.",
          custom: "Remove all analytics.js or gtag UA references from your codebase.",
        },
        estimatedEffort: "30 minutes",
      },
    })];
  },
};

export const consentModeMissing: Rule = {
  id: "ga4.consent.mode_v2_missing",
  category: "platform_infrastructure",
  description: "Checks if Google Consent Mode v2 is configured",
  evaluate: (audit) => {
    // Check dataLayer entries for consent configuration
    let consentFound = false;
    for (const page of audit.pages) {
      if (page.dataLayer.consentState && Object.keys(page.dataLayer.consentState).length > 0) {
        consentFound = true;
        break;
      }
      // Also check dataLayer entries for consent default command
      for (const entry of page.dataLayer.entries) {
        const entryStr = JSON.stringify(entry).toLowerCase();
        if (entryStr.includes("consent") && (entryStr.includes("default") || entryStr.includes("granted") || entryStr.includes("denied"))) {
          consentFound = true;
          break;
        }
      }
      if (consentFound) break;
    }

    if (consentFound) {
      return [makeFinding(consentModeMissing, {
        severity: "info", status: "pass",
        title: "Consent Mode detected",
        summary: "Google Consent Mode configuration was detected on the site.",
      })];
    }

    return [makeFinding(consentModeMissing, {
      severity: "medium", status: "evaluate",
      title: "No Google Consent Mode v2 detected",
      summary: "No consent mode default configuration was found. Consent Mode v2 is required for EU compliance and recommended globally for data modeling.",
      evidence: { expected: "gtag('consent', 'default', {...})" },
      impact: "Without Consent Mode, GA4 cannot model conversions for users who deny consent. Required for Google Ads in the EU/EEA since March 2024.",
      fix: {
        platformSpecific: {
          shopify: "Add Consent Mode v2 via your consent management platform (e.g., OneTrust, CookieBot) or manually in theme.liquid before the GTM snippet.",
          woocommerce: "Install a Consent Mode compatible plugin or add the consent default snippet before your GTM code.",
          custom: "Add gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied' }) before loading any Google tags.",
        },
        estimatedEffort: "2-4 hours",
      },
    })];
  },
};

export const gtmPresent: Rule = {
  id: "ga4.tags.gtm_present",
  category: "platform_infrastructure",
  description: "Checks whether GTM is used as the tag management method (best practice)",
  evaluate: (audit) => {
    const stack = audit.audit.site.stack;
    if (stack.tagManager === "gtm" && stack.containerIds.length > 0) {
      return [makeFinding(gtmPresent, {
        severity: "info", status: "pass",
        title: "Google Tag Manager is in use",
        summary: `GTM container(s) detected: ${stack.containerIds.join(", ")}. Using GTM for tag management is a best practice.`,
      })];
    }

    if (stack.tagManager === "gtag") {
      return [makeFinding(gtmPresent, {
        severity: "medium", status: "evaluate",
        title: "GA4 implemented via hardcoded gtag.js (no GTM)",
        summary: "GA4 is loaded via a hardcoded gtag.js snippet without Google Tag Manager. GTM provides better flexibility and governance.",
        evidence: { observed: "gtag.js direct implementation" },
        impact: "Without GTM, tag changes require code deployments. GTM enables marketing teams to manage tags independently.",
        fix: {
          platformSpecific: {
            shopify: "Create a GTM container and migrate your gtag.js implementation into GTM tags. Add the GTM snippet to theme.liquid.",
            woocommerce: "Install a GTM plugin and migrate your existing gtag implementation.",
            custom: "Set up a GTM container, move your GA4 configuration into a GA4 Configuration tag, and replace the hardcoded snippet with the GTM container.",
          },
          estimatedEffort: "2-4 hours",
        },
      })];
    }

    return [];
  },
};

export const hardcodedTag: Rule = {
  id: "ga4.tags.hardcoded",
  category: "platform_infrastructure",
  description: "Checks if gtag.js is hardcoded without GTM",
  evaluate: (audit) => {
    const stack = audit.audit.site.stack;
    if (stack.tagManager === "gtag" || stack.tagManager === "none") {
      return [makeFinding(hardcodedTag, {
        severity: "low", status: "evaluate",
        title: "GA4 tag appears to be hardcoded",
        summary: "The GA4 implementation uses a direct gtag.js snippet rather than a tag manager. Consider migrating to GTM for better manageability.",
        impact: "Hardcoded tags require developer involvement for every tracking change, slowing down marketing operations.",
      })];
    }
    return [];
  },
};

export const infrastructureRules: Rule[] = [
  duplicateProperty,
  legacyUa,
  consentModeMissing,
  gtmPresent,
  hardcodedTag,
];
