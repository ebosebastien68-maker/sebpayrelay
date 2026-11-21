import { RelayError } from "./errors";

export type Obj = Record<string, unknown>;

function invalid(message: string): never {
  throw new RelayError(422, "INVALID_PARAMS", message);
}

export function asObject(value: unknown, label: string): Obj {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalid(`${label} doit être un objet`);
  }
  return value as Obj;
}

export function reqString(obj: Obj, key: string, max = 255): string {
  const value = obj[key];
  if (typeof value !== "string" || value.trim() === "") {
    invalid(`${key} est obligatoire (texte)`);
  }
  const text = (value as string).trim();
  if (text.length > max) {
    invalid(`${key} dépasse ${max} caractères`);
  }
  return text;
}

export function optString(obj: Obj, key: string, max = 255): string | undefined {
  const value = obj[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  return reqString(obj, key, max);
}

export function reqAmount(obj: Obj, key: string): number {
  const value = obj[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    invalid(`${key} doit être un nombre strictement positif`);
  }
  return value as number;
}

export function reqCurrency(obj: Obj, key: string): string {
  const value = reqString(obj, key, 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(value)) {
    invalid(`${key} doit être un code devise de 3 lettres (ex. XOF)`);
  }
  return value;
}

function checkHttpUrl(key: string, value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return invalid(`${key} n'est pas une URL valide`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    invalid(`${key} doit commencer par http:// ou https://`);
  }
  return value;
}

export function reqHttpUrl(obj: Obj, key: string): string {
  return checkHttpUrl(key, reqString(obj, key, 2048));
}

export function optHttpUrl(obj: Obj, key: string): string | undefined {
  const value = optString(obj, key, 2048);
  return value === undefined ? undefined : checkHttpUrl(key, value);
}

export function optObject(obj: Obj, key: string): Obj | undefined {
  const value = obj[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  return asObject(value, key);
}
