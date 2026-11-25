
import crypto from "node:crypto";
import type { Request, Response } from "express";
import { config } from "../config";
import { log } from "../log";
import {
  getCheckoutSession,
  summarizeSession,
} from "../services/sebpay";
import { applyPaymentResult } from "../services/supabase";

function signatureIsValid(
  rawBody: Buffer,
  header: string | undefined
): boolean {
  if (header === undefined || header.trim() === "") {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", config.sebpay.secretKey)
    .update(rawBody)
    .digest("hex");

  const received = header.trim().toLowerCase();
  const expectedBytes = Buffer.from(expected, "utf8");
  const receivedBytes = Buffer.from(received, "utf8");

  return (
    expectedBytes.length === receivedBytes.length &&
    crypto.timingSafeEqual(expectedBytes, receivedBytes)
  );
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

export async function handleSebpayWebhook(
  req: Request,
  res: Response
): Promise<void> {
  const rawBody: unknown = req.body;

  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
    res.status(400).json({ ok: false });
    return;
  }

  // 1. Vérification de la signature HMAC SebPay.
  if (!signatureIsValid(rawBody, req.header("x-sebpay-signature"))) {
    log("warn", "webhook refusé : signature invalide");
    res.status(401).json({ ok: false });
    return;
  }

  let event: Record<string, unknown>;

  try {
    const parsed: unknown = JSON.parse(rawBody.toString("utf8"));

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error("corps inattendu");
    }

    event = parsed as Record<string, unknown>;
  } catch {
    res.status(400).json({ ok: false });
    return;
  }

  const transactionId = asText(event.transaction_id);
  const eventReference = asText(event.external_reference);
  const lookup =
    asText(event.checkout_session_id) ?? eventReference;

  if (lookup === undefined) {
    log("warn", "webhook ignoré : aucune session identifiable", {
      transaction_id: transactionId,
    });

    res.status(200).json({ ok: true, ignored: true });
    return;
  }

  try {
    // 2. Vérification réelle de la session auprès de SebPay.
    const session = await getCheckoutSession(lookup);

    const result = summarizeSession(session);
    const reference = asText(result.external_reference);

    if (!reference || !asText(result.id)) {
      throw new Error("Session SebPay sans référence ou identifiant valide");
    }

    // Empêche de traiter une session différente de celle annoncée.
    if (eventReference && eventReference !== reference) {
      throw new Error("La référence du webhook ne correspond pas à la session");
    }

    // 3. Transmission du résultat vérifié à PostgreSQL.
    await applyPaymentResult(reference, result);

    log("info", "webhook traité", {
      transaction_id: transactionId,
      session_id: result.id,
      external_reference: reference,
      paid: result.paid,
    });

    res.status(200).json({ ok: true });
  } catch (error) {
    log("error", "webhook non traité", {
      transaction_id: transactionId,
      reason: error instanceof Error ? error.message : "inconnue",
    });

    res.status(502).json({ ok: false });
  }
}

