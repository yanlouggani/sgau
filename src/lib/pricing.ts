import { todayLocal } from "./dates";
import type { PaymentStatus } from "@/types/database";

/**
 * Module de gestion de la tarification et des réductions (Packs Multi-Matières & Fratrie)
 * pour le centre de cours de soutien scolaire.
 */

export type ModulePricing = {
  price_per_session: number; // Prix par séance (ex: 800 DA)
  monthly_price: number;     // Forfait mensuel pour 4 séances (ex: 3 000 DA)
  level_name?: string;       // ex: "Terminale", "4e AM (BEM)", "1re AS"
  category?: string;         // ex: "Scientifique", "Littéraire", "Langues"
};

export type DiscountBreakdown = {
  baseAmount: number;
  baseTotal: number;
  discountPercentage: number;
  packDiscountPercent: number;
  discountAmount: number;
  packDiscountAmount: number;
  siblingDiscountAmount: number;
  customDiscountAmount: number;
  netDue: number;
  netAmount: number;
  itemCount: number;
  ruleLabel: string;
};

// Barème de réductions par défaut validé pour le soutien scolaire
export const DEFAULT_PACK_DISCOUNTS: Record<number, number> = {
  1: 0,   // 1 matière : plein tarif
  2: 10,  // 2 matières : -10%
  3: 20,  // 3 matières (Pack Scientifique BAC / Trio) : -20%
  4: 25,  // 4 matières et plus : -25%
};

export const SIBLING_DISCOUNT_PERCENT = 10; // Remise Fratrie : -10%

const PRICING_STORAGE_KEY = "sgau_module_pricing_cache";

/**
 * Récupère les tarifs locaux d'une matière (fallback résilient si pas de colonne en DB)
 */
export function getLocalModulePricing(moduleId: string): ModulePricing {
  if (typeof window === "undefined") {
    return { price_per_session: 800, monthly_price: 3000 };
  }
  try {
    const raw = localStorage.getItem(PRICING_STORAGE_KEY);
    if (raw) {
      const map = JSON.parse(raw);
      if (map[moduleId]) return map[moduleId];
    }
  } catch {
    // ignore
  }
  return { price_per_session: 800, monthly_price: 3000 };
}

/**
 * Calcule automatiquement le statut de consommation d'un bloc de 4 séances
 */
export function getSessionBlockProgress(attendedCount: number): {
  currentSessionInBlock: number; // 0, 1, 2, 3 ou 4
  completedBlocks: number;
  isRenewalNeeded: boolean;     // true si 4/4 consommé
  label: string;
} {
  const count = Math.max(0, typeof attendedCount === "number" && !isNaN(attendedCount) ? attendedCount : 0);
  const currentSessionInBlock = count === 0 ? 0 : ((count - 1) % 4) + 1;
  const completedBlocks = Math.floor(count / 4);
  const isRenewalNeeded = count > 0 && count % 4 === 0;
  const currentBlockNum = count === 0 ? 1 : Math.floor((count - 1) / 4) + 1;

  let label: string;
  if (count === 0) {
    label = "Aucune séance consommée (Bloc #1)";
  } else if (isRenewalNeeded) {
    label = `Séance 4 sur 4 terminée (Bloc #${currentBlockNum}) — Renouvellement requis`;
  } else {
    label = `Séance ${currentSessionInBlock} sur 4 (Bloc #${currentBlockNum})`;
  }

  return {
    currentSessionInBlock,
    completedBlocks,
    isRenewalNeeded,
    label,
  };
}

/**
 * Enregistre les tarifs locaux d'une matière
 */
export function saveLocalModulePricing(moduleId: string, pricing: Partial<ModulePricing>) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(PRICING_STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[moduleId] = { ...(map[moduleId] || { price_per_session: 800, monthly_price: 3000 }), ...pricing };
    localStorage.setItem(PRICING_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

/**
 * Calcule automatiquement le montant dû pour un élève en fonction de ses matières et réductions
 * Accepte soit un objet de configuration, soit un tableau direct (enrolledModules, isSibling).
 */
export function calculateStudentBilling(
  optionsOrModules:
    | {
        enrolledModules: { id: string; name: string; monthlyPrice?: number; sessionPrice?: number }[];
        billingType?: "monthly" | "per_session";
        sessionsCount?: number;
        isSibling?: boolean;
        customDiscount?: number;
      }
    | { id: string; name: string; monthlyPrice?: number; sessionPrice?: number }[],
  isSiblingArg: boolean = false
): DiscountBreakdown {
  const isArray = Array.isArray(optionsOrModules);
  const enrolledModules = isArray ? optionsOrModules : optionsOrModules.enrolledModules || [];
  const billingType = isArray ? "monthly" : optionsOrModules.billingType || "monthly";
  const rawSessions = isArray ? 4 : optionsOrModules.sessionsCount ?? 4;
  const sessionsCount = typeof rawSessions === "number" && !isNaN(rawSessions) ? rawSessions : 4;
  const isSibling = isArray ? isSiblingArg : Boolean(optionsOrModules.isSibling);
  const rawDiscount = isArray ? 0 : optionsOrModules.customDiscount ?? 0;
  const customDiscount = Math.max(0, Number(rawDiscount) || 0);

  const count = enrolledModules.length;

  if (!enrolledModules || count === 0 || sessionsCount <= 0) {
    return {
      baseAmount: 0,
      baseTotal: 0,
      discountPercentage: 0,
      packDiscountPercent: 0,
      discountAmount: 0,
      packDiscountAmount: 0,
      siblingDiscountAmount: 0,
      customDiscountAmount: 0,
      netDue: 0,
      netAmount: 0,
      itemCount: count,
      ruleLabel: sessionsCount <= 0 ? "0 séance facturée" : "Aucune inscription active",
    };
  }

  // 1. Calcul du montant brut de base
  let baseAmount = 0;
  for (const mod of enrolledModules) {
    const pricing = getLocalModulePricing(mod.id);
    if (billingType === "per_session") {
      const unitPrice = Number(mod.sessionPrice ?? pricing.price_per_session) || 800;
      baseAmount += unitPrice * sessionsCount;
    } else {
      const unitPrice = Number(mod.monthlyPrice ?? pricing.monthly_price) || 3000;
      baseAmount += unitPrice;
    }
  }

  // Ajustement Prorata pour forfait mensuel si sessionsCount !== 4
  if (billingType === "monthly" && sessionsCount !== 4) {
    baseAmount = Math.round(baseAmount * (sessionsCount / 4));
  }

  // 2. Remise dégressive au volume (Pack multi-matières)
  let packDiscountPercent = 0;
  let ruleLabel = "Plein tarif (1 matière)";

  if (count === 2) {
    packDiscountPercent = DEFAULT_PACK_DISCOUNTS[2] || 10;
    ruleLabel = "Pack Duo (2 matières) : -10%";
  } else if (count === 3) {
    packDiscountPercent = DEFAULT_PACK_DISCOUNTS[3] || 20;
    ruleLabel = "Pack Trio / Scientifique (3 matières) : -20%";
  } else if (count >= 4) {
    packDiscountPercent = DEFAULT_PACK_DISCOUNTS[4] || 25;
    ruleLabel = `Pack Multi-cours (${count} matières) : -25%`;
  }

  const discountAmount = Math.round((baseAmount * packDiscountPercent) / 100);
  let currentTotal = Math.max(0, baseAmount - discountAmount);

  // 3. Remise fratrie (-10% supplémentaire si applicable)
  let siblingDiscountAmount = 0;
  if (isSibling) {
    siblingDiscountAmount = Math.round((currentTotal * SIBLING_DISCOUNT_PERCENT) / 100);
    currentTotal = Math.max(0, currentTotal - siblingDiscountAmount);
  }

  // 4. Remise personnalisée
  let customDiscountAmount = 0;
  if (customDiscount > 0) {
    customDiscountAmount = Math.min(currentTotal, customDiscount);
    currentTotal = Math.max(0, currentTotal - customDiscountAmount);
  }

  // 5. Ajout du label Prorata
  if (sessionsCount !== 4 && sessionsCount > 0) {
    ruleLabel += ` — Prorata ${sessionsCount}/4 séance(s)`;
  }

  const netDue = Math.max(0, currentTotal);

  return {
    baseAmount,
    baseTotal: baseAmount,
    discountPercentage: packDiscountPercent,
    packDiscountPercent,
    discountAmount,
    packDiscountAmount: discountAmount,
    siblingDiscountAmount,
    customDiscountAmount,
    netDue,
    netAmount: netDue,
    itemCount: count,
    ruleLabel,
  };
}

/**
 * Détermine le statut d'un paiement de façon pure et prévisible
 */
export function computePaymentStatus(
  amountDue: number,
  amountPaid: number,
  dueDate?: string
): PaymentStatus {
  const due = Math.max(0, Number(amountDue) || 0);
  const paid = Math.max(0, Number(amountPaid) || 0);

  // Si rien n'est dû, le statut est acquitté
  if (due === 0) {
    return "paid";
  }

  if (paid >= due) {
    return "paid";
  }

  const today = todayLocal();
  const isOverdue = Boolean(dueDate && today > dueDate);

  if (paid > 0) {
    return isOverdue ? "late" : "partial";
  }

  return isOverdue ? "late" : "unpaid";
}
