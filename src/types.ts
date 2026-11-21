// Une action reçoit les données brutes de l'appel et renvoie un résultat sérialisable.
// Chaque action valide elle-même ses données (voir validate.ts).
export type ActionHandler = (data: unknown) => Promise<unknown>;

// Un fichier d'actions : nom de l'action -> fonction.
export type ActionMap = Record<string, ActionHandler>;
