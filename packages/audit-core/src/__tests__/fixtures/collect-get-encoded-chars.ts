/** Event with URL-encoded special characters in item names. */
export const fixture = {
  description: "GET /g/collect — URL-encoded special chars in item fields",
  url: "https://www.google-analytics.com/g/collect?v=2&tid=G-ENC001&cid=enc.test&sid=200&en=view_item&pr1=idSPEC%26001~nmM%C3%B6bius+Strip+%26+Klein+Bottle~pr99.00~qt1~caMath+%26+Science~brT%C3%B6pfer",
  postBody: undefined,
  expected: {
    eventCount: 1,
    events: [
      {
        name: "view_item",
        tid: "G-ENC001",
        transport: "ga4-collect" as const,
        items: [
          {
            item_id: "SPEC&001",
            item_name: "Möbius Strip & Klein Bottle",
            price: 99.0,
            quantity: 1,
            item_category: "Math & Science",
            item_brand: "Töpfer",
          },
        ],
      },
    ],
  },
};
