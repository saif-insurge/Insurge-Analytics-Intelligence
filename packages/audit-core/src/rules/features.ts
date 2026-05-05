/** Feature adoption rules — check if site features are tracked with appropriate events. */

import type { Rule } from "./types.js";
import { findEventsByName, makeFinding } from "./helpers.js";

export const searchUntracked: Rule = {
  id: "feature_tracking.search.untracked",
  category: "feature_adoption",
  description: "Checks if site search is tracked with a search event",
  evaluate: (audit) => {
    // Check if any page has a search input in its interactive elements
    const hasSearchInput = audit.pages.some((p) =>
      p.scan.interactiveElements.some(
        (el) => el.context.includes("search") || el.role === "input" && el.text.toLowerCase().includes("search"),
      ),
    );

    if (!hasSearchInput) return [];

    const searchEvents = findEventsByName(audit, "search");
    const viewSearchEvents = findEventsByName(audit, "view_search_results");

    if (searchEvents.length > 0 || viewSearchEvents.length > 0) {
      return [makeFinding(searchUntracked, {
        severity: "info", status: "pass",
        title: "Site search is tracked",
        summary: "Search events detected alongside search UI elements.",
      })];
    }

    return [makeFinding(searchUntracked, {
      severity: "medium", status: "evaluate",
      title: "Site search detected but not tracked",
      summary: "A search input was found on the site but no 'search' or 'view_search_results' event fires. Tracking search queries reveals what products users are looking for.",
      impact: "Missing search tracking means you can't analyze what users search for, which products they can't find, or how search converts.",
      fix: {
        platformSpecific: {
          shopify: "Add a GTM trigger that fires on search results page load. Push the search_term from the URL query parameter.",
          woocommerce: "Add a search event trigger on WooCommerce search results pages using the 's' URL parameter.",
          custom: "Fire a search event with search_term when the user submits a search query.",
        },
        estimatedEffort: "1-2 hours",
      },
    })];
  },
};

export const wishlistUntracked: Rule = {
  id: "feature_tracking.wishlist.untracked",
  category: "feature_adoption",
  description: "Checks if wishlist functionality is tracked",
  evaluate: (audit) => {
    const hasWishlistButton = audit.pages.some((p) =>
      p.scan.interactiveElements.some(
        (el) => {
          const text = el.text.toLowerCase();
          return text.includes("wishlist") || text.includes("wish list") || text.includes("save for later") || text.includes("favorite");
        },
      ),
    );

    if (!hasWishlistButton) return [];

    const wishlistEvents = findEventsByName(audit, "add_to_wishlist");

    if (wishlistEvents.length > 0) {
      return [makeFinding(wishlistUntracked, {
        severity: "info", status: "pass",
        title: "Wishlist tracking is active",
        summary: `Found ${wishlistEvents.length} add_to_wishlist event(s).`,
      })];
    }

    return [makeFinding(wishlistUntracked, {
      severity: "low", status: "evaluate",
      title: "Wishlist feature detected but not tracked",
      summary: "A wishlist/save-for-later button was found but no add_to_wishlist event fires. This is an optional but valuable signal for purchase intent.",
      impact: "Without wishlist tracking, you can't measure purchase intent or retarget users who saved items.",
      fix: {
        platformSpecific: {
          shopify: "Add a click trigger in GTM for the wishlist button. Fire add_to_wishlist with the item details.",
          woocommerce: "If using a wishlist plugin, check if it supports GA4 events. Otherwise, add a dataLayer push on the wishlist button click.",
          custom: "Fire add_to_wishlist with item details when the user clicks the wishlist/save button.",
        },
        estimatedEffort: "1 hour",
      },
    })];
  },
};

export const newsletterUntracked: Rule = {
  id: "feature_tracking.newsletter.untracked",
  category: "feature_adoption",
  description: "Checks if newsletter signup is tracked",
  evaluate: (audit) => {
    const hasNewsletterForm = audit.pages.some((p) =>
      p.scan.interactiveElements.some(
        (el) => {
          const text = el.text.toLowerCase();
          return text.includes("newsletter") || text.includes("subscribe") || text.includes("sign up for") || text.includes("email updates");
        },
      ),
    );

    if (!hasNewsletterForm) return [];

    const leadEvents = findEventsByName(audit, "generate_lead");
    const signupEvents = findEventsByName(audit, "sign_up");

    if (leadEvents.length > 0 || signupEvents.length > 0) {
      return [makeFinding(newsletterUntracked, {
        severity: "info", status: "pass",
        title: "Newsletter/lead capture is tracked",
        summary: "Lead generation events detected alongside newsletter signup form.",
      })];
    }

    return [makeFinding(newsletterUntracked, {
      severity: "low", status: "evaluate",
      title: "Newsletter form detected but not tracked",
      summary: "A newsletter/subscription form was found but no generate_lead or sign_up event fires on submission.",
      impact: "Cannot measure email list growth rate or attribute newsletter signups to marketing campaigns.",
      fix: {
        platformSpecific: {
          shopify: "Add a GTM trigger on newsletter form submission. Fire generate_lead with the form location.",
          woocommerce: "Track newsletter plugin form submissions with a dataLayer push.",
          custom: "Fire generate_lead on successful newsletter form submission.",
        },
        estimatedEffort: "1 hour",
      },
    })];
  },
};

export const highIntentUntracked: Rule = {
  id: "feature_tracking.high_intent_buttons.untracked",
  category: "feature_adoption",
  description: "Flags interactive elements with high engagement potential that lack tracking",
  evaluate: (audit) => {
    const untrackedHighIntent: { page: string; element: string; context: string }[] = [];

    for (const page of audit.pages) {
      for (const el of page.scan.interactiveElements) {
        if (
          !el.tracked &&
          el.recommendation &&
          el.recommendation.priority === "high"
        ) {
          untrackedHighIntent.push({
            page: page.url,
            element: el.text,
            context: el.context,
          });
        }
      }
    }

    if (untrackedHighIntent.length === 0) return [];

    return [makeFinding(highIntentUntracked, {
      severity: "low", status: "evaluate",
      title: "Untracked high-intent interactive elements",
      summary: `Found ${untrackedHighIntent.length} high-intent button(s)/link(s) without event tracking: ${untrackedHighIntent.slice(0, 3).map((u) => `"${u.element}" on ${u.context}`).join(", ")}${untrackedHighIntent.length > 3 ? "..." : ""}`,
      evidence: { observed: untrackedHighIntent },
      impact: "Tracking these interactions would provide deeper insight into user engagement and conversion paths.",
    })];
  },
};

export const featureRules: Rule[] = [
  searchUntracked,
  wishlistUntracked,
  newsletterUntracked,
  highIntentUntracked,
];
