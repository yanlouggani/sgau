/**
 * Utilitaire de gestion des dates et heures calibré sur le fuseau horaire algérien (Africa/Algiers)
 */

export const ALGIERS_TIMEZONE = "Africa/Algiers";

/**
 * Retourne la date locale du jour au format ISO YYYY-MM-DD (ex: "2026-11-19")
 * Évite les décalages d'un jour causés par toISOString() en UTC entre minuit et 1h du matin.
 */
export function todayLocal(): string {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: ALGIERS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Retourne le mois local courant au format YYYY-MM (ex: "2026-11")
 */
export function currentMonthLocal(): string {
  const [year, month] = todayLocal().split("-");
  return `${year}-${month}`;
}

/**
 * Retourne la date et heure actuelles en ISO
 */
export function nowLocalISO(): string {
  return new Date().toISOString();
}

/**
 * Formate une date en français (ex: "19 novembre 2026")
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return String(date);

  return new Intl.DateTimeFormat("fr-DZ", {
    timeZone: ALGIERS_TIMEZONE,
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

/**
 * Formate une date courte (ex: "19/11/2026")
 */
export function formatDateShort(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return String(date);

  return new Intl.DateTimeFormat("fr-DZ", {
    timeZone: ALGIERS_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/**
 * Formate une heure HH:MM (ex: "08:30" -> "08h30")
 */
export function formatTime(time: string | null | undefined): string {
  if (!time) return "—";
  const [h, m] = time.split(":");
  return m ? `${h}h${m}` : time;
}

/**
 * Vérifie si une date d'échéance YYYY-MM-DD est dépassée par rapport à aujourd'hui en Algérie
 */
export function isOverdueDate(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false;
  return todayLocal() > dueDate;
}
