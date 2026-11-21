type Level = "info" | "warn" | "error";

// Journal simple en JSON. Ne jamais y passer de clé, de secret ou de corps complet.
export function log(level: Level, message: string, meta: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...meta });
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}
