/** Item with nested categories (ca, ca2, ca3, ca4). */
export const fixture = {
  description: "GET /g/collect — item with nested category levels",
  url: "https://www.google-analytics.com/g/collect?v=2&tid=G-CAT001&cid=cat.test&sid=300&en=view_item&pr1=idSHOE-99~nmTrail+Runner+Pro~pr129.99~qt1~caClothing~ca2Shoes~ca3Running~ca4Trail~brSalomon~vaBlack%2FRed",
  postBody: undefined,
  expected: {
    eventCount: 1,
    events: [
      {
        name: "view_item",
        tid: "G-CAT001",
        transport: "ga4-collect" as const,
        items: [
          {
            item_id: "SHOE-99",
            item_name: "Trail Runner Pro",
            price: 129.99,
            quantity: 1,
            item_category: "Clothing",
            item_category2: "Shoes",
            item_category3: "Running",
            item_category4: "Trail",
            item_brand: "Salomon",
            item_variant: "Black/Red",
          },
        ],
      },
    ],
  },
};
