import { createCheckoutSession } from "../services/sebpay";
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
  // Crée une session de Checkout hébergé et renvoie le lien de paiement.
  createSession: async (data) => {
    const input = asObject(data, "data");

    const session = await createCheckoutSession({
      amount: reqAmount(input, "amount"),
      currency: reqCurrency(input, "currency"),
      redirect_url: reqHttpUrl(input, "redirect_url"),
      // Obligatoire ici : c'est l'identifiant de ta commande, la clé de toute la vérification.
      external_reference: reqString(input, "external_reference", 255),
      cancel_url: optHttpUrl(input, "cancel_url"),
      description: optString(input, "description", 255),
      customer_name: optString(input, "customer_name", 255),
      customer_email: optString(input, "customer_email", 255),
      customer_phone: optString(input, "customer_phone", 32),
      metadata: optObject(input, "metadata"),
    });

    return {
      session_id: session.id,
      status: session.status,
      checkout_url: session.checkout_url,
      amount: session.amount,
      currency: session.currency,
      external_reference: session.external_reference ?? null,
      expires_at: session.expires_at ?? null,
      idempotent_replay: session.idempotent_replay === true,
    };
  },
};
