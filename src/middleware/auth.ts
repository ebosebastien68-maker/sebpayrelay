import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config";

// Comparaison à temps constant, sans révéler la longueur : on compare les empreintes SHA-256.
function safeEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash("sha256").update(a).digest();
  const hashB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

// Protège /relay : seul Supabase (qui connaît le secret partagé) peut appeler les actions.
export function requireSharedSecret(req: Request, res: Response, next: NextFunction): void {
  const provided = req.header("x-relay-secret");
  if (provided === undefined || !safeEqual(provided, config.relaySharedSecret)) {
    res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Accès refusé" } });
    return;
  }
  next();
}
