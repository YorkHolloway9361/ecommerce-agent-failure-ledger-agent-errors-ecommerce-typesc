import { createHash } from "node:crypto";
import { infrai, type CaptureInput } from "./infrai_errors.js";

export type OrderRequest = {
  orderId: string;
  customerId: string;
  email: string;
  items: Array<{ sku: string; quantity: number }>;
  currency: string;
  total: number;
};

export type Stage = "checkout" | "fulfillment" | "receipt" | "customer_update";
export type OrderState = "received" | "paid" | "fulfilled" | "receipt_sent" | "customer_notified";
export type StageResult = { orderId: string; state: OrderState; completed: Stage[] };

export type OrderTools = {
  checkout(order: OrderRequest): Promise<void>;
  fulfillment(order: OrderRequest): Promise<void>;
  receipt(order: OrderRequest): Promise<void>;
  customer_update(order: OrderRequest): Promise<void>;
};

export type ErrorReporter = (input: CaptureInput) => Promise<unknown>;

const transitions: Array<{ stage: Stage; state: OrderState }> = [
  { stage: "checkout", state: "paid" },
  { stage: "fulfillment", state: "fulfilled" },
  { stage: "receipt", state: "receipt_sent" },
  { stage: "customer_update", state: "customer_notified" },
];

function captureId(orderId: string, stage: Stage, attempt: number): string {
  return createHash("sha256").update(`${orderId}:${stage}:${attempt}`).digest("hex");
}

export async function runOrderAgent(
  order: OrderRequest,
  tools: OrderTools,
  report: ErrorReporter = infrai.errors.capture,
  attempt = 1,
): Promise<StageResult> {
  let state: OrderState = "received";
  const completed: Stage[] = [];

  for (const transition of transitions) {
    try {
      await tools[transition.stage](order);
      completed.push(transition.stage);
      state = transition.state;
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      await report({
        title: `Order agent ${transition.stage} failed`,
        message: error.message,
        exception: error.stack ?? `${error.name}: ${error.message}`,
        level: "error",
        fingerprint: ["order-agent", transition.stage],
        context: {
          order_id: order.orderId,
          customer_id: order.customerId,
          stage: transition.stage,
          state_before_failure: state,
          attempt,
        },
        service: "ecommerce-order-agent",
        idempotency_key: captureId(order.orderId, transition.stage, attempt),
      });
      throw error;
    }
  }

  return { orderId: order.orderId, state, completed };
}
