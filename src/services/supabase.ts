import { config } from "../config";
import { RelayError } from "../errors";

// Transmet à Supabase un résultat déjà confirmé auprès de SebPay.
// Si Supabase ne répond pas 2xx, on lève une erreur : le webhook SebPay sera alors renvoyé.
export async function forwardToSupabase(event: Record<string, unknown>): Promise<void> {
  let response: Response;
  try {
    response = await fetch(config.supabase.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-relay-secret": config.supabase.webhookSecret,
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(config.httpTimeoutMs),
    });
  } catch {
    throw new RelayError(502, "SUPABASE_UNREACHABLE", "Supabase est injoignable ou trop lent");
  }
  if (!response.ok) {
    throw new RelayError(502, "SUPABASE_REJECTED", `Supabase a répondu ${response.status}`);
  }
}
