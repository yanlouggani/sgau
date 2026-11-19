/**
 * Gestion de la Caisse Journalière (Z de Caisse & Dépenses)
 * Supporte Supabase avec synchronisation locale automatique
 */

export type CashExpense = {
  id: string;
  description: string;
  category: "supplies" | "photocopy" | "maintenance" | "hospitality" | "other";
  amount: number;
  recorded_by?: string;
  created_at: string;
  date?: string;
};

const CASH_EXPENSES_STORAGE_KEY = "sgau_cash_expenses_cache";

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  supplies: "Fournitures (Papeterie, etc.)",
  photocopy: "Photocopies & Tirages",
  hospitality: "Café, Eau & Accueil",
  maintenance: "Entretien & Ménage",
  other: "Autre décaissement",
};

export const EXPENSE_CATEGORIES: Record<string, string> = EXPENSE_CATEGORY_LABELS;

export function getLocalExpenses(): CashExpense[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CASH_EXPENSES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalExpenses(expenses: CashExpense[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CASH_EXPENSES_STORAGE_KEY, JSON.stringify(Array.isArray(expenses) ? expenses : []));
  } catch (e) {
    console.error("Erreur sauvegarde dépenses locale:", e);
  }
}

export function addLocalExpense(expense: Omit<CashExpense, "id" | "created_at">): CashExpense {
  const current = getLocalExpenses();
  const safeAmount = Math.max(0, Number(expense.amount) || 0);
  const nowIso = new Date().toISOString();
  const newExpense: CashExpense = {
    ...expense,
    description: (expense.description || "Dépense de caisse").trim(),
    amount: safeAmount,
    id: "exp_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
    created_at: nowIso,
    date: expense.date || nowIso,
  };
  const updated = [newExpense, ...current];
  saveLocalExpenses(updated);
  return newExpense;
}

export function deleteLocalExpense(id: string): void {
  const current = getLocalExpenses();
  saveLocalExpenses(current.filter((e) => e && e.id !== id));
}

/**
 * Filtre les dépenses pour une date donnée (YYYY-MM-DD)
 */
export function getExpensesForDate(dateStr: string): CashExpense[] {
  if (!dateStr) return [];
  const all = getLocalExpenses();
  return all.filter((e) => {
    if (!e) return false;
    const d = e.date || e.created_at || "";
    return typeof d === "string" && d.startsWith(dateStr);
  });
}

/**
 * Calcul du récapitulatif quotidien de caisse (Encaissements vs Décaissements)
 */
export function calculateDailyCashSummary(
  receipts: Array<{ amount_paid?: number | null }>,
  expenses: Array<{ amount?: number | null }>
): {
  totalIn: number;
  totalOut: number;
  netBalance: number;
} {
  const totalIn = (receipts || []).reduce(
    (acc, curr) => acc + Math.max(0, Number(curr?.amount_paid) || 0),
    0
  );
  const totalOut = (expenses || []).reduce(
    (acc, curr) => acc + Math.max(0, Number(curr?.amount) || 0),
    0
  );
  return {
    totalIn,
    totalOut,
    netBalance: totalIn - totalOut,
  };
}
