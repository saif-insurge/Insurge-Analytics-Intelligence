import type { CapturedEvent } from "./types.js";

/** Parsed GA4 event — caller supplies id, pageId, timestamp to produce a full CapturedEvent. */
export type ParsedGa4Event = {
  transport: CapturedEvent["transport"];
  endpoint: string;
  tid: string;
  name: string;
  params: Record<string, unknown>;
  items: Record<string, unknown>[];
  raw: string;
};

/** Maps 2-char item prefix codes to human-readable GA4 item field names. */
const ITEM_PREFIX_MAP: Record<string, string> = {
  id: "item_id",
  nm: "item_name",
  pr: "price",
  qt: "quantity",
  ca: "item_category",
  br: "item_brand",
  va: "item_variant",
  ln: "item_list_name",
  li: "item_list_id",
  lp: "index",
  cp: "coupon",
  ds: "discount",
  af: "affiliation",
};

/** Standard (non-prefixed) params to extract into the params record. */
const STANDARD_PARAMS = ["cu", "cid", "sid", "dl", "dr", "dt", "ul", "sr"];

const GA4_COLLECT_RE = /\/g\/collect/;
const MP_COLLECT_RE = /\/mp\/collect/;
const GOOGLE_HOSTS = [
  "google-analytics.com",
  "analytics.google.com",
  "www.google-analytics.com",
];

/** Detects GA4 collect requests by query params (v=2 + tid=G-). Catches custom first-party proxies. */
const GA4_TID_RE = /[?&]tid=G-/;

/** Returns true if the URL looks like a GA4 data collection endpoint. */
export function isGa4Endpoint(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (GA4_COLLECT_RE.test(parsed.pathname)) return true;
    if (MP_COLLECT_RE.test(parsed.pathname)) return true;
    // Detect first-party proxies with non-standard paths but GA4 query params (tid=G-*)
    if (GA4_TID_RE.test(url)) return true;
    return false;
  } catch {
    return false;
  }
}

/** Classifies the transport type from the request URL. */
function detectTransport(url: string): CapturedEvent["transport"] {
  try {
    const parsed = new URL(url);

    if (MP_COLLECT_RE.test(parsed.pathname)) return "ga4-mp";

    if (GA4_COLLECT_RE.test(parsed.pathname)) {
      const isGoogle = GOOGLE_HOSTS.some(
        (h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`),
      );
      return isGoogle ? "ga4-collect" : "first-party";
    }

    if (parsed.hostname.includes("googletagmanager.com")) return "gtm";

    return "first-party";
  } catch {
    return "first-party";
  }
}

/**
 * URL-decodes a string but never throws — falls back to the raw input if
 * the input has invalid percent-encoding. Real-world GA4 payloads sometimes
 * contain malformed escapes (e.g. unescaped `%` characters in product names),
 * and we don't want a single bad item to crash the whole audit pipeline.
 */
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Parses a single tilde-separated item string (e.g. "id12345~nmBlue+Widget~pr49.99~qt1").
 * Handles nested categories (ca2, ca3, etc.) and numeric coercion for price/quantity/index.
 */
function parseSingleItem(encoded: string): Record<string, unknown> {
  const item: Record<string, unknown> = {};
  const segments = encoded.split("~");

  for (const segment of segments) {
    if (!segment) continue;

    // Try 3-char prefixes first (ca2, ca3, ca4, ca5)
    const threeCharPrefix = segment.slice(0, 3);
    const threeCharMatch = /^ca([2-5])$/.exec(threeCharPrefix);
    if (threeCharMatch) {
      const value = safeDecode(segment.slice(3).replace(/\+/g, " "));
      item[`item_category${threeCharMatch[1]}`] = value;
      continue;
    }

    // Try 2-char prefix
    const prefix = segment.slice(0, 2);
    const fieldName = ITEM_PREFIX_MAP[prefix];
    if (fieldName) {
      const rawValue = safeDecode(segment.slice(2).replace(/\+/g, " "));
      item[fieldName] = coerceNumeric(prefix, rawValue);
      continue;
    }

    // Unknown prefix — store raw with the prefix as key
    item[prefix] = safeDecode(segment.slice(2).replace(/\+/g, " "));
  }

  return item;
}

/** Coerce known-numeric item fields to numbers. */
function coerceNumeric(prefix: string, value: string): unknown {
  if (prefix === "pr" || prefix === "qt" || prefix === "lp" || prefix === "ds") {
    const num = parseFloat(value);
    return Number.isNaN(num) ? value : num;
  }
  return value;
}

/** Extracts pr1..prN items from URLSearchParams. */
function parseItems(params: URLSearchParams): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];
  for (let i = 1; i <= 200; i++) {
    const raw = params.get(`pr${i}`);
    if (raw === null) break;
    items.push(parseSingleItem(raw));
  }
  return items;
}

/** Extracts ep.*, epn.*, and standard params from URLSearchParams. */
function parseEventParams(params: URLSearchParams): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of params.entries()) {
    if (key.startsWith("ep.")) {
      result[key.slice(3)] = value;
    } else if (key.startsWith("epn.")) {
      const num = parseFloat(value);
      result[key.slice(4)] = Number.isNaN(num) ? value : num;
    }
  }

  // Include standard params
  for (const key of STANDARD_PARAMS) {
    const value = params.get(key);
    if (value !== null) {
      result[key] = value;
    }
  }

  return result;
}

/** Parses a single /g/collect payload line (URL-encoded query string format). */
function parseCollectPayload(
  queryString: string,
  baseParams?: URLSearchParams,
): ParsedGa4Event {
  const lineParams = new URLSearchParams(queryString);

  // Merge base (URL-level) params with line-level params. Line overrides base.
  const merged = new URLSearchParams();
  if (baseParams) {
    for (const [k, v] of baseParams.entries()) {
      merged.set(k, v);
    }
  }
  for (const [k, v] of lineParams.entries()) {
    merged.set(k, v);
  }

  return {
    transport: "ga4-collect", // Will be overridden by caller
    endpoint: "",             // Will be overridden by caller
    tid: merged.get("tid") ?? "",
    name: merged.get("en") ?? "",
    params: parseEventParams(merged),
    items: parseItems(merged),
    raw: queryString,
  };
}

/** Parses /mp/collect JSON body. Returns one ParsedGa4Event per event in the payload. */
function parseMpPayload(jsonBody: string, url: string): ParsedGa4Event[] {
  try {
    const parsed = new URL(url);
    const measurementId = parsed.searchParams.get("measurement_id") ?? "";

    const body = JSON.parse(jsonBody) as {
      client_id?: string;
      events?: Array<{
        name?: string;
        params?: Record<string, unknown>;
      }>;
    };

    if (!body.events || !Array.isArray(body.events)) return [];

    return body.events.map((event) => {
      const params: Record<string, unknown> = { ...event.params };
      const items: Record<string, unknown>[] = [];

      // Extract items from params if present
      if (Array.isArray(params["items"])) {
        for (const item of params["items"] as Record<string, unknown>[]) {
          items.push({ ...item });
        }
        delete params["items"];
      }

      if (body.client_id) {
        params["cid"] = body.client_id;
      }

      return {
        transport: "ga4-mp" as const,
        endpoint: url,
        tid: measurementId,
        name: event.name ?? "",
        params,
        items,
        raw: jsonBody,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Main parser entry point. Takes a request URL and optional POST body,
 * returns an array of parsed GA4 events (array because batched requests
 * produce multiple events).
 */
export function parseGa4Request(
  url: string,
  postBody?: string,
): ParsedGa4Event[] {
  if (!isGa4Endpoint(url)) return [];

  const transport = detectTransport(url);

  // Measurement Protocol (JSON body)
  if (transport === "ga4-mp" && postBody) {
    const events = parseMpPayload(postBody, url);
    return events.map((e) => ({ ...e, transport }));
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return [];
  }

  // POST body with batched events (newline-separated URL-encoded payloads)
  if (postBody) {
    const lines = postBody.split(/\r?\n/).filter((line) => line.trim());
    const baseParams = parsed.searchParams;

    return lines.map((line) => {
      const event = parseCollectPayload(line, baseParams);
      return {
        ...event,
        transport,
        endpoint: url,
        raw: line,
      };
    });
  }

  // GET request — all params in the query string
  const event = parseCollectPayload(parsed.search.slice(1));
  return [
    {
      ...event,
      transport,
      endpoint: url,
      raw: parsed.search.slice(1),
    },
  ];
}
