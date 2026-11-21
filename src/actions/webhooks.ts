import crypto from "node:crypto";
import type { Request, Response } from "express";
import { config } from "../config";
import { log } from "../log";
import { getCheckoutSession, summarizeSession } from "../services/sebpay";
import { forwardToSupabase } from "../services/supabase";

// Ce fichier est à part : SebPay n'envoie ni "route" ni "action" ni notre secret partagé.
// L'authenticité vient de la signature HMAC-SHA256 du corps brut, calculée avec la clé secrète.
function signatureIsValid(rawBody: Buffer, header: string | undefined): boolean {
  if (header === undefined || header.trim() === "") {
    return false;
  }
  const expected = crypto.createHmac("sha256", config.sebpay.secretKey).update(rawBody).digest("hex");
  const received = header.trim().toLowerCase();
  const expectedBytes = Buffer.from(expected, "utf8");
  const receivedBytes = Buffer.from(received, "utf8");
  return expectedBytes.length === receivedBytes.length && crypto.timingSafeEqual(expectedBytes, receivedBytes);
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export async function handleSebpayWebhook(req: Request, res: Response): Promise<void> {
  const rawBody: unknown = req.body;
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
    res.status(400).json({ ok: false });
    return;
  }

  // 1. Authenticité : signature calculée sur les octets reçus, jamais sur un JSON ré-encodé.
  if (!signatureIsValid(rawBody, req.header("x-sebpay-signature"))) {
    log("warn", "webhook refusé : signature invalide");
    res.status(401).json({ ok: false });
    return;
  }

  let event: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody.toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("corps inattendu");
    }
    event = parsed as Record<string, unknown>;
  } catch {
    res.status(400).json({ ok: false });
    return;
  }

  const transactionId = asText(event.transaction_id);
  const lookup = asText(event.checkout_session_id) ?? asText(event.external_reference);

  // Webhook sans session identifiable (ex. une collecte, pas encore gérée) : on accuse réception.
  if (lookup === undefined) {
    log("warn", "webhook ignoré : aucune session identifiable", { transaction_id: transactionId });
    res.status(200).json({ ok: true, ignored: true });
    return;
  }

  try {
    // 2. Le webhook n'est qu'un signal : la preuve est la lecture de la session chez SebPay.
    const session = await getCheckoutSession(lookup);

    // 3. On transmet à Supabase le résultat CONFIRMÉ, pas le contenu du webhook.
    await forwardToSupabase({
      type: "sebpay.payment_checked",
      checked_at: new Date().toISOString(),
      signal: { transaction_id: transactionId ?? null, webhook_status: asText(event.status) ?? null },
      session: summarizeSession(session),
    });

    log("info", "webhook traité", { transaction_id: transactionId, session_id: session.id });
    res.status(200).json({ ok: true });
  } catch (error) {
    // Réponse non 2xx : SebPay renverra le webhook (30 s puis 2 min, 3 envois au maximum).
    log("error", "webhook non traité", {
      transaction_id: transactionId,
      reason: error instanceof Error ? error.message : "inconnue",
    });
    res.status(502).json({ ok: false });
  }
}
