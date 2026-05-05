/** Request via a custom first-party proxy with non-standard path but GA4 query params. */
export const fixture = {
  description: "GET custom proxy — non-standard path with GA4 query params (e.g. Kapiva-style)",
  url: "https://example.com/kpvgtg/ag/g/c?v=2&tid=G-PROXY01&gtm=45g92e64&_p=123&cid=999.111&sid=500&en=view_item&ep.currency=INR&epn.value=1239&pr1=idSHILAJIT-01~nmShilajit+Gold+Resin~pr1239~qt1~caAyurveda~brKapiva",
  postBody: undefined,
  expected: {
    eventCount: 1,
    events: [
      {
        name: "view_item",
        tid: "G-PROXY01",
        transport: "first-party" as const,
        params: {
          currency: "INR",
          value: 1239,
          cid: "999.111",
          sid: "500",
        },
        items: [
          {
            item_id: "SHILAJIT-01",
            item_name: "Shilajit Gold Resin",
            price: 1239,
            quantity: 1,
            item_category: "Ayurveda",
            item_brand: "Kapiva",
          },
        ],
      },
    ],
  },
};
