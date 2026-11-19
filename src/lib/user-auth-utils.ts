import { z } from "zod";
import type { UserRole } from "@/types/database";

export const createUserSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Adresse email invalide."),
  password: z
    .string()
    .min(8, "Le mot de passe doit comporter au moins 8 caractères.")
    .optional()
    .or(z.literal("")),
  firstname: z.string().trim().min(1, "Le prénom est obligatoire."),
  lastname: z.string().trim().min(1, "Le nom est obligatoire."),
  role: z.enum(["admin", "secretary", "professor", "student"], {
    message: "Rôle utilisateur non valide.",
  }),
  isActive: z.boolean().optional().default(true),
});

export const updateUserAuthSchema = z.object({
  id: z.string().uuid("Identifiant utilisateur invalide."),
  password: z
    .string()
    .min(8, "Le mot de passe doit comporter au moins 8 caractères.")
    .optional()
    .or(z.literal("")),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Adresse email invalide.")
    .optional(),
});

export const updateUserSchema = z.object({
  id: z.string().uuid("Identifiant utilisateur invalide."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Adresse email invalide."),
  firstname: z.string().trim().min(1, "Le prénom est obligatoire."),
  lastname: z.string().trim().min(1, "Le nom est obligatoire."),
  role: z.enum(["admin", "secretary", "professor", "student"], {
    message: "Rôle utilisateur non valide.",
  }),
  isActive: z.boolean().optional().default(true),
  password: z
    .string()
    .min(8, "Le mot de passe doit comporter au moins 8 caractères.")
    .optional()
    .or(z.literal("")),
});

export const deleteUserSchema = z.object({
  id: z.string().uuid("Identifiant utilisateur invalide."),
});

export const toggleUserActiveSchema = z.object({
  id: z.string().uuid("Identifiant utilisateur invalide."),
  isActive: z.boolean(),
});

export const ALLOWED_TARGET_ROLES: Record<UserRole, UserRole[]> = {
  admin: ["admin", "secretary", "professor", "student"],
  secretary: ["professor", "student"],
  professor: [],
  student: [],
};

export function isServiceKeyRestrictedError(err: unknown): boolean {
  if (!err) return false;
  const msg = (
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err
      ? String((err as { message: unknown }).message)
      : String(err)
  ).toLowerCase();

  return (
    msg.includes("api key") ||
    msg.includes("apikey") ||
    msg.includes("service_role") ||
    msg.includes("service role") ||
    msg.includes("unauthorized") ||
    msg.includes("forbidden") ||
    msg.includes("jwt") ||
    msg.includes("not allowed") ||
    msg.includes("not authorized")
  );
}

export function generateSecureTempPassword(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*";
  const array = new Uint32Array(12);
  crypto.getRandomValues(array);
  let pwd = "Tmp!";
  for (let i = 0; i < 12; i++) {
    pwd += chars[array[i] % chars.length];
  }
  return pwd;
}
