/** view_item_list event with 4 products. */
export const fixture = {
  description: "GET /g/collect — view_item_list with 4 products",
  url: "https://www.google-analytics.com/g/collect?v=2&tid=G-TEST12345&cid=abc.123&sid=999&en=view_item_list&ep.item_list_name=Search+Results&ep.currency=USD&pr1=idSKU001~nmRunning+Shoe~pr89.99~qt1~caShoes~brNike~lnSearch+Results~lp0&pr2=idSKU002~nmTrail+Shoe~pr109.99~qt1~caShoes~brSalomon~lnSearch+Results~lp1&pr3=idSKU003~nmCasual+Sneaker~pr59.99~qt1~caShoes~brAdidas~lnSearch+Results~lp2&pr4=idSKU004~nmHiking+Boot~pr149.99~qt1~caShoes~brMerrell~lnSearch+Results~lp3",
  postBody: undefined,
  expected: {
    eventCount: 1,
    events: [
      {
        name: "view_item_list",
        tid: "G-TEST12345",
        transport: "ga4-collect" as const,
        params: {
          item_list_name: "Search Results",
          currency: "USD",
        },
        items: [
          {
            item_id: "SKU001",
            item_name: "Running Shoe",
            price: 89.99,
            quantity: 1,
            item_category: "Shoes",
            item_brand: "Nike",
            item_list_name: "Search Results",
            index: 0,
          },
          {
            item_id: "SKU002",
            item_name: "Trail Shoe",
            price: 109.99,
            quantity: 1,
            item_category: "Shoes",
            item_brand: "Salomon",
            item_list_name: "Search Results",
            index: 1,
          },
          {
            item_id: "SKU003",
            item_name: "Casual Sneaker",
            price: 59.99,
            quantity: 1,
            item_category: "Shoes",
            item_brand: "Adidas",
            item_list_name: "Search Results",
            index: 2,
          },
          {
            item_id: "SKU004",
            item_name: "Hiking Boot",
            price: 149.99,
            quantity: 1,
            item_category: "Shoes",
            item_brand: "Merrell",
            item_list_name: "Search Results",
            index: 3,
          },
        ],
      },
    ],
  },
};
