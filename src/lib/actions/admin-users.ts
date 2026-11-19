"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createUserAction(params: {
  email: string;
  password?: string;
  firstname: string;
  lastname: string;
  role: string;
}) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error("Non autorisé");
  
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin" && profile?.role !== "secretary") {
    throw new Error("Privilèges insuffisants");
  }

  const adminClient = createAdminClient();

  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: params.email,
    password: params.password,
    email_confirm: true,
    user_metadata: {
      firstname: params.firstname,
      lastname: params.lastname,
      role: params.role,
    }
  });

  if (authError) throw authError;
  if (!authData.user) throw new Error("Erreur création utilisateur");

  const { error: rpcError } = await supabase.rpc("admin_finalize_user", {
    p_uid: authData.user.id,
    p_group_id: null
  });

  if (rpcError) {
    throw rpcError;
  }

  return { user: authData.user };
}

export async function updateUserAuthAction(params: {
  id: string;
  password?: string;
}) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error("Non autorisé");
  
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin" && profile?.role !== "secretary") {
    throw new Error("Privilèges insuffisants");
  }

  const adminClient = createAdminClient();
  
  const updates: any = {};
  if (params.password) updates.password = params.password;

  if (Object.keys(updates).length > 0) {
    const { data, error } = await adminClient.auth.admin.updateUserById(params.id, updates);
    if (error) throw error;
    return { user: data.user };
  }
  return { user: null };
}
