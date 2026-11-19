/**
 * Validation et logique métier pour les Élèves, Inscriptions et Groupes (Module 2)
 */

export type StudentStep1Data = {
  firstname: string;
  lastname: string;
  email: string;
  password?: string;
  photo_url?: string | null;
  isEdit?: boolean;
};

export type StudentStep2Data = {
  parent_name?: string | null;
  parent_phone?: string | null;
  parent_relationship?: string | null;
};

export type StudentStep3Data = {
  groupids: string[];
};

export type StudentStep4Data = {
  monthly_fee: number;
  due_day: number;
  billing_notes?: string | null;
  is_draft: boolean;
};

export type StepValidationResult = {
  isValid: boolean;
  errors: Record<string, string>;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Valide le format d'une adresse email
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  return EMAIL_REGEX.test(email.trim().toLowerCase());
}

/**
 * Valide un numéro de téléphone (formats algériens et internationaux)
 */
export function isValidPhoneNumber(phone?: string | null): boolean {
  if (!phone || !phone.trim()) return true; // Optionnel
  const cleaned = phone.replace(/[\s\-\.\(\)]/g, "");
  // Accepte numéros algériens (05, 06, 07, 02...) ou préfixes internationaux (+213...)
  return /^(\+?\d{8,15})$/.test(cleaned);
}

/**
 * Génère un mot de passe temporaire sécurisé pour un élève
 */
export function generateStudentSecurePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%&*";

  const allChars = upper + lower + digits + special;
  let pass = "Sga!";
  for (let i = 0; i < 8; i++) {
    pass += allChars.charAt(Math.floor(Math.random() * allChars.length));
  }
  return pass;
}

/**
 * Étape 1 : Identité et Photo de l'élève
 */
export function validateStudentStep1(data: StudentStep1Data): StepValidationResult {
  const errors: Record<string, string> = {};

  if (!data.firstname || !data.firstname.trim()) {
    errors.firstname = "Le prénom de l'élève est obligatoire.";
  }

  if (!data.lastname || !data.lastname.trim()) {
    errors.lastname = "Le nom de l'élève est obligatoire.";
  }

  if (!data.email || !data.email.trim()) {
    errors.email = "L'adresse email est obligatoire.";
  } else if (!isValidEmail(data.email)) {
    errors.email = "Format d'adresse email invalide.";
  }

  if (!data.isEdit) {
    if (!data.password || data.password.trim().length < 8) {
      errors.password = "Le mot de passe doit comporter au moins 8 caractères.";
    }
  } else if (data.password && data.password.trim().length > 0 && data.password.trim().length < 8) {
    errors.password = "Le nouveau mot de passe doit comporter au moins 8 caractères.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Étape 2 : Responsable Légal & Contact Parents
 */
export function validateStudentStep2(data: StudentStep2Data): StepValidationResult {
  const errors: Record<string, string> = {};

  if (data.parent_phone && !isValidPhoneNumber(data.parent_phone)) {
    errors.parent_phone = "Numéro de téléphone invalide (au moins 9 chiffres requis).";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Étape 3 : Classes et Matières
 */
export function validateStudentStep3(
  data: StudentStep3Data,
  options?: { allowEmptyIfDraft?: boolean; isDraft?: boolean }
): StepValidationResult {
  const errors: Record<string, string> = {};

  if (!data.groupids || data.groupids.length === 0) {
    if (!options?.allowEmptyIfDraft || !options?.isDraft) {
      errors.groupids = "Veuillez sélectionner au moins une classe pour finaliser l'inscription.";
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Étape 4 : Tarification et Échéances
 */
export function validateStudentStep4(data: StudentStep4Data): StepValidationResult {
  const errors: Record<string, string> = {};

  if (typeof data.monthly_fee !== "number" || isNaN(data.monthly_fee) || data.monthly_fee < 0) {
    errors.monthly_fee = "La mensualité doit être un montant positif ou nul.";
  }

  if (typeof data.due_day !== "number" || isNaN(data.due_day) || data.due_day < 1 || data.due_day > 31) {
    errors.due_day = "Le jour d'échéance doit être compris entre 1 et 31.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validation complète d'un profil élève avant enregistrement
 */
export function validateFullStudentForm(form: {
  firstname: string;
  lastname: string;
  email: string;
  password?: string;
  photo_url?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  groupids: string[];
  monthly_fee: number;
  due_day: number;
  is_draft: boolean;
  isEdit?: boolean;
}): StepValidationResult {
  const s1 = validateStudentStep1({
    firstname: form.firstname,
    lastname: form.lastname,
    email: form.email,
    password: form.password,
    photo_url: form.photo_url,
    isEdit: form.isEdit,
  });

  const s2 = validateStudentStep2({
    parent_name: form.parent_name,
    parent_phone: form.parent_phone,
  });

  const s3 = validateStudentStep3(
    { groupids: form.groupids },
    { allowEmptyIfDraft: true, isDraft: form.is_draft }
  );

  const s4 = validateStudentStep4({
    monthly_fee: form.monthly_fee,
    due_day: form.due_day,
    is_draft: form.is_draft,
  });

  const errors = { ...s1.errors, ...s2.errors, ...s3.errors, ...s4.errors };
  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Détection de chevauchement d'horaires entre deux créneaux
 */
export function detectTimeSlotConflict(
  slotA: { dayofweek: number; starttime: string; endtime: string },
  slotB: { dayofweek: number; starttime: string; endtime: string }
): boolean {
  if (Number(slotA.dayofweek) !== Number(slotB.dayofweek)) {
    return false;
  }

  const startA = slotA.starttime.slice(0, 5);
  const endA = slotA.endtime.slice(0, 5);
  const startB = slotB.starttime.slice(0, 5);
  const endB = slotB.endtime.slice(0, 5);

  return startA < endB && endA > startB;
}

/**
 * Calcul du montant au prorata pour le premier paiement
 * (bloc de 4 séances mensuelles)
 */
export function calculateEnrollmentProrata(basePrice: number, sessionsCount: number): number {
  if (basePrice <= 0) return 0;
  const clampedSessions = Math.min(Math.max(1, Math.round(sessionsCount)), 4);
  return Math.round((basePrice * clampedSessions) / 4);
}

/**
 * Calcule la mensualité suggérée en sommant les tarifs des modules distincts
 */
export function calculateSuggestedMonthlyFee(
  groups: Array<{ moduleId?: string; monthlyPrice?: number | null }>
): number {
  const seenModules = new Set<string>();
  let total = 0;

  for (const g of groups) {
    const key = g.moduleId || JSON.stringify(g);
    if (!seenModules.has(key)) {
      seenModules.add(key);
      const price = Number(g.monthlyPrice) || 0;
      total += price;
    }
  }

  return total;
}

/**
 * Différentiel d'inscriptions pour minimiser les opérations en base
 */
export function diffEnrollments(
  existingGroupIds: string[],
  newGroupIds: string[]
): {
  toAdd: string[];
  toRemove: string[];
  unchanged: string[];
} {
  const existingSet = new Set(existingGroupIds);
  const newSet = new Set(newGroupIds);

  const toAdd = newGroupIds.filter((id) => !existingSet.has(id));
  const toRemove = existingGroupIds.filter((id) => !newSet.has(id));
  const unchanged = existingGroupIds.filter((id) => newSet.has(id));

  return { toAdd, toRemove, unchanged };
}
