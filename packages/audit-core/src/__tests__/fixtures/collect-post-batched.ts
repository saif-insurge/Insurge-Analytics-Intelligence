/** POST to /g/collect with 3 batched events (newline-separated). */
export const fixture = {
  description: "POST /g/collect — 3 batched events in body",
  url: "https://www.google-analytics.com/g/collect?v=2&tid=G-BATCH001&cid=batch.client",
  postBody: [
    "en=page_view&ep.page_type=home&sid=100",
    "en=scroll&epn.percent_scrolled=90&sid=100",
    "en=view_item_list&ep.item_list_name=Featured&sid=100&pr1=idF01~nmFeatured+Product~pr19.99~qt1",
  ].join("\n"),
  expected: {
    eventCount: 3,
    events: [
      {
        name: "page_view",
        tid: "G-BATCH001",
        transport: "ga4-collect" as const,
        params: {
          page_type: "home",
          cid: "batch.client",
        },
      },
      {
        name: "scroll",
        tid: "G-BATCH001",
        transport: "ga4-collect" as const,
        params: {
          percent_scrolled: 90,
          cid: "batch.client",
        },
      },
      {
        name: "view_item_list",
        tid: "G-BATCH001",
        transport: "ga4-collect" as const,
        params: {
          item_list_name: "Featured",
          cid: "batch.client",
        },
        items: [
          {
            item_id: "F01",
            item_name: "Featured Product",
            price: 19.99,
            quantity: 1,
          },
        ],
      },
    ],
  },
};
