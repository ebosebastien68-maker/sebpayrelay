
import { getCheckoutSession, summarizeSession } from "../services/sebpay";
import { applyPaymentResult } from "../services/supabase";
import { RelayError } from "../errors";
import type { ActionMap } from "../types";
import {
  asObject,
  optString,
  reqAmount,
  reqCurrency,
  reqString,
} from "../validate";

export const transactionsActions: ActionMap = {
  // Lit une session chez SebPay (par son id ou sa référence).
  getSession: async (data) => {
    const input = asObject(data, "data");
    const session = await getCheckoutSession(
      reqString(input, "id_or_reference", 255)
    );

    return summarizeSession(session);
  },

  // Vérifie le paiement par rapport aux données attendues.
  verifyPayment: async (data) => {
    const input = asObject(data, "data");
    const expectedAmount = reqAmount(input, "expected_amount");
    const expectedCurrency = reqCurrency(input, "expected_currency");
    const expectedReference = optString(input, "expected_reference", 255);

    const session = await getCheckoutSession(
      reqString(input, "id_or_reference", 255)
    );
    const summary = summarizeSession(session);

    let reason: string | null = null;

    if (!summary.paid) {
      reason = "NOT_APPROVED";
    } else if (Number(summary.amount) !== expectedAmount) {
      reason = "AMOUNT_MISMATCH";
    } else if (
      String(summary.currency).toUpperCase() !== expectedCurrency
    ) {
      reason = "CURRENCY_MISMATCH";
    } else if (
      expectedReference !== undefined &&
      summary.external_reference !== expectedReference
    ) {
      reason = "REFERENCE_MISMATCH";
    }

    return {
      paid: reason === null,
      reason,
      session: summary,
    };
  },

  // Actualise le résultat d'un paiement depuis SebPay vers Supabase.
  refreshPayment: async (data) => {
    const input = asObject(data, "data");
    const reference = reqString(input, "external_reference", 255);

    const session = await getCheckoutSession(reference);
    const summary = summarizeSession(session);

    if (summary.external_reference !== reference) {
      throw new RelayError(
        502,
        "SEBPAY_REFERENCE_MISMATCH",
        "La référence de la session SebPay ne correspond pas à la demande"
      );
    }

    await applyPaymentResult(reference, summary);

    return {
      success: true,
      external_reference: reference,
      session: summary,
    };
  },
};

