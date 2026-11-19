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
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalExpenses(expenses: CashExpense[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CASH_EXPENSES_STORAGE_KEY, JSON.stringify(expenses));
  } catch (e) {
    console.error("Erreur sauvegarde dépenses locale:", e);
  }
}

export function addLocalExpense(expense: Omit<CashExpense, "id" | "created_at">): CashExpense {
  const current = getLocalExpenses();
  const newExpense: CashExpense = {
    ...expense,
    id: "exp_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
    created_at: new Date().toISOString(),
    date: new Date().toISOString(),
  };
  const updated = [newExpense, ...current];
  saveLocalExpenses(updated);
  return newExpense;
}

export function deleteLocalExpense(id: string): void {
  const current = getLocalExpenses();
  saveLocalExpenses(current.filter((e) => e.id !== id));
}

/**
 * Filtre les dépenses pour une date donnée (YYYY-MM-DD)
 */
export function getExpensesForDate(dateStr: string): CashExpense[] {
  const all = getLocalExpenses();
  return all.filter((e) => e.created_at.startsWith(dateStr));
}
