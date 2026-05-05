/** add_to_cart event with item, currency, value, and mixed ep/epn params. */
export const fixture = {
  description: "GET /g/collect — add_to_cart with ep.* and epn.* params",
  url: "https://www.google-analytics.com/g/collect?v=2&tid=G-SHOPIFY99&cid=aaa.bbb&sid=555&en=add_to_cart&ep.currency=GBP&epn.value=29.99&ep.page_location=https%3A%2F%2Fshop.example.com%2Fproducts%2Fwidget&ep.page_title=Widget+PDP&epn.engagement_time_msec=3200&cu=GBP&pr1=idWDG-001~nmSuper+Widget~pr29.99~qt2~caGadgets~ca2Home~brWidgetCo~vaRed~ds5.00~afOnline+Store",
  postBody: undefined,
  expected: {
    eventCount: 1,
    events: [
      {
        name: "add_to_cart",
        tid: "G-SHOPIFY99",
        transport: "ga4-collect" as const,
        params: {
          currency: "GBP",
          value: 29.99,
          page_location: "https://shop.example.com/products/widget",
          page_title: "Widget PDP",
          engagement_time_msec: 3200,
          cu: "GBP",
          cid: "aaa.bbb",
          sid: "555",
        },
        items: [
          {
            item_id: "WDG-001",
            item_name: "Super Widget",
            price: 29.99,
            quantity: 2,
            item_category: "Gadgets",
            item_category2: "Home",
            item_brand: "WidgetCo",
            item_variant: "Red",
            discount: 5.0,
            affiliation: "Online Store",
          },
        ],
      },
    ],
  },
};
