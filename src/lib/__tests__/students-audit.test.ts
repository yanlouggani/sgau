import { describe, it, expect } from "vitest";
import {
  isValidEmail,
  isValidPhoneNumber,
  generateStudentSecurePassword,
  validateStudentStep1,
  validateStudentStep2,
  validateStudentStep3,
  validateStudentStep4,
  validateFullStudentForm,
  detectTimeSlotConflict,
  calculateEnrollmentProrata,
  calculateSuggestedMonthlyFee,
  diffEnrollments,
} from "../student-validation";
import { generateQRToken, verifyQRToken, isQRTokenFormat } from "../qr-token";

describe("Validation de l'Étape 1 : Identité et Photo de l'Élève", () => {
  it("valide un profil complet et bien formaté", () => {
    const res = validateStudentStep1({
      firstname: "Sarah",
      lastname: "Haddad",
      email: "sarah.haddad@eleve.dz",
      password: "Password123!",
      isEdit: false,
    });
    expect(res.isValid).toBe(true);
    expect(Object.keys(res.errors)).toHaveLength(0);
  });

  it("rejette les noms et prénoms vides ou contenant uniquement des espaces", () => {
    const res = validateStudentStep1({
      firstname: "   ",
      lastname: "",
      email: "test@eleve.dz",
      password: "Password123!",
    });
    expect(res.isValid).toBe(false);
    expect(res.errors.firstname).toBeDefined();
    expect(res.errors.lastname).toBeDefined();
  });

  it("valide les formats d'adresses email", () => {
    expect(isValidEmail("eleve@soutien.dz")).toBe(true);
    expect(isValidEmail("prenom.nom+1@ecole.com")).toBe(true);
    expect(isValidEmail("invalide-sans-at.com")).toBe(false);
    expect(isValidEmail("sans-domaine@")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });

  it("exige un mot de passe d'au moins 8 caractères à la création", () => {
    const res = validateStudentStep1({
      firstname: "Karim",
      lastname: "Benali",
      email: "karim@eleve.dz",
      password: "court",
      isEdit: false,
    });
    expect(res.isValid).toBe(false);
    expect(res.errors.password).toContain("au moins 8 caractères");
  });

  it("autorise un mot de passe vide en mode édition (sans modification)", () => {
    const res = validateStudentStep1({
      firstname: "Karim",
      lastname: "Benali",
      email: "karim@eleve.dz",
      password: "",
      isEdit: true,
    });
    expect(res.isValid).toBe(true);
  });

  it("rejette un mot de passe trop court s'il est renseigné en mode édition", () => {
    const res = validateStudentStep1({
      firstname: "Karim",
      lastname: "Benali",
      email: "karim@eleve.dz",
      password: "123",
      isEdit: true,
    });
    expect(res.isValid).toBe(false);
    expect(res.errors.password).toBeDefined();
  });

  it("génère un mot de passe temporaire robuste et conforme", () => {
    const pwd = generateStudentSecurePassword();
    expect(pwd.length).toBeGreaterThanOrEqual(8);
    expect(pwd).toMatch(/[A-Za-z0-9]/);
  });
});

describe("Validation de l'Étape 2 : Responsable Légal & Contact Parents", () => {
  it("accepte des numéros de téléphone valides algériens et internationaux", () => {
    expect(isValidPhoneNumber("0555123456")).toBe(true);
    expect(isValidPhoneNumber("06 61 22 33 44")).toBe(true);
    expect(isValidPhoneNumber("+213 770 88 99 00")).toBe(true);
    expect(isValidPhoneNumber("")).toBe(true); // Optionnel
    expect(isValidPhoneNumber(null)).toBe(true);
  });

  it("rejette des numéros trop courts ou invalides", () => {
    expect(isValidPhoneNumber("123")).toBe(false);
    expect(isValidPhoneNumber("abc")).toBe(false);
  });

  it("valide les données de l'étape 2", () => {
    const res = validateStudentStep2({
      parent_name: "Mohamed Benali",
      parent_phone: "0555123456",
    });
    expect(res.isValid).toBe(true);
  });
});

describe("Validation de l'Étape 3 : Classes et Matières", () => {
  it("valide la présence d'au moins une classe pour une inscription active", () => {
    const res = validateStudentStep3({ groupids: ["grp-1"] });
    expect(res.isValid).toBe(true);
  });

  it("rejette une inscription active sans aucune classe sélectionnée", () => {
    const res = validateStudentStep3({ groupids: [] }, { allowEmptyIfDraft: false });
    expect(res.isValid).toBe(false);
    expect(res.errors.groupids).toBeDefined();
  });

  it("autorise 0 classes si l'élève est enregistré en brouillon", () => {
    const res = validateStudentStep3(
      { groupids: [] },
      { allowEmptyIfDraft: true, isDraft: true }
    );
    expect(res.isValid).toBe(true);
  });
});

describe("Validation de l'Étape 4 : Tarification et Échéances", () => {
  it("valide des montants et jours d'échéance corrects", () => {
    const res = validateStudentStep4({
      monthly_fee: 3500,
      due_day: 5,
      is_draft: false,
    });
    expect(res.isValid).toBe(true);
  });

  it("rejette les montants négatifs ou NaN", () => {
    const resNegative = validateStudentStep4({
      monthly_fee: -500,
      due_day: 5,
      is_draft: false,
    });
    expect(resNegative.isValid).toBe(false);
    expect(resNegative.errors.monthly_fee).toBeDefined();

    const resNaN = validateStudentStep4({
      monthly_fee: NaN,
      due_day: 5,
      is_draft: false,
    });
    expect(resNaN.isValid).toBe(false);
  });

  it("rejette un jour d'échéance hors des limites 1-31", () => {
    const res0 = validateStudentStep4({
      monthly_fee: 3000,
      due_day: 0,
      is_draft: false,
    });
    expect(res0.isValid).toBe(false);

    const res32 = validateStudentStep4({
      monthly_fee: 3000,
      due_day: 32,
      is_draft: false,
    });
    expect(res32.isValid).toBe(false);
  });
});

describe("Validation Globale du Formulaire Élève", () => {
  it("valide un dossier élève complet prêt à l'enregistrement", () => {
    const res = validateFullStudentForm({
      firstname: "Amina",
      lastname: "Meziane",
      email: "amina.meziane@eleve.dz",
      password: "Secur3Password!",
      parent_name: "Rachid Meziane",
      parent_phone: "0770889900",
      groupids: ["grp-math-bac"],
      monthly_fee: 3500,
      due_day: 5,
      is_draft: false,
      isEdit: false,
    });
    expect(res.isValid).toBe(true);
    expect(res.errors).toEqual({});
  });

  it("agrège toutes les erreurs si plusieurs étapes sont incomplètes", () => {
    const res = validateFullStudentForm({
      firstname: "",
      lastname: "",
      email: "mauvais-email",
      password: "123",
      parent_phone: "abc",
      groupids: [],
      monthly_fee: -100,
      due_day: 40,
      is_draft: false,
      isEdit: false,
    });
    expect(res.isValid).toBe(false);
    expect(res.errors.firstname).toBeDefined();
    expect(res.errors.lastname).toBeDefined();
    expect(res.errors.email).toBeDefined();
    expect(res.errors.password).toBeDefined();
    expect(res.errors.parent_phone).toBeDefined();
    expect(res.errors.groupids).toBeDefined();
    expect(res.errors.monthly_fee).toBeDefined();
    expect(res.errors.due_day).toBeDefined();
  });
});

describe("Détection des Conflits d'Emploi du Temps", () => {
  it("ne signale aucun conflit si les cours ont lieu des jours différents", () => {
    const slotA = { dayofweek: 1, starttime: "14:00:00", endtime: "16:00:00" }; // Lundi
    const slotB = { dayofweek: 2, starttime: "14:00:00", endtime: "16:00:00" }; // Mardi
    expect(detectTimeSlotConflict(slotA, slotB)).toBe(false);
  });

  it("détecte un chevauchement partiel le même jour", () => {
    const slotA = { dayofweek: 3, starttime: "14:00:00", endtime: "16:00:00" };
    const slotB = { dayofweek: 3, starttime: "15:00:00", endtime: "17:00:00" };
    expect(detectTimeSlotConflict(slotA, slotB)).toBe(true);
  });

  it("détecte un chevauchement total le même jour", () => {
    const slotA = { dayofweek: 4, starttime: "10:00:00", endtime: "12:00:00" };
    const slotB = { dayofweek: 4, starttime: "10:30:00", endtime: "11:30:00" };
    expect(detectTimeSlotConflict(slotA, slotB)).toBe(true);
  });

  it("n'indique aucun conflit lorsque les créneaux se succèdent immédiatement", () => {
    const slotA = { dayofweek: 5, starttime: "08:00:00", endtime: "10:00:00" };
    const slotB = { dayofweek: 5, starttime: "10:00:00", endtime: "12:00:00" };
    expect(detectTimeSlotConflict(slotA, slotB)).toBe(false);
  });
});

describe("Calcul Prorata Inscription Initiale", () => {
  const fullPrice = 4000;

  it("calcule 1 séance sur 4 (25%)", () => {
    expect(calculateEnrollmentProrata(fullPrice, 1)).toBe(1000);
  });

  it("calcule 2 séances sur 4 (50%)", () => {
    expect(calculateEnrollmentProrata(fullPrice, 2)).toBe(2000);
  });

  it("calcule 3 séances sur 4 (75%)", () => {
    expect(calculateEnrollmentProrata(fullPrice, 3)).toBe(3000);
  });

  it("calcule 4 séances sur 4 (100%)", () => {
    expect(calculateEnrollmentProrata(fullPrice, 4)).toBe(4000);
  });

  it("borne les valeurs extrêmes", () => {
    expect(calculateEnrollmentProrata(fullPrice, 0)).toBe(1000); // Borne min à 1
    expect(calculateEnrollmentProrata(fullPrice, 10)).toBe(4000); // Borne max à 4
    expect(calculateEnrollmentProrata(0, 2)).toBe(0);
  });
});

describe("Calcul de la Mensualité Suggérée Multi-Matières", () => {
  it("additionne les tarifs mensuels des matières sélectionnées", () => {
    const selectedGroups = [
      { moduleId: "mod-math", monthlyPrice: 3500 },
      { moduleId: "mod-physique", monthlyPrice: 3500 },
      { moduleId: "mod-francais", monthlyPrice: 2500 },
    ];
    expect(calculateSuggestedMonthlyFee(selectedGroups)).toBe(9500);
  });

  it("ne facture pas deux fois la même matière si deux groupes de même matière sont choisis", () => {
    const duplicateModuleGroups = [
      { moduleId: "mod-math", monthlyPrice: 3500 },
      { moduleId: "mod-math", monthlyPrice: 3500 }, // doublon de matière
    ];
    expect(calculateSuggestedMonthlyFee(duplicateModuleGroups)).toBe(3500);
  });
});

describe("Différentiel des Inscriptions (Optimisation DB)", () => {
  it("détecte correctement les ajouts, suppressions et éléments inchangés", () => {
    const existing = ["grp-math", "grp-anglais"];
    const updated = ["grp-math", "grp-physique"];

    const diff = diffEnrollments(existing, updated);
    expect(diff.toAdd).toEqual(["grp-physique"]);
    expect(diff.toRemove).toEqual(["grp-anglais"]);
    expect(diff.unchanged).toEqual(["grp-math"]);
  });

  it("gère l'absence de modification", () => {
    const groups = ["grp-1", "grp-2"];
    const diff = diffEnrollments(groups, groups);
    expect(diff.toAdd).toHaveLength(0);
    expect(diff.toRemove).toHaveLength(0);
    expect(diff.unchanged).toEqual(groups);
  });
});

describe("Sécurité des Badges Élèves & QR Code Tokens", () => {
  const studentId = "44444444-0000-0000-0000-000000000001";

  it("génère un jeton QR signé valide avec l'en-tête SGAU", () => {
    const token = generateQRToken(studentId);
    expect(token).toMatch(/^SGAU:[0-9a-f\-]+:\d+:[0-9a-f]{16}$/i);
    expect(isQRTokenFormat(token)).toBe(true);
  });

  it("vérifie le jeton QR signé et extrait l'ID de l'élève", () => {
    const token = generateQRToken(studentId);
    const res = verifyQRToken(token);
    expect(res.valid).toBe(true);
    expect(res.studentId).toBe(studentId);
  });

  it("rejette les jetons altérés ou falsifiés", () => {
    const validToken = generateQRToken(studentId);
    const parts = validToken.split(":");
    // Remplacement de l'ID par celui d'un autre élève
    const tampered = `SGAU:other-student:${parts[2]}:${parts[3]}`;

    const res = verifyQRToken(tampered);
    expect(res.valid).toBe(false);
    expect(res.error).toBeDefined();
  });

  it("reconnaît le format d'un UUID brut comme badge permanent", () => {
    expect(isQRTokenFormat(studentId)).toBe(false); // UUID brut n'est pas le format dynamique SGAU
  });
});
