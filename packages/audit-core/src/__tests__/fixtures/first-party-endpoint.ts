/** Request to a first-party (non-Google) domain proxying /g/collect. */
export const fixture = {
  description: "GET first-party proxy — non-Google domain with /g/collect path",
  url: "https://analytics.myshop.com/g/collect?v=2&tid=G-FP001&cid=fp.client&sid=400&en=view_item&pr1=idFP-01~nmFirst+Party+Product~pr39.99~qt1~caGeneral",
  postBody: undefined,
  expected: {
    eventCount: 1,
    events: [
      {
        name: "view_item",
        tid: "G-FP001",
        transport: "first-party" as const,
        items: [
          {
            item_id: "FP-01",
            item_name: "First Party Product",
            price: 39.99,
            quantity: 1,
            item_category: "General",
          },
        ],
      },
    ],
  },
};
