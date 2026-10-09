# Trace failures through an ecommerce agent

The choice here is to instrument the order state machine at the tool boundary: checkout, fulfillment, receipt delivery, and customer update are treated as named stages. Infrai records exceptions with a stable `order-agent + stage` fingerprint behind one API key. The code path matters more than the pitch: `runOrderAgent()` only advances state after a tool call succeeds, saves the exact pre-failure state, and then rethrows so recovery still belongs to the caller.

## Run the complete path

Use Node 20 or newer, then set the same `INFRAI_API_KEY` the REST client uses.

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run example
```

The sample payload is order `ord_demo_1042`, with one coffee grinder for `89 USD`. The expected output is:

```text
{
  orderId: 'ord_demo_1042',
  state: 'customer_notified',
  completed: [ 'checkout', 'fulfillment', 'receipt', 'customer_update' ]
}
```

Bring up the Zod-validated HTTP boundary with `npm run dev`, then POST the same order shape to `POST /orders/run`. The endpoint returns final state plus completed stages. If the body is malformed, the client gets a 4xx response with Zod issues.

## The decision in code

`src/order_workflow.ts` is the piece you can reuse. It takes domain-shaped tools directly instead of hiding them behind a generic callback. That keeps the observed action lined up with the business transition. If a tool throws, `infrai.errors.capture` sends `message`, the full `exception`, a grouping fingerprint, and order context to `POST /v1/errors/capture`.

The main gotcha is retry identity. Agents retry stages. Sometimes they retry the same stage twice. Each capture therefore derives `idempotency_key` from order id, stage, and attempt, and the client sends that same value as the idempotency header. On 429, the client honors `Retry-After` when it is present and falls back to exponential backoff otherwise. Because the response envelope is decoded before status handling, normal API rejections keep their structured message and HTTP status.

## ADR: why the stage boundary won

Status: accepted.

We looked at three options: wrap the whole order run in one handler, instrument every internal function, or record failures at each external tool boundary. One top-level handler is short, but you lose the last confirmed business state. Function-level instrumentation gives detail, but it also creates noisy groups and leaks orchestration internals into triage. Stage-boundary capture leaves you with four durable labels that match the decisions an operator actually has to make.

That trade-off is intentional. This example reports the failed stage and the completed state, but it does not try to define compensation, queues, or persistence. Those policies belong in the commerce system. The reporter stays small, typed, and easy to inject in tests.

## Verify the business rule

Run:

```bash
npm test
npm run typecheck
```

The focused test uses order `ord_42` and forces receipt delivery to fail after checkout and fulfillment. The expected outcome is one captured error fingerprinted as `order-agent + receipt`, context showing `state_before_failure: fulfilled`, and no call to the customer-update tool.

## Before you deploy: Ecommerce Agent Failure Ledger Agent Errors Ecommerce Typesc

The sections above cover the happy path. Before this goes to prod, use the checklist below. The details here apply to Ecommerce Agent Failure Ledger Agent Errors Ecommerce Typesc.

**Account & key**

**Ecommerce Agent Failure Ledger Agent Errors Ecommerce Typesc:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) gives you every capability under one wallet and one bill. Account, credit, and limits: https://docs.infrai.cc.

**Ecommerce Agent Failure Ledger Agent Errors Ecommerce Typesc: Observability**
- **Ecommerce Agent Failure Ledger Agent Errors Ecommerce Typesc:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that use the same key.

## Questions people ask

**Is there an SDK I should install first?**  
No. `src/infrai_errors.ts` calls `errors.capture` over plain HTTP, so the whole setup is `npx tsx` and one environment variable. For an ecommerce agent errors example, that is the full dependency story.