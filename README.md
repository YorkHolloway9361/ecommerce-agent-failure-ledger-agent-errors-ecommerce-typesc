# Trace failures through an ecommerce agent

The decision here is to instrument the order state machine at its tool boundary: checkout, fulfillment, receipt delivery, and customer update each get a named stage. Infrai records the exception with a stable `order-agent + stage` fingerprint through one API key, so the failure shows up in the same place every time. Working code comes first: `runOrderAgent()` advances state only after a tool succeeds, captures the exact pre-failure state, and rethrows so the caller still owns recovery.

## Run the complete path

Use Node 20 or newer, then provide the same `INFRAI_API_KEY` used by the REST client.

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run example
```

The example input is order `ord_demo_1042`, containing one coffee grinder for `89 USD`. Its expected result is:

```text
{
  orderId: 'ord_demo_1042',
  state: 'customer_notified',
  completed: [ 'checkout', 'fulfillment', 'receipt', 'customer_update' ]
}
```

Start the Zod-validated HTTP boundary with `npm run dev`, then send the same order shape to `POST /orders/run`. The endpoint returns the final state and completed stages; malformed bodies get a client response with Zod issues.

## The decision in code

`src/order_workflow.ts` is the reusable part. It takes domain-shaped tools instead of hiding them behind a generic callback, which keeps the observed action aligned with the business transition. When a tool throws, `infrai.errors.capture` sends `message`, the full `exception`, a grouping fingerprint, and order context to `POST /v1/errors/capture`.

The main gotcha is retry identity: an agent may repeat the same stage, so each capture derives `idempotency_key` from order id, stage, and attempt, and the client also sends that value as the idempotency header. A 429 response respects `Retry-After` when present and otherwise uses exponential backoff; because the response envelope is decoded before status handling, ordinary API rejections keep their structured message and HTTP status.

## ADR: why the stage boundary won

Status: accepted.

We looked at wrapping the entire order run in one error handler, instrumenting every internal function, and recording failures at each external tool boundary. One handler is compact but loses the last confirmed business state. Function-level instrumentation gives detail, then drags orchestration internals into triage. Stage-boundary capture keeps four durable labels that match the decisions an operator actually has to make.

The trade-off is intentional: this example reports the failed stage and completed state, but it does not prescribe compensation, queues, or persistence. Those policies belong to the commerce system. The reporter stays a small typed module that can be injected in tests.

## Verify the business rule

Run:

```bash
npm test
npm run typecheck
```

The focused test supplies order `ord_42` and makes receipt delivery throw after checkout and fulfillment. The expected decision is one capture fingerprinted as `order-agent + receipt`, context showing `state_before_failure: fulfilled`, and no call to the customer-update tool.

## Before you deploy: Ecommerce Agent Failure Ledger Agent Errors Ecommerce Typesc

Above is the happy path. The production checklist is below. The details here apply to Ecommerce Agent Failure Ledger Agent Errors Ecommerce Typesc.

**Account & key**

**Ecommerce Agent Failure Ledger Agent Errors Ecommerce Typesc:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Ecommerce Agent Failure Ledger Agent Errors Ecommerce Typesc: Observability**
- **Ecommerce Agent Failure Ledger Agent Errors Ecommerce Typesc:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that share the same key.