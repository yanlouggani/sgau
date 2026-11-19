"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";

const createUserSchema = z.object({
  email: z.string().trim().email("Adresse email invalide."),
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
});

const updateUserAuthSchema = z.object({
  id: z.string().uuid("Identifiant utilisateur invalide."),
  password: z
    .string()
    .min(8, "Le mot de passe doit comporter au moins 8 caractères.")
    .optional()
    .or(z.literal("")),
});

const ALLOWED_TARGET_ROLES: Record<UserRole, UserRole[]> = {
  admin: ["admin", "secretary", "professor", "student"],
  secretary: ["professor", "student"],
  professor: [],
  student: [],
};

function generateSecureTempPassword(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*";
  const array = new Uint32Array(12);
  crypto.getRandomValues(array);
  let pwd = "Tmp!";
  for (let i = 0; i < 12; i++) {
    pwd += chars[array[i] % chars.length];
  }
  return pwd;
}

export async function createUserAction(rawParams: {
  email: string;
  password?: string;
  firstname: string;
  lastname: string;
  role: string;
}) {
  const parsed = createUserSchema.parse(rawParams);

  // Vérification de la session et des privilèges de l'appelant
  const { profile: callerProfile } = await requireRole("admin", "secretary");

  const allowedRoles = ALLOWED_TARGET_ROLES[callerProfile.role] ?? [];
  if (!allowedRoles.includes(parsed.role)) {
    if (callerProfile.role === "secretary") {
      throw new Error(
        "Privilèges insuffisants : une secrétaire peut uniquement créer des comptes Enseignant ou Élève."
      );
    }
    throw new Error("Privilèges insuffisants pour créer un compte avec ce rôle.");
  }

  // Mot de passe sécurisé si aucun n'est renseigné
  const effectivePassword =
    parsed.password && parsed.password.trim().length >= 8
      ? parsed.password.trim()
      : generateSecureTempPassword();

  const adminClient = createAdminClient();

  // 1. Création du compte dans Supabase Auth
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: parsed.email,
    password: effectivePassword,
    email_confirm: true,
    user_metadata: {
      firstname: parsed.firstname,
      lastname: parsed.lastname,
      role: parsed.role,
    },
  });

  if (authError) {
    throw new Error(`Erreur lors de la création du compte : ${authError.message}`);
  }
  if (!authData.user) {
    throw new Error("Erreur inattendue : aucun utilisateur n'a été retourné par Supabase.");
  }

  // 2. Finalisation via RPC
  const supabase = await createClient();
  const { error: rpcError } = await supabase.rpc("admin_finalize_user", {
    p_uid: authData.user.id,
    p_group_id: null,
  });

  // 3. Rollback en cas d'échec de la finalisation pour éviter les comptes orphelins
  if (rpcError) {
    console.error("Échec admin_finalize_user, rollback du compte auth:", rpcError);
    try {
      await adminClient.auth.admin.deleteUser(authData.user.id);
    } catch (cleanupError) {
      console.error("Échec de la suppression de secours du compte auth:", cleanupError);
    }
    throw new Error(`Erreur lors de l'enregistrement du profil : ${rpcError.message}. L'opération a été annulée.`);
  }

  return {
    user: authData.user,
    tempPassword: !rawParams.password ? effectivePassword : undefined,
  };
}

export async function updateUserAuthAction(rawParams: {
  id: string;
  password?: string;
}) {
  const parsed = updateUserAuthSchema.parse(rawParams);

  const { profile: callerProfile } = await requireRole("admin", "secretary");
  const supabase = await createClient();

  // Si l'appelant est une secrétaire, vérifier que l'utilisateur cible n'est pas un admin ou une secrétaire
  if (callerProfile.role === "secretary") {
    const { data: targetProfile, error: targetError } = await supabase
      .from("users")
      .select("role")
      .eq("id", parsed.id)
      .single();

    if (targetError || !targetProfile) {
      throw new Error("Utilisateur cible introuvable.");
    }

    if (targetProfile.role === "admin" || targetProfile.role === "secretary") {
      throw new Error(
        "Privilèges insuffisants : une secrétaire ne peut pas modifier un compte Administrateur ou Secrétaire."
      );
    }
  }

  const adminClient = createAdminClient();
  const updates: { password?: string } = {};
  if (parsed.password && parsed.password.trim().length >= 8) {
    updates.password = parsed.password.trim();
  }

  if (Object.keys(updates).length > 0) {
    const { data, error } = await adminClient.auth.admin.updateUserById(parsed.id, updates);
    if (error) {
      throw new Error(`Erreur lors de la mise à jour des identifiants : ${error.message}`);
    }
    return { user: data.user };
  }

  return { user: null };
}
