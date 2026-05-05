/** POST to /mp/collect with JSON body containing 2 events. */
export const fixture = {
  description: "POST /mp/collect — JSON body with 2 events and items",
  url: "https://www.google-analytics.com/mp/collect?measurement_id=G-MP001&api_secret=test_secret",
  postBody: JSON.stringify({
    client_id: "mp-client-123",
    events: [
      {
        name: "purchase",
        params: {
          currency: "USD",
          transaction_id: "TXN-9876",
          value: 179.98,
          shipping: 9.99,
          tax: 14.40,
          items: [
            {
              item_id: "SKU-A",
              item_name: "Running Shoes",
              price: 89.99,
              quantity: 2,
              item_category: "Footwear",
              item_brand: "Nike",
            },
          ],
        },
      },
      {
        name: "add_shipping_info",
        params: {
          currency: "USD",
          value: 179.98,
          shipping_tier: "Ground",
          items: [
            {
              item_id: "SKU-A",
              item_name: "Running Shoes",
              price: 89.99,
              quantity: 2,
            },
          ],
        },
      },
    ],
  }),
  expected: {
    eventCount: 2,
    events: [
      {
        name: "purchase",
        tid: "G-MP001",
        transport: "ga4-mp" as const,
        params: {
          currency: "USD",
          transaction_id: "TXN-9876",
          value: 179.98,
          shipping: 9.99,
          tax: 14.40,
          cid: "mp-client-123",
        },
        items: [
          {
            item_id: "SKU-A",
            item_name: "Running Shoes",
            price: 89.99,
            quantity: 2,
            item_category: "Footwear",
            item_brand: "Nike",
          },
        ],
      },
      {
        name: "add_shipping_info",
        tid: "G-MP001",
        transport: "ga4-mp" as const,
        params: {
          currency: "USD",
          value: 179.98,
          shipping_tier: "Ground",
          cid: "mp-client-123",
        },
        items: [
          {
            item_id: "SKU-A",
            item_name: "Running Shoes",
            price: 89.99,
            quantity: 2,
          },
        ],
      },
    ],
  },
};
