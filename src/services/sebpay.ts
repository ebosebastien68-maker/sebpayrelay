
import { config } from "../config";
import { RelayError } from "../errors";

export interface CreateSessionInput {
  amount: number;
  currency: string;
  redirect_url: string;
  external_reference: string;
  cancel_url?: string;
  description?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  metadata?: Record<string, unknown>;
}

export interface CheckoutSession {
  id: string;
  status: string; // open | completed | expired
  transaction_id?: string | null;
  transaction_status?: string | null; // pending | approved | rejected
  external_reference?: string | null;
  metadata?: Record<string, unknown> | null;
  description?: string | null;
  cancel_url?: string | null;
  amount: number;
  currency: string;
  checkout_url?: string;
  expires_at?: string;
  created_at?: string;
  idempotent_replay?: boolean;
}

// Codes HTTP de SebPay renvoyés tels quels à l'appelant.
// Les autres (401, 403, 5xx...) sont des problèmes entre le relais et SebPay : 502.
const PASSTHROUGH_STATUS = new Set([400, 404, 409, 422, 429]);

function readErrors(json: unknown): Record<string, unknown> | undefined {
  if (typeof json === "object" && json !== null && "errors" in json) {
    const errors = (json as { errors: unknown }).errors;

    if (
      typeof errors === "object" &&
      errors !== null &&
      !Array.isArray(errors)
    ) {
      return errors as Record<string, unknown>;
    }
  }

  return undefined;
}

function toRelayError(status: number, json: unknown): RelayError {
  const errors = readErrors(json);
  const sebpayCode =
    typeof errors?.code === "string" ? errors.code : undefined;

  const message =
    typeof json === "object" &&
    json !== null &&
    typeof (json as { message?: unknown }).message === "string"
      ? (json as { message: string }).message
      : "Erreur renvoyée par SebPay";

  const relayStatus = PASSTHROUGH_STATUS.has(status) ? status : 502;

  return new RelayError(
    relayStatus,
    sebpayCode ?? "SEBPAY_ERROR",
    message,
    {
      sebpay_status: status,
      sebpay_code: sebpayCode,
      errors,
    }
  );
}

// Selon les endpoints, la réponse peut être à la racine ou dans "data".
function unwrap(json: unknown): Record<string, unknown> | undefined {
  if (
    typeof json !== "object" ||
    json === null ||
    Array.isArray(json)
  ) {
    return undefined;
  }

  const root = json as Record<string, unknown>;
  const inner = root.data;

  if (
    typeof inner === "object" &&
    inner !== null &&
    !Array.isArray(inner)
  ) {
    return inner as Record<string, unknown>;
  }

  return root;
}

// Vérifie les champs obligatoires et optionnels d'une session SebPay.
function validateCheckoutSession(
  payload: Record<string, unknown>
): CheckoutSession {
  if (
    typeof payload.id !== "string" ||
    payload.id.trim() === "" ||
    typeof payload.status !== "string" ||
    payload.status.trim() === "" ||
    typeof payload.amount !== "number" ||
    !Number.isFinite(payload.amount) ||
    typeof payload.currency !== "string" ||
    payload.currency.trim() === ""
  ) {
    throw new RelayError(
      502,
      "SEBPAY_INVALID_SESSION",
      "SebPay a renvoyé une session avec des champs obligatoires invalides"
    );
  }

  const nullableStringFields = [
    "transaction_id",
    "transaction_status",
    "external_reference",
    "description",
    "cancel_url",
  ];

  for (const field of nullableStringFields) {
    const value = payload[field];

    if (
      value !== undefined &&
      value !== null &&
      typeof value !== "string"
    ) {
      throw new RelayError(
        502,
        "SEBPAY_INVALID_SESSION",
        `SebPay a renvoyé un champ ${field} invalide`
      );
    }
  }

  const stringFields = [
    "checkout_url",
    "expires_at",
    "created_at",
  ];

  for (const field of stringFields) {
    const value = payload[field];

    if (value !== undefined && typeof value !== "string") {
      throw new RelayError(
        502,
        "SEBPAY_INVALID_SESSION",
        `SebPay a renvoyé un champ ${field} invalide`
      );
    }
  }

  if (
    payload.metadata !== undefined &&
    payload.metadata !== null &&
    (
      typeof payload.metadata !== "object" ||
      Array.isArray(payload.metadata)
    )
  ) {
    throw new RelayError(
      502,
      "SEBPAY_INVALID_SESSION",
      "SebPay a renvoyé des métadonnées invalides"
    );
  }

  if (
    payload.idempotent_replay !== undefined &&
    typeof payload.idempotent_replay !== "boolean"
  ) {
    throw new RelayError(
      502,
      "SEBPAY_INVALID_SESSION",
      "SebPay a renvoyé un indicateur idempotent invalide"
    );
  }

  return payload as unknown as CheckoutSession;
}

async function request(
  method: "GET" | "POST",
  path: string,
  body?: unknown
): Promise<Record<string, unknown>> {
  const url = `${config.sebpay.baseUrl}${path}`;

  let response: Response;

  try {
    response = await fetch(url, {
      method,
      headers: {
        "X-Public-Key": config.sebpay.publicKey,
        "X-Secret-Key": config.sebpay.secretKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(config.httpTimeoutMs),
    });
  } catch {
    throw new RelayError(
      502,
      "SEBPAY_UNREACHABLE",
      "SebPay est injoignable ou trop lent"
    );
  }

  const text = await response.text();

  let json: unknown = null;

  try {
    json = text === "" ? null : JSON.parse(text);
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw toRelayError(response.status, json);
  }

  const payload = unwrap(json);

  if (payload === undefined) {
    throw new RelayError(
      502,
      "SEBPAY_INVALID_RESPONSE",
      "Réponse SebPay illisible"
    );
  }

  return payload;
}

export async function createCheckoutSession(
  input: CreateSessionInput
): Promise<CheckoutSession> {
  const payload = await request("POST", "/checkout/sessions", {
    ...input,
    // Le webhook est toujours celui du relais : Supabase n'a pas à le connaître.
    callback_url: config.sebpay.callbackUrl,
  });

  return validateCheckoutSession(payload);
}

export async function getCheckoutSession(
  idOrReference: string
): Promise<CheckoutSession> {
  const payload = await request(
    "GET",
    `/checkout/sessions/${encodeURIComponent(idOrReference)}`
  );

  return validateCheckoutSession(payload);
}

// Vue minimale d'une session, ce que le relais renvoie à Supabase.
// "paid" ne vaut true que si SebPay indique transaction_status = approved.
export function summarizeSession(session: CheckoutSession) {
  return {
    id: session.id,
    status: session.status,
    transaction_id: session.transaction_id ?? null,
    transaction_status: session.transaction_status ?? null,
    paid: session.transaction_status === "approved",
    external_reference: session.external_reference ?? null,
    amount: session.amount,
    currency: session.currency,
    metadata: session.metadata ?? null,
    expires_at: session.expires_at ?? null,
  };
}
