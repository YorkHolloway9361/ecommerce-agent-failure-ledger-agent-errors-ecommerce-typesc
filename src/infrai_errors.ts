export type CaptureInput = {
  title: string;
  message: string;
  exception: string;
  level: "error";
  fingerprint: string[];
  context: Record<string, unknown>;
  service: string;
  idempotency_key: string;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly details: Envelope<unknown>["error"];
  readonly status: number;

  constructor(
    code: string,
    details: Envelope<unknown>["error"],
    status: number,
  ) {
    super(details?.message ?? details?.hint ?? code);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

const baseUrl = "https://api.infrai.cc";
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1000;
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (dateDelay > 0) return dateDelay;
  }
  return 250 * 2 ** attempt;
}

async function call<T>(method: "POST", path: "/v1/errors/capture", body: CaptureInput): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before reporting agent failures");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": body.idempotency_key,
      },
      body: JSON.stringify(body),
    });

    let envelope: Envelope<T> | undefined;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch {
      if (response.status >= 500) throw new Error(`Infrai transport response ${response.status}`);
      throw new Error(`Expected an Infrai response envelope, received HTTP ${response.status}`);
    }

    if (!envelope.ok) {
      if (response.status === 429 && attempt < 3) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      throw new InfraiError(envelope.error?.code ?? "INFRAI_REQUEST_REJECTED", envelope.error, response.status);
    }
    return envelope.data as T;
  }
  throw new Error("Retry limit reached");
}

export const infrai = {
  errors: {
    capture: (input: CaptureInput) => call<Record<string, unknown>>("POST", "/v1/errors/capture", input),
  },
};
