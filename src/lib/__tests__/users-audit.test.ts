import { describe, it, expect } from "vitest";
import {
  createUserSchema,
  updateUserSchema,
  updateUserAuthSchema,
  deleteUserSchema,
  toggleUserActiveSchema,
  ALLOWED_TARGET_ROLES,
  generateSecureTempPassword,
  isServiceKeyRestrictedError,
} from "../user-auth-utils";
import type { UserRole } from "@/types/database";

describe("Module 4: Comptes Utilisateurs - Credentials Generation", () => {
  it("generates secure temporary passwords with correct prefix and length", () => {
    const pwd = generateSecureTempPassword();
    expect(pwd).toBeDefined();
    expect(typeof pwd).toBe("string");
    // Prefix "Tmp!" (4 chars) + 12 random chars = 16 chars
    expect(pwd.length).toBe(16);
    expect(pwd.startsWith("Tmp!")).toBe(true);
  });

  it("generates passwords containing diverse character sets", () => {
    const pwd = generateSecureTempPassword();
    // At least one digit or symbol
    expect(/[0-9!@#$%&*]/.test(pwd)).toBe(true);
    // At least one uppercase letter (starts with T)
    expect(/[A-Z]/.test(pwd)).toBe(true);
    // At least one lowercase letter
    expect(/[a-z]/.test(pwd)).toBe(true);
  });

  it("produces cryptographically distinct passwords across multiple calls", () => {
    const set = new Set<string>();
    for (let i = 0; i < 50; i++) {
      set.add(generateSecureTempPassword());
    }
    // All 50 passwords should be unique
    expect(set.size).toBe(50);
  });
});

describe("Module 4: Comptes Utilisateurs - Payload Validation (createUserSchema)", () => {
  it("accepts valid payloads for all 4 system roles", () => {
    const roles: UserRole[] = ["admin", "secretary", "professor", "student"];

    for (const role of roles) {
      const parsed = createUserSchema.parse({
        email: `test.${role}@itri-academy.dz`,
        firstname: "Amine",
        lastname: "Mansouri",
        role,
      });

      expect(parsed.role).toBe(role);
      expect(parsed.firstname).toBe("Amine");
      expect(parsed.lastname).toBe("Mansouri");
      expect(parsed.email).toBe(`test.${role}@itri-academy.dz`);
      expect(parsed.isActive).toBe(true); // Default true
    }
  });

  it("trims whitespace and canonicalizes email to lowercase", () => {
    const parsed = createUserSchema.parse({
      email: "  Mohamed.KACI@Example.COM  ",
      firstname: "   Mohamed  ",
      lastname: "   Kaci  ",
      role: "professor",
    });

    expect(parsed.email).toBe("mohamed.kaci@example.com");
    expect(parsed.firstname).toBe("Mohamed");
    expect(parsed.lastname).toBe("Kaci");
  });

  it("accepts explicit isActive: false", () => {
    const parsed = createUserSchema.parse({
      email: "inactive.student@itri.dz",
      firstname: "Yacine",
      lastname: "Dahmani",
      role: "student",
      isActive: false,
    });

    expect(parsed.isActive).toBe(false);
  });

  it("accepts empty or omitted password for auto-generation", () => {
    const parsedOmitted = createUserSchema.parse({
      email: "user1@itri.dz",
      firstname: "Fatima",
      lastname: "Zahra",
      role: "secretary",
    });
    expect(parsedOmitted.password).toBeUndefined();

    const parsedEmpty = createUserSchema.parse({
      email: "user2@itri.dz",
      firstname: "Fatima",
      lastname: "Zahra",
      role: "secretary",
      password: "",
    });
    expect(parsedEmpty.password).toBe("");
  });

  it("accepts strong password >= 8 characters", () => {
    const parsed = createUserSchema.parse({
      email: "admin@itri.dz",
      firstname: "Karim",
      lastname: "Brahimi",
      role: "admin",
      password: "StrongPassword2026!",
    });
    expect(parsed.password).toBe("StrongPassword2026!");
  });

  it("rejects short password < 8 characters", () => {
    expect(() =>
      createUserSchema.parse({
        email: "admin@itri.dz",
        firstname: "Karim",
        lastname: "Brahimi",
        role: "admin",
        password: "short",
      })
    ).toThrow(/8 caractères/);
  });

  it("rejects invalid email address", () => {
    expect(() =>
      createUserSchema.parse({
        email: "not-an-email",
        firstname: "Sarah",
        lastname: "Benali",
        role: "student",
      })
    ).toThrow(/Adresse email invalide/);
  });

  it("rejects empty firstname or lastname", () => {
    expect(() =>
      createUserSchema.parse({
        email: "valid@itri.dz",
        firstname: "   ",
        lastname: "Valid",
        role: "professor",
      })
    ).toThrow(/prénom est obligatoire/);

    expect(() =>
      createUserSchema.parse({
        email: "valid@itri.dz",
        firstname: "Valid",
        lastname: "",
        role: "professor",
      })
    ).toThrow(/nom est obligatoire/);
  });

  it("rejects invalid or unauthorized roles", () => {
    expect(() =>
      createUserSchema.parse({
        email: "user@itri.dz",
        firstname: "Test",
        lastname: "User",
        role: "superadmin",
      })
    ).toThrow(/Rôle utilisateur non valide/);

    expect(() =>
      createUserSchema.parse({
        email: "user@itri.dz",
        firstname: "Test",
        lastname: "User",
        role: "guest",
      })
    ).toThrow(/Rôle utilisateur non valide/);
  });
});

describe("Module 4: Comptes Utilisateurs - Payload Validation (update & delete)", () => {
  const validUUID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

  it("validates updateUserSchema with valid UUID and payload", () => {
    const parsed = updateUserSchema.parse({
      id: validUUID,
      email: "UPDATED@itri.dz",
      firstname: "Nadir",
      lastname: "Hamdi",
      role: "secretary",
      isActive: true,
      password: "NewPassword2026!",
    });

    expect(parsed.id).toBe(validUUID);
    expect(parsed.email).toBe("updated@itri.dz");
    expect(parsed.firstname).toBe("Nadir");
    expect(parsed.role).toBe("secretary");
    expect(parsed.password).toBe("NewPassword2026!");
  });

  it("rejects invalid UUID in updateUserSchema", () => {
    expect(() =>
      updateUserSchema.parse({
        id: "not-a-uuid",
        email: "valid@itri.dz",
        firstname: "Nadir",
        lastname: "Hamdi",
        role: "secretary",
      })
    ).toThrow(/Identifiant utilisateur invalide/);
  });

  it("validates updateUserAuthSchema with UUID and optional password", () => {
    const parsedNoPwd = updateUserAuthSchema.parse({
      id: validUUID,
    });
    expect(parsedNoPwd.id).toBe(validUUID);

    const parsedWithPwd = updateUserAuthSchema.parse({
      id: validUUID,
      password: "UpdatedPassword2026!",
    });
    expect(parsedWithPwd.password).toBe("UpdatedPassword2026!");

    expect(() =>
      updateUserAuthSchema.parse({
        id: validUUID,
        password: "123",
      })
    ).toThrow(/8 caractères/);
  });

  it("validates deleteUserSchema requiring valid UUID", () => {
    expect(deleteUserSchema.parse({ id: validUUID }).id).toBe(validUUID);

    expect(() => deleteUserSchema.parse({ id: "invalid-id" })).toThrow(
      /Identifiant utilisateur invalide/
    );
  });

  it("validates toggleUserActiveSchema requiring UUID and boolean isActive", () => {
    const active = toggleUserActiveSchema.parse({ id: validUUID, isActive: true });
    expect(active.isActive).toBe(true);

    const inactive = toggleUserActiveSchema.parse({ id: validUUID, isActive: false });
    expect(inactive.isActive).toBe(false);

    expect(() =>
      toggleUserActiveSchema.parse({ id: validUUID, isActive: "yes" as unknown as boolean })
    ).toThrow();
  });
});

describe("Module 4: Comptes Utilisateurs - Role Assignment & Privilege Escalation Rules", () => {
  it("grants admin full management rights across all 4 system roles", () => {
    const adminAllowed = ALLOWED_TARGET_ROLES.admin;
    expect(adminAllowed).toContain("admin");
    expect(adminAllowed).toContain("secretary");
    expect(adminAllowed).toContain("professor");
    expect(adminAllowed).toContain("student");
    expect(adminAllowed.length).toBe(4);
  });

  it("restricts secretary to only professor and student roles (no admin or secretary)", () => {
    const secretaryAllowed = ALLOWED_TARGET_ROLES.secretary;
    expect(secretaryAllowed).toContain("professor");
    expect(secretaryAllowed).toContain("student");
    expect(secretaryAllowed).not.toContain("admin");
    expect(secretaryAllowed).not.toContain("secretary");
    expect(secretaryAllowed.length).toBe(2);
  });

  it("completely forbids professor and student from managing any users", () => {
    expect(ALLOWED_TARGET_ROLES.professor).toEqual([]);
    expect(ALLOWED_TARGET_ROLES.student).toEqual([]);
  });

  it("verifies privilege escalation prevention matrix", () => {
    const secretaryCanCreateAdmin = ALLOWED_TARGET_ROLES.secretary.includes("admin");
    const secretaryCanCreateSecretary = ALLOWED_TARGET_ROLES.secretary.includes("secretary");

    expect(secretaryCanCreateAdmin).toBe(false);
    expect(secretaryCanCreateSecretary).toBe(false);
  });
});

describe("Module 4: Comptes Utilisateurs - Supabase Admin Restricted API Key Fallback Handling", () => {
  it("correctly identifies restricted API key error variants", () => {
    expect(isServiceKeyRestrictedError(new Error("Invalid API key provided"))).toBe(true);
    expect(isServiceKeyRestrictedError(new Error("Missing apikey header"))).toBe(true);
    expect(isServiceKeyRestrictedError(new Error("service_role key unauthorized"))).toBe(true);
    expect(isServiceKeyRestrictedError(new Error("Unauthorized"))).toBe(true);
    expect(isServiceKeyRestrictedError(new Error("403 Forbidden"))).toBe(true);
    expect(isServiceKeyRestrictedError(new Error("JWT expired or malformed"))).toBe(true);
    expect(isServiceKeyRestrictedError(new Error("User not allowed to perform this action"))).toBe(true);
    expect(isServiceKeyRestrictedError({ message: "Invalid API key" })).toBe(true);
  });

  it("does not classify real application/database errors as restricted API key", () => {
    expect(isServiceKeyRestrictedError(new Error("User already registered"))).toBe(false);
    expect(isServiceKeyRestrictedError(new Error("Email address already in use"))).toBe(false);
    expect(isServiceKeyRestrictedError(new Error("Profile not found"))).toBe(false);
    expect(isServiceKeyRestrictedError(new Error("duplicate key value violates unique constraint"))).toBe(false);
    expect(isServiceKeyRestrictedError(null)).toBe(false);
    expect(isServiceKeyRestrictedError(undefined)).toBe(false);
  });
});
