import type { DetectedPlatformData } from "./types";

const STANDARD_EVENTS: Record<string, string[]> = {
  "Meta Pixel": ["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "AddPaymentInfo", "Purchase", "Lead", "CompleteRegistration", "Search"],
  "TikTok Pixel": ["ViewContent", "AddToCart", "PlaceAnOrder", "CompletePayment", "ClickButton", "SubmitForm", "Download"],
  "Snapchat Pixel": ["PAGE_VIEW", "VIEW_CONTENT", "ADD_CART", "START_CHECKOUT", "PURCHASE", "SIGN_UP"],
  "Pinterest Tag": ["pagevisit", "viewcategory", "addtocart", "checkout", "lead", "signup"],
  "Google Ads": ["conversion", "remarketing", "view_through_conversion"],
  "Twitter/X Pixel": ["PageView", "Purchase", "Download", "SignUp", "AddToCart"],
  "LinkedIn Insight": ["conversion"],
  "Microsoft/Bing Ads": ["pageLoad", "conversion"],
};

export function AdPixelsSection({ platforms }: { platforms: DetectedPlatformData[] }) {
  const adPlatforms = platforms.filter((p) => p.category === "pixel" || p.category === "ads");
  if (adPlatforms.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="font-display text-xl font-semibold mb-4">Ad Pixels & Conversion Tracking</h2>
      <div className="space-y-3">
        {adPlatforms.map((platform) => {
          const expected = STANDARD_EVENTS[platform.name] ?? [];
          const detected = platform.detectedEvents;
          const missing = expected.filter((e) => !detected.includes(e));

          return (
            <div key={platform.name} className="glass rounded-lg p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className={`w-2 h-2 rounded-full ${platform.requestCount > 0 ? "bg-success" : "bg-danger"}`} />
                  <h3 className="text-sm font-semibold">{platform.name}</h3>
                  <span className="text-[10px] px-2 py-0.5 bg-success/10 text-success border border-success/20 rounded-full">
                    Active — {platform.requestCount} requests
                  </span>
                </div>
              </div>

              {detected.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs text-text-muted mb-1.5">Events Detected</div>
                  <div className="flex flex-wrap gap-1.5">
                    {detected.map((event) => (
                      <span key={event} className="text-xs px-2 py-0.5 bg-success/10 text-success border border-success/20 rounded font-mono">
                        {event}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {missing.length > 0 && detected.length > 0 && (
                <div>
                  <div className="text-xs text-text-muted mb-1.5">Standard Events Not Detected</div>
                  <div className="flex flex-wrap gap-1.5">
                    {missing.map((event) => (
                      <span key={event} className="text-xs px-2 py-0.5 bg-bg-subtle text-text-faint border border-border-subtle rounded font-mono">
                        {event}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {detected.length === 0 && (
                <div className="text-xs text-text-faint">
                  Pixel is loading but no specific events were captured during the audit. Events may fire on interaction or be sent server-side.
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Platforms NOT detected */}
      {(() => {
        const majorPixels = ["Meta Pixel", "Google Ads", "TikTok Pixel", "Snapchat Pixel", "Pinterest Tag"];
        const detectedNames = new Set(adPlatforms.map((p) => p.name));
        const notDetected = majorPixels.filter((p) => !detectedNames.has(p));
        if (notDetected.length === 0) return null;
        return (
          <div className="mt-3 glass rounded-lg p-3 sm:p-4">
            <div className="text-xs text-text-muted mb-2">Not Detected</div>
            <div className="flex flex-wrap gap-2">
              {notDetected.map((name) => (
                <span key={name} className="text-xs px-2 py-1 bg-bg-subtle text-text-faint border border-border-subtle rounded">
                  {name}
                </span>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
