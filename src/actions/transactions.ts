import { getCheckoutSession, summarizeSession } from "../services/sebpay";
import type { ActionMap } from "../types";
import { asObject, optString, reqAmount, reqCurrency, reqString } from "../validate";

export const transactionsActions: ActionMap = {
  // Lit une session chez SebPay (par son id ou par ton external_reference).
  getSession: async (data) => {
    const input = asObject(data, "data");
    const session = await getCheckoutSession(reqString(input, "id_or_reference", 255));
    return summarizeSession(session);
  },

  // Interroge SebPay puis compare avec CE que ta commande attend.
  // paid = true seulement si : transaction_status = approved ET montant, devise
  // (et référence si fournie) correspondent. C'est la seule preuve de paiement.
  verifyPayment: async (data) => {
    const input = asObject(data, "data");
    const expectedAmount = reqAmount(input, "expected_amount");
    const expectedCurrency = reqCurrency(input, "expected_currency");
    const expectedReference = optString(input, "expected_reference", 255);

    const session = await getCheckoutSession(reqString(input, "id_or_reference", 255));
    const summary = summarizeSession(session);

    let reason: string | null = null;
    if (!summary.paid) {
      reason = "NOT_APPROVED";
    } else if (Number(summary.amount) !== expectedAmount) {
      reason = "AMOUNT_MISMATCH";
    } else if (String(summary.currency).toUpperCase() !== expectedCurrency) {
      reason = "CURRENCY_MISMATCH";
    } else if (expectedReference !== undefined && summary.external_reference !== expectedReference) {
      reason = "REFERENCE_MISMATCH";
    }

    return {
      paid: reason === null,
      reason,
      session: summary,
    };
  },
};
