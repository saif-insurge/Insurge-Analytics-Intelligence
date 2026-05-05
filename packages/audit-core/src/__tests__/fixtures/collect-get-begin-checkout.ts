/** begin_checkout with multiple items, coupon, currency, value. Complex real-world payload. */
export const fixture = {
  description: "GET /g/collect — begin_checkout with multiple items and coupon",
  url: "https://www.google-analytics.com/g/collect?v=2&tid=G-SHOP001&cid=shop.user.42&sid=777&en=begin_checkout&ep.currency=EUR&epn.value=259.97&ep.coupon=WELCOME15&cu=EUR&pr1=idJKT-100~nmWinter+Jacket~pr149.99~qt1~caClothing~ca2Outerwear~brNorthFace~vaBlack+XL~cpWELCOME15~ds22.50&pr2=idGLV-200~nmSki+Gloves~pr59.99~qt1~caAccessories~ca2Winter~brBlackDiamond~vaMedium&pr3=idBNE-300~nmBeanie+Hat~pr24.99~qt2~caAccessories~ca2Winter~brPatagonia~vaGrey",
  postBody: undefined,
  expected: {
    eventCount: 1,
    events: [
      {
        name: "begin_checkout",
        tid: "G-SHOP001",
        transport: "ga4-collect" as const,
        params: {
          currency: "EUR",
          value: 259.97,
          coupon: "WELCOME15",
          cu: "EUR",
          cid: "shop.user.42",
          sid: "777",
        },
        items: [
          {
            item_id: "JKT-100",
            item_name: "Winter Jacket",
            price: 149.99,
            quantity: 1,
            item_category: "Clothing",
            item_category2: "Outerwear",
            item_brand: "NorthFace",
            item_variant: "Black XL",
            coupon: "WELCOME15",
            discount: 22.5,
          },
          {
            item_id: "GLV-200",
            item_name: "Ski Gloves",
            price: 59.99,
            quantity: 1,
            item_category: "Accessories",
            item_category2: "Winter",
            item_brand: "BlackDiamond",
            item_variant: "Medium",
          },
          {
            item_id: "BNE-300",
            item_name: "Beanie Hat",
            price: 24.99,
            quantity: 2,
            item_category: "Accessories",
            item_category2: "Winter",
            item_brand: "Patagonia",
            item_variant: "Grey",
          },
        ],
      },
    ],
  },
};
