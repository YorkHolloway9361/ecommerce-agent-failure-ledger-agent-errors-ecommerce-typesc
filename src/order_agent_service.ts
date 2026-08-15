import { createServer } from "node:http";
import { z } from "zod";
import { InfraiError } from "./infrai_errors.js";
import { runOrderAgent, type OrderRequest, type OrderTools } from "./order_workflow.js";

const orderSchema = z.object({
  orderId: z.string().min(1),
  customerId: z.string().min(1),
  email: z.string().email(),
  items: z.array(z.object({ sku: z.string().min(1), quantity: z.number().int().positive() })).min(1),
  currency: z.string().length(3),
  total: z.number().nonnegative(),
});

const tools: OrderTools = {
  checkout: async () => undefined,
  fulfillment: async () => undefined,
  receipt: async () => undefined,
  customer_update: async () => undefined,
};

function send(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/orders/run") {
    send(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const parsed = orderSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!parsed.success) {
      send(response, 400, { error: "Invalid order", issues: parsed.error.issues });
      return;
    }
    send(response, 200, await runOrderAgent(parsed.data as OrderRequest, tools));
  } catch (error) {
    if (error instanceof SyntaxError) send(response, 400, { error: "Request body must be JSON" });
    else if (error instanceof InfraiError && error.status < 500) send(response, error.status, { error: error.message });
    else send(response, 500, { error: "Order agent run failed" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Order agent listening on http://localhost:${port}`));
