/**
 * In-browser network capture script.
 * Injects into the page to monkey-patch fetch/sendBeacon/XHR and capture
 * all outgoing requests. This is more reliable than external CDP listeners
 * because it runs inside the browser context regardless of connection state.
 */

/** Script to inject into the browser via page.evaluate or addInitScript. */
export const CAPTURE_INIT_SCRIPT = `
(function() {
  if (window.__ga4_captures) return; // Already injected
  window.__ga4_captures = [];

  // Patch fetch
  const origFetch = window.fetch;
  window.fetch = function(input, init) {
    try {
      const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));
      const body = init?.body ? String(init.body) : undefined;
      window.__ga4_captures.push({ url, body, method: init?.method || 'GET', type: 'fetch', ts: Date.now() });
    } catch(e) {}
    return origFetch.apply(this, arguments);
  };

  // Patch sendBeacon
  if (navigator.sendBeacon) {
    const origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function(url, data) {
      try {
        window.__ga4_captures.push({ url: String(url), body: data ? String(data) : undefined, method: 'POST', type: 'beacon', ts: Date.now() });
      } catch(e) {}
      return origBeacon(url, data);
    };
  }

  // Patch XMLHttpRequest
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this.__capturedUrl = String(url);
    this.__capturedMethod = method;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function(body) {
    try {
      if (this.__capturedUrl) {
        window.__ga4_captures.push({ url: this.__capturedUrl, body: body ? String(body) : undefined, method: this.__capturedMethod || 'GET', type: 'xhr', ts: Date.now() });
      }
    } catch(e) {}
    return origSend.apply(this, arguments);
  };

  // Capture image pixel requests (new Image().src = ...)
  const origImage = window.Image;
  window.Image = function() {
    const img = new origImage();
    const origSrcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (origSrcDesc && origSrcDesc.set) {
      Object.defineProperty(img, 'src', {
        set: function(val) {
          try {
            window.__ga4_captures.push({ url: String(val), body: undefined, method: 'GET', type: 'pixel', ts: Date.now() });
          } catch(e) {}
          origSrcDesc.set.call(this, val);
        },
        get: function() {
          return origSrcDesc.get ? origSrcDesc.get.call(this) : '';
        }
      });
    }
    return img;
  };
  window.Image.prototype = origImage.prototype;
})();
`;

export type BrowserCapture = {
  url: string;
  body?: string;
  method: string;
  type: string;
  ts: number;
};

/**
 * Reads captured requests from the browser and clears the buffer.
 * Returns only new captures since last read.
 */
export async function drainCaptures(
  page: { evaluate: (fn: string | (() => unknown)) => Promise<unknown> },
): Promise<BrowserCapture[]> {
  try {
    const captures = (await page.evaluate(`
      (function() {
        const c = window.__ga4_captures || [];
        window.__ga4_captures = [];
        return c;
      })()
    `)) as BrowserCapture[];
    return captures;
  } catch {
    return [];
  }
}
