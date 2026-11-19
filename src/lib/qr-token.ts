import { createHmac } from "crypto";

const QR_SECRET =
  process.env.QR_SIGNING_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "sgau-fallback-secret-2026-safe-key";

/**
 * Génère un jeton QR signé pour un élève (valide 24 heures)
 * Format : SGAU:<studentId>:<expiryTimestamp>:<signature>
 */
export function generateQRToken(studentId: string): string {
  const expiry = Math.floor(Date.now() / 1000) + 24 * 60 * 60; // 24h
  const payload = `${studentId}:${expiry}`;
  const sig = createHmac("sha256", QR_SECRET)
    .update(payload)
    .digest("hex")
    .slice(0, 16);
  return `SGAU:${payload}:${sig}`;
}

/**
 * Vérifie un jeton QR scanné
 */
export function verifyQRToken(token: string): {
  valid: boolean;
  studentId?: string;
  error?: string;
} {
  const trimmed = token.trim();
  if (!trimmed.startsWith("SGAU:")) {
    return { valid: false, error: "Jeton non reconnu." };
  }

  const parts = trimmed.split(":");
  if (parts.length !== 4) {
    return { valid: false, error: "Format de jeton invalide." };
  }

  const [, studentId, expiryStr, providedSig] = parts;
  const expiry = parseInt(expiryStr, 10);

  if (isNaN(expiry) || Math.floor(Date.now() / 1000) > expiry) {
    return { valid: false, error: "Le QR code a expiré (validité 24h). Veuillez actualiser." };
  }

  const expectedSig = createHmac("sha256", QR_SECRET)
    .update(`${studentId}:${expiryStr}`)
    .digest("hex")
    .slice(0, 16);

  if (providedSig !== expectedSig) {
    return { valid: false, error: "Signature de sécurité invalide." };
  }

  return { valid: true, studentId };
}

/**
 * Détecte si la chaîne correspond au format d'un jeton QR signé
 */
export function isQRTokenFormat(input: string): boolean {
  return typeof input === "string" && input.trim().startsWith("SGAU:");
}
