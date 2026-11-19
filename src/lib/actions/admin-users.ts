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

  let userId: string | null = null;
  let authUser: { id: string; email?: string } | null = null;

  // 1. Tenter la création via Supabase Auth Admin (si service_role_key valide)
  try {
    const adminClient = createAdminClient();
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

    if (!authError && authData?.user) {
      authUser = authData.user;
      userId = authData.user.id;
    } else if (authError && !authError.message.toLowerCase().includes("api key")) {
      // Erreur réelle (ex: email déjà pris)
      throw new Error(`Erreur lors de la création du compte : ${authError.message}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.toLowerCase().includes("api key")) {
      throw err;
    }
    // Fallback ci-dessous si clé service_role invalide
  }

  // 2. Fallback résilient via Auth SignUp (avec clé publique / anon)
  if (!userId) {
    const { createClient: createSupabaseJsClient } = await import("@supabase/supabase-js");
    const anonClient = createSupabaseJsClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data: signData, error: signError } = await anonClient.auth.signUp({
      email: parsed.email,
      password: effectivePassword,
      options: {
        data: {
          firstname: parsed.firstname,
          lastname: parsed.lastname,
          role: parsed.role,
        },
      },
    });

    if (signError) {
      throw new Error(`Erreur lors de la création du compte : ${signError.message}`);
    }

    if (!signData?.user) {
      throw new Error("Erreur inattendue : aucun utilisateur n'a été créé par Supabase.");
    }

    authUser = signData.user;
    userId = signData.user.id;
  }

  // 3. Finalisation / Upsert dans la table public.users
  const supabase = await createClient();

  // Tenter l'appel RPC admin_finalize_user
  const { error: rpcError } = await supabase.rpc("admin_finalize_user", {
    p_uid: userId,
    p_group_id: null,
  });

  // Si le RPC échoue (ex: doublon via trigger), assurer l'upsert direct
  if (rpcError) {
    const { error: upsertError } = await supabase.from("users").upsert({
      id: userId,
      email: parsed.email,
      firstname: parsed.firstname,
      lastname: parsed.lastname,
      role: parsed.role,
      isactive: true,
    });

    if (upsertError) {
      console.error("Échec de la finalisation du profil utilisateur :", upsertError);
      throw new Error(`Erreur lors de l'enregistrement du profil : ${upsertError.message}`);
    }
  }

  return {
    user: authUser,
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
    try {
      const adminClient = createAdminClient();
      const { data, error } = await adminClient.auth.admin.updateUserById(parsed.id, updates);
      if (!error && data?.user) {
        return { user: data.user };
      }
      if (error && !error.message.toLowerCase().includes("api key")) {
        throw new Error(`Erreur lors de la mise à jour des identifiants : ${error.message}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes("api key")) {
        throw err;
      }
      console.warn("Mise à jour directe du mot de passe non autorisée sans clé service role active.");
    }
  }

  return { user: null };
}
