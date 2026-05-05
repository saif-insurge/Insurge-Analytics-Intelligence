/** Simple page_view event via GET to /g/collect. No items. */
export const fixture = {
  description: "GET /g/collect — page_view with basic params, no items",
  url: "https://www.google-analytics.com/g/collect?v=2&tid=G-TEST12345&gtm=45je4a&_p=12345&cid=1234567890.1234567890&ul=en-us&sr=1920x1080&dl=https%3A%2F%2Fexample.com%2F&dr=https%3A%2F%2Fgoogle.com&dt=Example%20Store%20-%20Home&sid=1717000000&en=page_view&ep.page_type=home&epn.engagement_time_msec=100",
  postBody: undefined,
  expected: {
    eventCount: 1,
    events: [
      {
        name: "page_view",
        tid: "G-TEST12345",
        transport: "ga4-collect" as const,
        params: {
          page_type: "home",
          engagement_time_msec: 100,
          cid: "1234567890.1234567890",
          sid: "1717000000",
          dl: "https://example.com/",
          dr: "https://google.com",
          dt: "Example Store - Home",
          ul: "en-us",
          sr: "1920x1080",
        },
        itemCount: 0,
      },
    ],
  },
};
