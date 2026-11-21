import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { handleSebpayWebhook } from "./actions/webhooks";
import { config } from "./config";
import { RelayError } from "./errors";
import { log } from "./log";
import { requireSharedSecret } from "./middleware/auth";
import { routes } from "./routes";

const app = express();
app.disable("x-powered-by");
app.use(helmet());

// Santé : ne révèle rien.
app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// Webhook SebPay : corps BRUT obligatoire pour vérifier la signature.
app.post("/webhook/sebpay", express.raw({ type: () => true, limit: "100kb" }), handleSebpayWebhook);

// Point d'entrée unique pour Supabase : { "route": "...", "action": "...", "data": {...} }
app.post("/relay", requireSharedSecret, express.json({ limit: "100kb" }), async (req: Request, res: Response) => {
  const body: unknown = req.body;
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new RelayError(400, "INVALID_REQUEST", "Corps JSON attendu");
  }
  const { route, action, data } = body as Record<string, unknown>;
  if (typeof route !== "string" || typeof action !== "string") {
    throw new RelayError(400, "INVALID_REQUEST", "route et action sont obligatoires (texte)");
  }

  // Object.hasOwn : empêche d'atteindre des clés héritées comme "constructor".
  const actions = Object.hasOwn(routes, route) ? routes[route] : undefined;
  if (actions === undefined) {
    throw new RelayError(404, "UNKNOWN_ROUTE", "Route inconnue");
  }
  const handler = Object.hasOwn(actions, action) ? actions[action] : undefined;
  if (handler === undefined) {
    throw new RelayError(404, "UNKNOWN_ACTION", "Action inconnue");
  }

  const result = await handler(data);
  log("info", "action exécutée", { route, action });
  res.json({ ok: true, data: result });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Introuvable" } });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof RelayError) {
    res.status(error.status).json({
      ok: false,
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }
  // Erreurs du lecteur de corps (JSON invalide, corps trop gros...)
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status: unknown }).status;
    if (typeof status === "number" && status >= 400 && status < 500) {
      res.status(status).json({ ok: false, error: { code: "BAD_REQUEST", message: "Requête invalide" } });
      return;
    }
  }
  log("error", "erreur interne", { reason: error instanceof Error ? error.message : "inconnue" });
  res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: "Erreur interne" } });
});

const server = app.listen(config.port, config.host, () => {
  log("info", "sebpay-relay démarré", { host: config.host, port: config.port });
});

function shutdown(): void {
  server.close(() => process.exit(0));
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
