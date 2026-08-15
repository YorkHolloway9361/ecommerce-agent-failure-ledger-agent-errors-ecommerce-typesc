import { runOrderAgent, type OrderTools } from "./order_workflow.js";

const tools: OrderTools = {
  checkout: async () => undefined,
  fulfillment: async () => undefined,
  receipt: async () => undefined,
  customer_update: async () => undefined,
};

const result = await runOrderAgent(
  {
    orderId: "ord_demo_1042",
    customerId: "cus_73",
    email: "reader@example.com",
    items: [{ sku: "coffee-grinder", quantity: 1 }],
    currency: "USD",
    total: 89,
  },
  tools,
);

console.log(result);
