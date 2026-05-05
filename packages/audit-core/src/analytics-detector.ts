/**
 * Detects analytics platforms and CDPs from network request URLs.
 * Goes beyond GA4 to identify Rudderstack, Segment, Mixpanel, Facebook Pixel, etc.
 */

export type DetectedPlatform = {
  name: string;
  category: "cdp" | "analytics" | "ads" | "pixel" | "tag_manager";
  /** Number of requests matched. */
  requestCount: number;
  /** Sample URLs (first 3). */
  sampleUrls: string[];
  /** Event names detected (if parseable). */
  detectedEvents: string[];
};

type PlatformPattern = {
  name: string;
  category: DetectedPlatform["category"];
  patterns: RegExp[];
  /** Optional: extract event name from URL. */
  extractEvent?: (url: string) => string | null;
};

const PLATFORM_PATTERNS: PlatformPattern[] = [
  // ─── CDPs ──────────────────────────────────────────────────────────
  {
    name: "Rudderstack",
    category: "cdp",
    patterns: [/rudderstack\.com/i, /dataplane\.rudderstack/i, /rudder\./i, /\/v1\/track/i, /\/v1\/page/i, /\/v1\/identify/i],
    extractEvent: (url) => {
      const match = url.match(/\/v1\/(track|page|identify|group|alias)/);
      return match?.[1] ?? null;
    },
  },
  {
    name: "Segment",
    category: "cdp",
    patterns: [/api\.segment\.io/i, /cdn\.segment\.com/i, /analytics\.js/i],
    extractEvent: (url) => {
      const match = url.match(/\/v1\/(t|p|i|track|page|identify)/);
      return match?.[1] ?? null;
    },
  },
  {
    name: "mParticle",
    category: "cdp",
    patterns: [/mparticle\.com/i, /jssdks\.mparticle/i],
  },

  // ─── Analytics ─────────────────────────────────────────────────────
  {
    name: "Mixpanel",
    category: "analytics",
    patterns: [/api\.mixpanel\.com/i, /api-js\.mixpanel\.com/i, /mixpanel\.com\/track/i],
  },
  {
    name: "Amplitude",
    category: "analytics",
    patterns: [/api\.amplitude\.com/i, /api2\.amplitude\.com/i, /cdn\.amplitude\.com/i],
  },
  {
    name: "Heap",
    category: "analytics",
    patterns: [/heapanalytics\.com/i, /heap-api/i],
  },
  {
    name: "Posthog",
    category: "analytics",
    patterns: [/posthog\.com/i, /app\.posthog\.com/i, /\/e\?ip=1/i],
  },
  {
    name: "Hotjar",
    category: "analytics",
    patterns: [/hotjar\.com/i, /static\.hotjar\.com/i, /vars\.hotjar\.com/i],
  },
  {
    name: "Clarity",
    category: "analytics",
    patterns: [/clarity\.ms/i, /www\.clarity\.ms/i],
  },
  {
    name: "Plausible",
    category: "analytics",
    patterns: [/plausible\.io\/api/i],
  },

  // ─── Ad Pixels ─────────────────────────────────────────────────────
  {
    name: "Meta Pixel",
    category: "pixel",
    patterns: [/facebook\.com\/tr/i, /connect\.facebook\.net.*fbevents/i, /facebook\.com\/signals/i],
    extractEvent: (url) => {
      const match = url.match(/[?&]ev=([^&]+)/);
      return match?.[1] ? decodeURIComponent(match[1]) : null;
    },
  },
  {
    name: "TikTok Pixel",
    category: "pixel",
    patterns: [/analytics\.tiktok\.com/i, /tiktok\.com\/i18n/i],
  },
  {
    name: "Pinterest Tag",
    category: "pixel",
    patterns: [/ct\.pinterest\.com/i, /pintrk/i],
  },
  {
    name: "Snapchat Pixel",
    category: "pixel",
    patterns: [/sc-static\.net.*scevent/i, /tr\.snapchat\.com/i],
  },
  {
    name: "Twitter/X Pixel",
    category: "pixel",
    patterns: [/analytics\.twitter\.com/i, /static\.ads-twitter\.com/i, /t\.co\/i\/adsct/i],
  },
  {
    name: "LinkedIn Insight",
    category: "pixel",
    patterns: [/snap\.licdn\.com/i, /linkedin\.com\/px/i, /dc\.ads\.linkedin/i],
  },
  {
    name: "Google Ads",
    category: "ads",
    patterns: [/googleads\.g\.doubleclick\.net/i, /pagead\/conversion/i, /google\.com\/pagead/i],
    extractEvent: (url) => {
      if (url.includes("conversion")) return "conversion";
      if (url.includes("remarketing")) return "remarketing";
      return null;
    },
  },
  {
    name: "Microsoft/Bing Ads",
    category: "ads",
    patterns: [/bat\.bing\.com/i, /clarity\.ms.*collect/i],
  },
  {
    name: "Criteo",
    category: "ads",
    patterns: [/dis\.criteo\.com/i, /static\.criteo\.net/i],
  },
  {
    name: "Taboola",
    category: "ads",
    patterns: [/trc\.taboola\.com/i, /cdn\.taboola\.com/i],
  },

  // ─── Tag Managers ──────────────────────────────────────────────────
  {
    name: "Google Tag Manager",
    category: "tag_manager",
    patterns: [/googletagmanager\.com\/gtm\.js/i, /googletagmanager\.com\/gtag/i],
  },
  {
    name: "Tealium",
    category: "tag_manager",
    patterns: [/tags\.tiqcdn\.com/i, /tealium\.com/i],
  },
];

/** Analyze a list of request URLs and detect analytics platforms. */
export function detectAnalyticsPlatforms(urls: string[]): DetectedPlatform[] {
  const results = new Map<string, DetectedPlatform>();

  for (const url of urls) {
    for (const platform of PLATFORM_PATTERNS) {
      if (platform.patterns.some((p) => p.test(url))) {
        const existing = results.get(platform.name) ?? {
          name: platform.name,
          category: platform.category,
          requestCount: 0,
          sampleUrls: [],
          detectedEvents: [],
        };

        existing.requestCount++;
        if (existing.sampleUrls.length < 3) {
          existing.sampleUrls.push(url.slice(0, 200));
        }

        if (platform.extractEvent) {
          const event = platform.extractEvent(url);
          if (event && !existing.detectedEvents.includes(event)) {
            existing.detectedEvents.push(event);
          }
        }

        results.set(platform.name, existing);
      }
    }
  }

  return [...results.values()].sort((a, b) => b.requestCount - a.requestCount);
}
