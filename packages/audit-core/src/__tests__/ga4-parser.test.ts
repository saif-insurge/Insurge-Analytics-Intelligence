import { describe, it, expect } from "vitest";
import { isGa4Endpoint, parseGa4Request } from "../ga4-parser.js";

import { fixture as pageViewFixture } from "./fixtures/collect-get-page-view.js";
import { fixture as viewItemFixture } from "./fixtures/collect-get-view-item.js";
import { fixture as viewItemListFixture } from "./fixtures/collect-get-view-item-list.js";
import { fixture as addToCartFixture } from "./fixtures/collect-get-add-to-cart.js";
import { fixture as batchedFixture } from "./fixtures/collect-post-batched.js";
import { fixture as encodedFixture } from "./fixtures/collect-get-encoded-chars.js";
import { fixture as nestedCatFixture } from "./fixtures/collect-get-nested-categories.js";
import { fixture as mpFixture } from "./fixtures/mp-collect-json.js";
import { fixture as checkoutFixture } from "./fixtures/collect-get-begin-checkout.js";
import { fixture as firstPartyFixture } from "./fixtures/first-party-endpoint.js";
import { fixture as customProxyFixture } from "./fixtures/custom-proxy-endpoint.js";

// ─── isGa4Endpoint ──────────────────────────────────────────────────────────

describe("isGa4Endpoint", () => {
  it("matches /g/collect on google-analytics.com", () => {
    expect(
      isGa4Endpoint("https://www.google-analytics.com/g/collect?v=2&tid=G-X"),
    ).toBe(true);
  });

  it("matches /g/collect on analytics.google.com", () => {
    expect(
      isGa4Endpoint("https://analytics.google.com/g/collect?tid=G-X"),
    ).toBe(true);
  });

  it("matches /mp/collect", () => {
    expect(
      isGa4Endpoint(
        "https://www.google-analytics.com/mp/collect?measurement_id=G-X",
      ),
    ).toBe(true);
  });

  it("matches first-party proxy with /g/collect path", () => {
    expect(
      isGa4Endpoint("https://analytics.mysite.com/g/collect?tid=G-X"),
    ).toBe(true);
  });

  it("rejects googletagmanager.com script loads", () => {
    expect(
      isGa4Endpoint("https://www.googletagmanager.com/gtag/js?id=G-X"),
    ).toBe(false);
    expect(
      isGa4Endpoint("https://www.googletagmanager.com/gtm.js?id=GTM-X"),
    ).toBe(false);
  });

  it("matches googletagmanager.com /g/collect", () => {
    expect(
      isGa4Endpoint("https://www.googletagmanager.com/g/collect?v=2&tid=G-X"),
    ).toBe(true);
  });

  it("matches custom first-party proxy with GA4 query params", () => {
    expect(
      isGa4Endpoint(
        "https://kapiva.in/kpvgtg/ag/g/c?v=2&tid=G-V1GCS4W705&en=page_view",
      ),
    ).toBe(true);
    expect(
      isGa4Endpoint(
        "https://example.com/custom/path?v=2&tid=G-ABCDEF&en=view_item",
      ),
    ).toBe(true);
  });

  it("rejects non-GA4 URLs", () => {
    expect(isGa4Endpoint("https://example.com/api/data")).toBe(false);
    expect(isGa4Endpoint("https://facebook.com/tr?ev=PageView")).toBe(false);
  });

  it("rejects invalid URLs", () => {
    expect(isGa4Endpoint("not a url")).toBe(false);
    expect(isGa4Endpoint("")).toBe(false);
  });
});

// ─── parseGa4Request — unit tests ──────────────────────────────────────────

describe("parseGa4Request", () => {
  it("returns empty array for non-GA4 URLs", () => {
    expect(parseGa4Request("https://example.com/page")).toEqual([]);
  });

  it("returns empty array for invalid URLs", () => {
    expect(parseGa4Request("garbage")).toEqual([]);
  });

  it("handles missing en param gracefully", () => {
    const events = parseGa4Request(
      "https://www.google-analytics.com/g/collect?v=2&tid=G-X",
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.name).toBe("");
    expect(events[0]!.tid).toBe("G-X");
  });

  it("handles missing tid param gracefully", () => {
    const events = parseGa4Request(
      "https://www.google-analytics.com/g/collect?v=2&en=page_view",
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.tid).toBe("");
    expect(events[0]!.name).toBe("page_view");
  });
});

// ─── Fixture-driven integration tests ───────────────────────────────────────

describe("fixture: page_view (GET, no items)", () => {
  const events = parseGa4Request(pageViewFixture.url, pageViewFixture.postBody);

  it("parses correct number of events", () => {
    expect(events).toHaveLength(pageViewFixture.expected.eventCount);
  });

  it("extracts event name and tid", () => {
    expect(events[0]!.name).toBe(pageViewFixture.expected.events[0]!.name);
    expect(events[0]!.tid).toBe(pageViewFixture.expected.events[0]!.tid);
  });

  it("detects transport correctly", () => {
    expect(events[0]!.transport).toBe(
      pageViewFixture.expected.events[0]!.transport,
    );
  });

  it("extracts ep.* and epn.* params", () => {
    const expected = pageViewFixture.expected.events[0]!.params;
    for (const [key, value] of Object.entries(expected)) {
      expect(events[0]!.params[key]).toEqual(value);
    }
  });

  it("has no items", () => {
    expect(events[0]!.items).toHaveLength(
      pageViewFixture.expected.events[0]!.itemCount,
    );
  });
});

describe("fixture: view_item (GET, single item)", () => {
  const events = parseGa4Request(viewItemFixture.url, viewItemFixture.postBody);

  it("parses correct number of events", () => {
    expect(events).toHaveLength(viewItemFixture.expected.eventCount);
  });

  it("extracts event name and tid", () => {
    expect(events[0]!.name).toBe("view_item");
    expect(events[0]!.tid).toBe("G-TEST12345");
  });

  it("parses single item with all fields", () => {
    expect(events[0]!.items).toHaveLength(1);
    const item = events[0]!.items[0]!;
    const expectedItem = viewItemFixture.expected.events[0]!.items![0]!;
    expect(item).toEqual(expectedItem);
  });

  it("extracts numeric epn.* params as numbers", () => {
    expect(events[0]!.params["value"]).toBe(49.99);
    expect(typeof events[0]!.params["value"]).toBe("number");
  });
});

describe("fixture: view_item_list (GET, 4 items)", () => {
  const events = parseGa4Request(
    viewItemListFixture.url,
    viewItemListFixture.postBody,
  );

  it("parses 4 items", () => {
    expect(events[0]!.items).toHaveLength(4);
  });

  it("preserves item order and index", () => {
    const expectedItems = viewItemListFixture.expected.events[0]!.items!;
    for (let i = 0; i < expectedItems.length; i++) {
      expect(events[0]!.items[i]).toEqual(expectedItems[i]);
    }
  });
});

describe("fixture: add_to_cart (mixed ep/epn + nested category)", () => {
  const events = parseGa4Request(
    addToCartFixture.url,
    addToCartFixture.postBody,
  );

  it("parses event correctly", () => {
    expect(events[0]!.name).toBe("add_to_cart");
    expect(events[0]!.tid).toBe("G-SHOPIFY99");
  });

  it("parses item with nested category2", () => {
    const item = events[0]!.items[0]!;
    expect(item["item_category"]).toBe("Gadgets");
    expect(item["item_category2"]).toBe("Home");
  });

  it("parses item with discount and affiliation", () => {
    const item = events[0]!.items[0]!;
    expect(item["discount"]).toBe(5.0);
    expect(item["affiliation"]).toBe("Online Store");
  });

  it("includes both ep.* and standard params", () => {
    expect(events[0]!.params["currency"]).toBe("GBP");
    expect(events[0]!.params["value"]).toBe(29.99);
    expect(events[0]!.params["cu"]).toBe("GBP");
  });
});

describe("fixture: batched POST (3 events)", () => {
  const events = parseGa4Request(batchedFixture.url, batchedFixture.postBody);

  it("parses 3 events from batch", () => {
    expect(events).toHaveLength(3);
  });

  it("inherits tid from URL params in each event", () => {
    for (const event of events) {
      expect(event.tid).toBe("G-BATCH001");
    }
  });

  it("parses each event name correctly", () => {
    expect(events[0]!.name).toBe("page_view");
    expect(events[1]!.name).toBe("scroll");
    expect(events[2]!.name).toBe("view_item_list");
  });

  it("inherits cid from URL params", () => {
    for (const event of events) {
      expect(event.params["cid"]).toBe("batch.client");
    }
  });

  it("third event has items", () => {
    expect(events[2]!.items).toHaveLength(1);
    expect(events[2]!.items[0]!["item_id"]).toBe("F01");
  });
});

describe("fixture: encoded characters", () => {
  const events = parseGa4Request(encodedFixture.url, encodedFixture.postBody);

  it("decodes URL-encoded item fields", () => {
    const item = events[0]!.items[0]!;
    expect(item["item_id"]).toBe("SPEC&001");
    expect(item["item_name"]).toBe("Möbius Strip & Klein Bottle");
    expect(item["item_category"]).toBe("Math & Science");
    expect(item["item_brand"]).toBe("Töpfer");
  });
});

describe("fixture: nested categories (ca, ca2, ca3, ca4)", () => {
  const events = parseGa4Request(
    nestedCatFixture.url,
    nestedCatFixture.postBody,
  );

  it("parses all category levels", () => {
    const item = events[0]!.items[0]!;
    const expectedItem = nestedCatFixture.expected.events[0]!.items![0]!;
    expect(item).toEqual(expectedItem);
  });
});

describe("fixture: /mp/collect JSON (2 events)", () => {
  const events = parseGa4Request(mpFixture.url, mpFixture.postBody);

  it("parses 2 events from MP JSON", () => {
    expect(events).toHaveLength(2);
  });

  it("extracts measurement_id as tid", () => {
    expect(events[0]!.tid).toBe("G-MP001");
    expect(events[1]!.tid).toBe("G-MP001");
  });

  it("detects ga4-mp transport", () => {
    expect(events[0]!.transport).toBe("ga4-mp");
    expect(events[1]!.transport).toBe("ga4-mp");
  });

  it("extracts items from params.items", () => {
    expect(events[0]!.items).toHaveLength(1);
    expect(events[0]!.items[0]!["item_id"]).toBe("SKU-A");
    expect(events[0]!.items[0]!["item_brand"]).toBe("Nike");
  });

  it("removes items from params after extraction", () => {
    expect(events[0]!.params["items"]).toBeUndefined();
  });

  it("adds client_id as cid in params", () => {
    expect(events[0]!.params["cid"]).toBe("mp-client-123");
  });

  it("parses purchase event params correctly", () => {
    const expected = mpFixture.expected.events[0]!.params!;
    for (const [key, value] of Object.entries(expected)) {
      expect(events[0]!.params[key]).toEqual(value);
    }
  });
});

describe("fixture: begin_checkout (complex, 3 items)", () => {
  const events = parseGa4Request(
    checkoutFixture.url,
    checkoutFixture.postBody,
  );

  it("parses single event", () => {
    expect(events).toHaveLength(1);
  });

  it("extracts all 3 items", () => {
    expect(events[0]!.items).toHaveLength(3);
  });

  it("parses items with full detail", () => {
    const expectedItems = checkoutFixture.expected.events[0]!.items!;
    for (let i = 0; i < expectedItems.length; i++) {
      expect(events[0]!.items[i]).toEqual(expectedItems[i]);
    }
  });

  it("extracts coupon and value from params", () => {
    expect(events[0]!.params["coupon"]).toBe("WELCOME15");
    expect(events[0]!.params["value"]).toBe(259.97);
  });
});

describe("fixture: first-party endpoint", () => {
  const events = parseGa4Request(
    firstPartyFixture.url,
    firstPartyFixture.postBody,
  );

  it("detects first-party transport", () => {
    expect(events[0]!.transport).toBe("first-party");
  });

  it("still parses event data correctly", () => {
    expect(events[0]!.name).toBe("view_item");
    expect(events[0]!.tid).toBe("G-FP001");
    expect(events[0]!.items).toHaveLength(1);
    expect(events[0]!.items[0]!["item_id"]).toBe("FP-01");
  });
});

describe("fixture: custom proxy endpoint (param-based detection)", () => {
  const events = parseGa4Request(
    customProxyFixture.url,
    customProxyFixture.postBody,
  );

  it("detects endpoint via GA4 query params", () => {
    expect(events).toHaveLength(1);
  });

  it("detects first-party transport", () => {
    expect(events[0]!.transport).toBe("first-party");
  });

  it("parses event name and tid", () => {
    expect(events[0]!.name).toBe("view_item");
    expect(events[0]!.tid).toBe("G-PROXY01");
  });

  it("parses items correctly", () => {
    expect(events[0]!.items).toHaveLength(1);
    const item = events[0]!.items[0]!;
    expect(item["item_id"]).toBe("SHILAJIT-01");
    expect(item["item_name"]).toBe("Shilajit Gold Resin");
    expect(item["price"]).toBe(1239);
    expect(item["item_category"]).toBe("Ayurveda");
    expect(item["item_brand"]).toBe("Kapiva");
  });

  it("parses INR currency params", () => {
    expect(events[0]!.params["currency"]).toBe("INR");
    expect(events[0]!.params["value"]).toBe(1239);
  });
});
