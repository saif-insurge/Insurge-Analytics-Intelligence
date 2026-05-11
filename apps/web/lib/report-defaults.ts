/**
 * Default copy for the public /report/:id page. Used as fallback when an
 * org hasn't customized a particular field. Both the report renderer and
 * the settings form import these so empty-state previews stay accurate.
 */
export const REPORT_DEFAULTS = {
  companyName: "Insurge",
  tagline: "GA4 Tracking Audit Report",
  ctaHeadline: "Ready to fix these issues?",
  ctaBody:
    "We provide professional GA4 ecommerce implementation services for Shopify, WooCommerce, and custom storefronts.",
  ctaLabel: "Get a Quote",
  ctaUrl: "mailto:saif@insurge.io",
  footerNote: "Typical project: $500–$1,500. Most fixes ship within 1–2 weeks.",
} as const;

export type ReportBranding = {
  companyName: string;
  tagline: string;
  ctaHeadline: string;
  ctaBody: string;
  ctaLabel: string;
  ctaUrl: string;
  footerNote: string;
};

type OrgBrandingFields = Partial<{
  reportCompanyName: string | null;
  reportTagline: string | null;
  reportCtaHeadline: string | null;
  reportCtaBody: string | null;
  reportCtaLabel: string | null;
  reportCtaUrl: string | null;
  reportFooterNote: string | null;
}>;

/** Collapses an org row's nullable branding fields to a fully-populated branding bundle. */
export function resolveBranding(org: OrgBrandingFields | null | undefined): ReportBranding {
  return {
    companyName: org?.reportCompanyName?.trim() || REPORT_DEFAULTS.companyName,
    tagline: org?.reportTagline?.trim() || REPORT_DEFAULTS.tagline,
    ctaHeadline: org?.reportCtaHeadline?.trim() || REPORT_DEFAULTS.ctaHeadline,
    ctaBody: org?.reportCtaBody?.trim() || REPORT_DEFAULTS.ctaBody,
    ctaLabel: org?.reportCtaLabel?.trim() || REPORT_DEFAULTS.ctaLabel,
    ctaUrl: org?.reportCtaUrl?.trim() || REPORT_DEFAULTS.ctaUrl,
    footerNote: org?.reportFooterNote?.trim() || REPORT_DEFAULTS.footerNote,
  };
}
