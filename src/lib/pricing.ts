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
  currentSessionInBlock: number; // 1, 2, 3 ou 4
  completedBlocks: number;
  isRenewalNeeded: boolean;     // true si 4/4 consommé
  label: string;
} {
  const count = Math.max(0, attendedCount);
  const currentSessionInBlock = count === 0 ? 1 : ((count - 1) % 4) + 1;
  const completedBlocks = Math.floor(count / 4);
  const isRenewalNeeded = count > 0 && count % 4 === 0;

  return {
    currentSessionInBlock,
    completedBlocks,
    isRenewalNeeded,
    label: `Séance ${currentSessionInBlock} sur 4 (Bloc #${completedBlocks + 1})`,
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
  const sessionsCount = isArray ? 4 : optionsOrModules.sessionsCount ?? 4;
  const isSibling = isArray ? isSiblingArg : optionsOrModules.isSibling ?? false;
  const customDiscount = isArray ? 0 : optionsOrModules.customDiscount ?? 0;

  const count = enrolledModules.length;

  if (!enrolledModules || count === 0) {
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
      itemCount: 0,
      ruleLabel: "Aucune inscription active",
    };
  }

  // 1. Calcul du montant brut de base
  let baseAmount = 0;
  for (const mod of enrolledModules) {
    const pricing = getLocalModulePricing(mod.id);
    const unitPrice =
      billingType === "monthly"
        ? (mod.monthlyPrice || pricing.monthly_price || 3000)
        : (mod.sessionPrice || pricing.price_per_session || 800) * 4;
    baseAmount += unitPrice;
  }

  // Ajustement Prorata immédiat si sessionsCount < 4
  if (sessionsCount < 4 && sessionsCount > 0) {
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
  let currentTotal = baseAmount - discountAmount;

  // 3. Remise fratrie (-10% supplémentaire si applicable)
  let siblingDiscountAmount = 0;
  if (isSibling) {
    siblingDiscountAmount = Math.round((currentTotal * SIBLING_DISCOUNT_PERCENT) / 100);
    currentTotal -= siblingDiscountAmount;
  }

  // 4. Remise personnalisée
  let customDiscountAmount = 0;
  if (customDiscount > 0) {
    customDiscountAmount = Math.min(currentTotal, customDiscount);
    currentTotal -= customDiscountAmount;
  }

  // 5. Ajout du label Prorata (le calcul a déjà été appliqué sur le baseAmount)
  if (sessionsCount < 4 && sessionsCount > 0) {
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
