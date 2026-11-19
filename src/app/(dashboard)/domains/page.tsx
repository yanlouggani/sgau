import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DomainsManagement } from "@/components/admin/domains-management";

export default async function DomainsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: domains } = await supabase
    .from("domains")
    .select("id, name, isactive")
    .order("name");

  const formatted = (domains ?? []).map((d: Record<string, unknown>) => ({
    id: d.id as string,
    name: d.name as string,
    isActive: (d.isactive ?? true) as boolean,
  }));

  return <DomainsManagement initialDomains={formatted} />;
}
