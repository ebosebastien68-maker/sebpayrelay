
import { createCheckoutSession } from "../services/sebpay";
import { setPaymentLink } from "../services/supabase";
import { RelayError } from "../errors";
import type { ActionMap } from "../types";
import {
  asObject,
  optHttpUrl,
  optObject,
  optString,
  reqAmount,
  reqCurrency,
  reqHttpUrl,
  reqString,
} from "../validate";

export const paymentsActions: ActionMap = {
  // Crée une session SebPay et enregistre son lien dans Supabase.
  createSession: async (data) => {
    const input = asObject(data, "data");

    const externalReference = reqString(
      input,
      "external_reference",
      255
    );

    const session = await createCheckoutSession({
      amount: reqAmount(input, "amount"),
      currency: reqCurrency(input, "currency"),
      redirect_url: reqHttpUrl(input, "redirect_url"),
      external_reference: externalReference,
      cancel_url: optHttpUrl(input, "cancel_url"),
      description: optString(input, "description", 255),
      customer_name: optString(input, "customer_name", 255),
      customer_email: optString(input, "customer_email", 255),
      customer_phone: optString(input, "customer_phone", 32),
      metadata: optObject(input, "metadata"),
    });

    // Vérifie les informations essentielles renvoyées par SebPay.
    if (
      typeof session.id !== "string" ||
      session.id.trim() === "" ||
      typeof session.checkout_url !== "string" ||
      session.checkout_url.trim() === "" ||
      session.external_reference !== externalReference
    ) {
      throw new RelayError(
        502,
        "SEBPAY_INVALID_SESSION",
        "SebPay a renvoyé une session incomplète ou une référence incorrecte"
      );
    }

    // Vérifie que le lien de paiement utilise HTTP ou HTTPS.
    let checkoutUrl: URL;

    try {
      checkoutUrl = new URL(session.checkout_url);

      if (
        checkoutUrl.protocol !== "https:" &&
        checkoutUrl.protocol !== "http:"
      ) {
        throw new Error("Protocole non autorisé");
      }
    } catch {
      throw new RelayError(
        502,
        "SEBPAY_INVALID_CHECKOUT_URL",
        "SebPay a renvoyé une URL de paiement invalide"
      );
    }

    // Vérifie la date d'expiration renvoyée par SebPay.
    if (
      session.expires_at !== undefined &&
      session.expires_at !== null &&
      typeof session.expires_at !== "string"
    ) {
      throw new RelayError(
        502,
        "SEBPAY_INVALID_EXPIRATION",
        "SebPay a renvoyé une date d'expiration invalide"
      );
    }

    const expiresAt = session.expires_at ?? null;

    // Enregistre le lien et l'identifiant de session dans PostgreSQL.
    await setPaymentLink(
      externalReference,
      session.id,
      checkoutUrl.toString(),
      expiresAt
    );

    return {
      session_id: session.id,
      status: session.status,
      checkout_url: checkoutUrl.toString(),
      amount: session.amount,
      currency: session.currency,
      external_reference: externalReference,
      expires_at: expiresAt,
      idempotent_replay: session.idempotent_replay === true,
    };
  },
};
