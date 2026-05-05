/** view_item event with one product item. */
export const fixture = {
  description: "GET /g/collect — view_item with single product",
  url: "https://www.google-analytics.com/g/collect?v=2&tid=G-TEST12345&cid=1234567890.1234567890&sid=1717000000&en=view_item&ep.currency=USD&epn.value=49.99&pr1=id12345~nmBlue+Widget~pr49.99~qt1~caElectronics~brAcme~vaLarge~cpSUMMER10",
  postBody: undefined,
  expected: {
    eventCount: 1,
    events: [
      {
        name: "view_item",
        tid: "G-TEST12345",
        transport: "ga4-collect" as const,
        params: {
          currency: "USD",
          value: 49.99,
          cid: "1234567890.1234567890",
          sid: "1717000000",
        },
        items: [
          {
            item_id: "12345",
            item_name: "Blue Widget",
            price: 49.99,
            quantity: 1,
            item_category: "Electronics",
            item_brand: "Acme",
            item_variant: "Large",
            coupon: "SUMMER10",
          },
        ],
      },
    ],
  },
};
