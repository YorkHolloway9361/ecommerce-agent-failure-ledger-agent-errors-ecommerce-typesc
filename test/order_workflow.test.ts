import assert from "node:assert/strict";
import test from "node:test";
import type { CaptureInput } from "../src/infrai_errors.js";
import { runOrderAgent, type OrderTools } from "../src/order_workflow.js";

test("a receipt failure records the decision boundary and stops later order updates", async () => {
  const calls: string[] = [];
  const captures: CaptureInput[] = [];
  const tools: OrderTools = {
    checkout: async () => { calls.push("checkout"); },
    fulfillment: async () => { calls.push("fulfillment"); },
    receipt: async () => { calls.push("receipt"); throw new Error("receipt provider rejected the address"); },
    customer_update: async () => { calls.push("customer_update"); },
  };

  await assert.rejects(
    runOrderAgent(
      {
        orderId: "ord_42",
        customerId: "cus_9",
        email: "buyer@example.com",
        items: [{ sku: "mug", quantity: 2 }],
        currency: "USD",
        total: 24,
      },
      tools,
      async (input) => { captures.push(input); },
      2,
    ),
    /receipt provider rejected the address/,
  );

  assert.deepEqual(calls, ["checkout", "fulfillment", "receipt"]);
  assert.equal(captures.length, 1);
  assert.deepEqual(captures[0].fingerprint, ["order-agent", "receipt"]);
  assert.deepEqual(captures[0].context, {
    order_id: "ord_42",
    customer_id: "cus_9",
    stage: "receipt",
    state_before_failure: "fulfilled",
    attempt: 2,
  });
  assert.equal(captures[0].idempotency_key.length, 64);
});
