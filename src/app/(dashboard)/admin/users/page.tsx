import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { UsersManagement } from "@/components/admin/users-management";
import type { AppUser, UserRole } from "@/types/database";

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: users } = await supabase
    .from("users")
    .select("*")
    .order("createdat", { ascending: false });

  const formatted: AppUser[] = (users ?? []).map((u: Record<string, unknown>) => ({
    id: u.id as string,
    email: (u.email as string) ?? "",
    firstname: (u.firstname as string) ?? "",
    lastname: (u.lastname as string) ?? "",
    role: ((u.role as string) ?? "student") as UserRole,
    isactive: (u.isactive as boolean) ?? true,
    identifier: (u.identifier as string) ?? null,
    get fullName() {
      const fn = `${this.firstname} ${this.lastname}`.trim();
      return fn || this.email || "Utilisateur sans nom";
    },
    get initials() {
      const f = this.firstname?.[0] ?? "";
      const l = this.lastname?.[0] ?? "";
      return (f + l).toUpperCase() || "U";
    },
  }));

  return <UsersManagement initialUsers={formatted} />;
}
