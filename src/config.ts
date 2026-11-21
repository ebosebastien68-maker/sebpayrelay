import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value.trim();
}

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Variable d'environnement invalide : ${name}`);
  }
  return value;
}

// Le relais refuse de démarrer s'il manque une variable.
export const config = {
  port: positiveInt("PORT", 3000),
  // Écoute locale uniquement : Nginx est le seul point d'entrée public.
  host: "127.0.0.1",
  httpTimeoutMs: positiveInt("HTTP_TIMEOUT_MS", 4000),
  sebpay: {
    baseUrl: required("SEBPAY_BASE_URL").replace(/\/+$/, ""),
    publicKey: required("SEBPAY_PUBLIC_KEY"),
    secretKey: required("SEBPAY_SECRET_KEY"),
    callbackUrl: required("SEBPAY_CALLBACK_URL"),
  },
  relaySharedSecret: required("RELAY_SHARED_SECRET"),
  supabase: {
    webhookUrl: required("SUPABASE_WEBHOOK_URL"),
    webhookSecret: required("SUPABASE_WEBHOOK_SECRET"),
  },
} as const;
