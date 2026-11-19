import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";
import type { User } from "@supabase/supabase-js";

export type AuthUserSession = {
  user: User;
  profile: {
    id: string;
    email: string;
    role: UserRole;
    firstname: string;
    lastname: string;
  };
};

/**
 * Vérifie l'authentification et les privilèges de rôle pour les Server Actions
 */
export async function requireRole(
  ...allowedRoles: UserRole[]
): Promise<AuthUserSession> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Authentification requise. Veuillez vous connecter.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id, email, role, firstname, lastname")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    throw new Error("Profil utilisateur introuvable.");
  }

  if (!allowedRoles.includes(profile.role as UserRole)) {
    throw new Error("Accès refusé. Privilèges insuffisants pour effectuer cette action.");
  }

  return {
    user,
    profile: profile as AuthUserSession["profile"],
  };
}
