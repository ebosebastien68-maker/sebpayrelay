import { paymentsActions } from "./actions/payments";
import { transactionsActions } from "./actions/transactions";
import type { ActionMap } from "./types";

// Fichier central : uniquement la liste des routes, chacune reliée à son fichier d'actions.
// Pour ajouter une route : créer src/actions/xxx.ts, puis l'ajouter ici.
// (Le webhook SebPay n'est pas ici : il a sa propre entrée signée, voir server.ts.)
export const routes: Record<string, ActionMap> = {
  payments: paymentsActions,
  transactions: transactionsActions,
};
