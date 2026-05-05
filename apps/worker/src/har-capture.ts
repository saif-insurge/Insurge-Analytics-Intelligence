/**
 * HAR (HTTP Archive) capture during audit browser sessions.
 * Records all network requests/responses for analysis.
 */

export type HarEntry = {
  url: string;
  method: string;
  status?: number;
  mimeType?: string;
  requestHeaders?: Record<string, string>;
  postData?: string;
  responseSize?: number;
  timestamp: string;
};

export type HarCapture = {
  entries: HarEntry[];
  startTime: string;
  endTime?: string;
};

export function createHarCapture(): HarCapture {
  return {
    entries: [],
    startTime: new Date().toISOString(),
  };
}

/** Create a route handler that captures all requests into a HAR. */
export function createHarRouteHandler(har: HarCapture) {
  return async (route: {
    request: () => {
      url: () => string;
      method: () => string;
      headers: () => Record<string, string>;
      postData: () => string | null;
    };
    continue: () => Promise<void>;
  }) => {
    const req = route.request();
    har.entries.push({
      url: req.url(),
      method: req.method(),
      postData: req.postData() ?? undefined,
      timestamp: new Date().toISOString(),
    });
    await route.continue();
  };
}

/** Finalize the HAR capture. */
export function finalizeHar(har: HarCapture): HarCapture {
  har.endTime = new Date().toISOString();
  return har;
}

/** Strip sensitive headers from HAR entries before storage. */
export function sanitizeHar(har: HarCapture): HarCapture {
  const sensitiveHeaders = ["cookie", "authorization", "x-api-key", "set-cookie"];
  return {
    ...har,
    entries: har.entries.map((entry) => {
      if (!entry.requestHeaders) return entry;
      const cleaned = { ...entry.requestHeaders };
      for (const key of sensitiveHeaders) {
        delete cleaned[key];
      }
      return { ...entry, requestHeaders: cleaned };
    }),
  };
}
