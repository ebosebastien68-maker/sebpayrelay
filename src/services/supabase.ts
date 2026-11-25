
import { config } from "../config";
import { RelayError } from "../errors";

type RpcName =
  | "sebpay_relay_set_link"
  | "sebpay_relay_set_error"
  | "sebpay_relay_apply_result";

// Appelle directement une fonction PostgreSQL via l'API REST Supabase.
async function callSupabaseRpc(
  functionName: RpcName,
  args: Record<string, unknown>
): Promise<void> {
  let response: Response;

  try {
    response = await fetch(
      `${config.supabase.url}/rest/v1/rpc/${functionName}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.supabase.anonKey,
          Authorization: `Bearer ${config.supabase.anonKey}`,
        },
        body: JSON.stringify({
          ...args,
          p_secret: config.supabase.relaySecret,
        }),
        signal: AbortSignal.timeout(config.httpTimeoutMs),
      }
    );
  } catch {
    throw new RelayError(
      502,
      "SUPABASE_UNREACHABLE",
      "Supabase est injoignable ou trop lent"
    );
  }

  if (!response.ok) {
    throw new RelayError(
      502,
      "SUPABASE_REJECTED",
      `Supabase a répondu ${response.status}`
    );
  }

  const result = await response.json().catch(() => null);

  if (result !== true) {
    throw new RelayError(
      502,
      "SUPABASE_RPC_FAILED",
      `La fonction RPC ${functionName} n'a pas confirmé son exécution`
    );
  }
}

// Enregistre le lien de paiement SebPay dans Supabase.
export async function setPaymentLink(
  reference: string,
  sessionId: string,
  checkoutUrl: string,
  sessionExpiresAt: string | null
): Promise<void> {
  await callSupabaseRpc("sebpay_relay_set_link", {
    p_reference: reference,
    p_session_id: sessionId,
    p_checkout_url: checkoutUrl,
    p_session_expires_at: sessionExpiresAt,
  });
}

// Signale une erreur de création de session.
export async function setPaymentError(
  reference: string,
  message: string
): Promise<void> {
  await callSupabaseRpc("sebpay_relay_set_error", {
    p_reference: reference,
    p_message: message,
  });
}

// Transmet à Supabase le résultat vérifié auprès de SebPay.
export async function applyPaymentResult(
  reference: string,
  result: Record<string, unknown>
): Promise<void> {
  await callSupabaseRpc("sebpay_relay_apply_result", {
    p_reference: reference,
    p_result: result,
  });
}

