import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Users,
  GraduationCap,
  BookOpen,
  CalendarCheck,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  LayoutList,
  Group,
  Sparkles,
  TrendingUp,
  FileText,
  ShieldAlert,
  ChevronRight,
  DollarSign,
  Wallet,
  Percent,
  PiggyBank,
  CreditCard,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MascotHeader } from "@/components/mascot/MascotHeader";
import { MascotStatsCard } from "@/components/mascot/MascotStatsCard";
import { MascotTipCard } from "@/components/mascot/MascotTipCard";
import { EmptyState } from "@/components/mascot/EmptyState";
import { Mascot } from "@/components/mascot/Mascot";

async function getDashboardStats() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("role, firstname, lastname")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    if (profile?.role === "professor") redirect("/professor/dashboard");
    else redirect("/student/dashboard");
  }

  // Use local date format instead of UTC ISO slice
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [
    { count: totalUsers },
    { count: totalStudents },
    { count: totalProfessors },
    { count: totalModules },
    { count: totalDomains },
    { count: totalGroups },
    { count: totalRooms },
    { data: studentPaymentsRes },
    { data: profPaymentsRes },
  ] = await Promise.all([
    supabase.from("users").select("*", { count: "exact", head: true }),
    supabase.from("users").select("*", { count: "exact", head: true }).eq("role", "student"),
    supabase.from("users").select("*", { count: "exact", head: true }).eq("role", "professor"),
    supabase.from("modules").select("*", { count: "exact", head: true }),
    supabase.from("domains").select("*", { count: "exact", head: true }),
    supabase.from("groups").select("*", { count: "exact", head: true }),
    supabase.from("rooms").select("*", { count: "exact", head: true }),
    supabase.from("student_payments").select("amount_due, amount_paid, status, billing_period"),
    supabase.from("professor_payments").select("total_amount, status, billing_period"),
  ]);

  // Calculs Financiers de rentabilité de l'école (4-A)
  let totalRevenueDue = 0;
  let totalRevenueCollected = 0;
  let lateStudentsCount = 0;
  let lateAmountDue = 0;

  (studentPaymentsRes || []).forEach((p: {
    amount_due: number;
    amount_paid: number;
    status: string;
    billing_period: string;
  }) => {
    // Si période courante ou total global
    totalRevenueDue += p.amount_due || 0;
    totalRevenueCollected += p.amount_paid || 0;
    if (p.status === "late" || p.status === "unpaid") {
      lateStudentsCount++;
      lateAmountDue += Math.max(0, (p.amount_due || 0) - (p.amount_paid || 0));
    }
  });

  let totalPayroll = 0;
  (profPaymentsRes || []).forEach((p: {
    total_amount: number;
    status: string;
    billing_period: string;
  }) => {
    totalPayroll += p.total_amount || 0;
  });

  const netMargin = totalRevenueCollected - totalPayroll;
  const recoveryRate = totalRevenueDue > 0 ? Math.round((totalRevenueCollected / totalRevenueDue) * 100) : 0;
  const marginPercent = totalRevenueCollected > 0 ? Math.round((netMargin / totalRevenueCollected) * 100) : 0;

  const { data: todaySessions } = await supabase
    .from("sessions")
    .select("id, status")
    .eq("sessiondate", today);

  const totalSessionsToday = todaySessions?.length ?? 0;
  const activeSessions = todaySessions?.filter((s) => s.status === "ACTIVE").length ?? 0;

  return {
    adminName: profile?.firstname ? `${profile.firstname} ${profile.lastname}` : "Administrateur",
    totalUsers: totalUsers ?? 0,
    totalStudents: totalStudents ?? 0,
    totalProfessors: totalProfessors ?? 0,
    totalModules: totalModules ?? 0,
    totalDomains: totalDomains ?? 0,
    totalGroups: totalGroups ?? 0,
    totalRooms: totalRooms ?? 0,
    totalSessionsToday,
    activeSessionsToday: activeSessions,
    currentPeriod,
    totalRevenueDue,
    totalRevenueCollected,
    totalPayroll,
    netMargin,
    recoveryRate,
    marginPercent,
    lateStudentsCount,
    lateAmountDue,
  };
}

export default async function AdminDashboardPage() {
  const stats = await getDashboardStats();

  return (
    <div className="space-y-8 pb-8">
      {/* Hero Welcome Header with Mascot */}
      <MascotHeader
        title={`Bienvenue, ${stats.adminName} 👋`}
        description="Voici la vue d&apos;ensemble en temps réel de votre établissement ITRI Academy."
        pose={stats.totalSessionsToday > 0 ? "celebration" : "bonjour"}
        mascotMessage="Tout est sous contrôle aujourd'hui !"
        badge="Espace Administration"
      >
      </MascotHeader>

      {/* Primary KPI Grid with Mascots */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MascotStatsCard
          title="Communauté Totale"
          value={stats.totalUsers}
          subtitle={`${stats.totalStudents} étudiants · ${stats.totalProfessors} profs`}
          pose="tous"
          trend={{ value: "+12%", positive: true }}
        />
        <MascotStatsCard
          title="Formations & Modules"
          value={stats.totalModules}
          subtitle={`${stats.totalDomains} domaine(s) d'étude`}
          pose="eureka"
          trend={{ value: "+5%", positive: true }}
        />
        <MascotStatsCard
          title="Séances Aujourd'hui"
          value={stats.totalSessionsToday}
          subtitle={`${stats.activeSessionsToday} séance(s) en cours`}
          pose="celebration"
        />
        <MascotStatsCard
          title="Infrastructures"
          value={stats.totalRooms}
          subtitle={`${stats.totalGroups} groupe(s) d'étudiants`}
          pose="reflexion"
        />
      </div>

      {/* Mascot Assistant Tip Banner */}
      <MascotTipCard
        pose="eureka"
        title="Conseil d'Administration SGA"
        description="N'oubliez pas de vérifier les demandes de justifications d'absence régulièrement afin de maintenir un suivi précis de l'assiduité."
        action={
          <Link
            href="/admin/justifications"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#6d28d9] hover:underline"
          >
            <span>Accéder aux justificatifs</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        }
      />

      {/* ---------------- SECTION PILOTAGE FINANCIER & RENTABILITÉ ÉCOLE (4-A) ---------------- */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-black text-[#1e1b4b] flex items-center gap-2">
              <PiggyBank className="h-5 w-5 text-[#6d28d9]" />
              Pilotage Financier & Rentabilité de l&apos;Établissement
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Vue synthétique : Cotisations perçues, masse salariale profs et marge nette d&apos;exploitation.
            </p>
          </div>
          <Link href="/payments">
            <button className="text-xs font-bold text-[#6d28d9] hover:underline flex items-center gap-1">
              <span>Gestion complète des paiements & Caisse</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* CA Encaissé */}
          <Card className="rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-white to-emerald-50/50 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Recettes Cotisations Élèves
              </CardTitle>
              <div className="h-8 w-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                <ArrowDownRight className="h-4 w-4 text-emerald-700" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-emerald-700">
                {stats.totalRevenueCollected.toLocaleString("fr-FR")} DA
              </div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center justify-between">
                <span>Taux de recouvrement :</span>
                <span className="font-bold text-emerald-700">{stats.recoveryRate}%</span>
              </p>
            </CardContent>
          </Card>

          {/* Masse Salariale Enseignants */}
          <Card className="rounded-3xl border border-[#f97316]/20 bg-gradient-to-br from-white to-[#f97316]/5 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Masse Salariale Enseignants
              </CardTitle>
              <div className="h-8 w-8 rounded-xl bg-[#f97316]/10 flex items-center justify-center">
                <ArrowUpRight className="h-4 w-4 text-[#f97316]" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-[#f97316]">
                {stats.totalPayroll.toLocaleString("fr-FR")} DA
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Rémunérations calculées aux séances / heures
              </p>
            </CardContent>
          </Card>

          {/* Marge Nette d'Exploitation */}
          <Card className="rounded-3xl border border-[#6d28d9]/25 bg-gradient-to-br from-white via-purple-50/30 to-[#6d28d9]/10 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Marge Nette de l&apos;École
              </CardTitle>
              <div className="h-8 w-8 rounded-xl bg-[#6d28d9]/15 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-[#6d28d9]" />
              </div>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-black ${stats.netMargin >= 0 ? "text-[#6d28d9]" : "text-rose-600"}`}>
                {stats.netMargin.toLocaleString("fr-FR")} DA
              </div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center justify-between">
                <span>Marge bénéficiaire :</span>
                <span className="font-bold text-[#6d28d9]">{stats.marginPercent}%</span>
              </p>
            </CardContent>
          </Card>

          {/* Suivi des Impayés */}
          <Card className="rounded-3xl border border-rose-500/20 bg-gradient-to-br from-white to-rose-50/50 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Impayés & Retards Élèves
              </CardTitle>
              <div className="h-8 w-8 rounded-xl bg-rose-100 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-rose-700" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-rose-700">
                {stats.lateAmountDue.toLocaleString("fr-FR")} DA
              </div>
              <p className="text-xs text-rose-600 font-medium mt-1">
                {stats.lateStudentsCount} élève(s) avec solde débiteur
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Active Sessions Card */}
        <Card className="border border-[#6d28d9]/10 bg-white shadow-xs rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-bold text-[#1a1a2e]">
              <div className="rounded-xl bg-[#f97316]/10 p-2">
                <Activity className="h-4 w-4 text-[#f97316]" />
              </div>
              Activité des Cours en Direct
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.activeSessionsToday > 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <Mascot pose="celebration" size="lg" animate={true} />
                <p className="mt-3 text-lg font-bold text-[#1a1a2e]">
                  {stats.activeSessionsToday} cours actuellement en cours !
                </p>
                <p className="text-xs text-[#64748b] mt-1 max-w-sm">
                  Les présences sont en cours d&apos;enregistrement par les enseignants.
                </p>
              </div>
            ) : (
              <EmptyState
                compact
                pose="reflexion"
                title="Aucune séance en cours actuellement"
                hint="Les cours programmés s'afficheront ici une fois démarrés par les enseignants."
              />
            )}
          </CardContent>
        </Card>

        {/* Community Distribution */}
        <Card className="border border-[#6d28d9]/10 bg-white shadow-xs rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-bold text-[#1a1a2e]">
              <div className="rounded-xl bg-[#6d28d9]/10 p-2">
                <Users className="h-4 w-4 text-[#6d28d9]" />
              </div>
              Répartition des Utilisateurs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6 py-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-[#64748b]">Étudiants</span>
                  <span className="font-bold text-[#1a1a2e]">
                    {stats.totalStudents} ({((stats.totalStudents / Math.max(stats.totalUsers, 1)) * 100).toFixed(0)}%)
                  </span>
                </div>
                <div className="h-3 rounded-full bg-[#f8f9fc] overflow-hidden p-0.5 border border-[#6d28d9]/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#6d28d9] to-[#8b5cf6] transition-all"
                    style={{
                      width: `${(stats.totalStudents / Math.max(stats.totalUsers, 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-[#64748b]">Professeurs</span>
                  <span className="font-bold text-[#1a1a2e]">
                    {stats.totalProfessors} ({((stats.totalProfessors / Math.max(stats.totalUsers, 1)) * 100).toFixed(0)}%)
                  </span>
                </div>
                <div className="h-3 rounded-full bg-[#f8f9fc] overflow-hidden p-0.5 border border-[#6d28d9]/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#f97316] to-[#fb923c] transition-all"
                    style={{
                      width: `${(stats.totalProfessors / Math.max(stats.totalUsers, 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-[#6d28d9]/5 flex items-center justify-between text-xs text-[#64748b]">
                <div className="flex items-center gap-1.5 font-semibold">
                  <Sparkles className="h-4 w-4 text-[#f59e0b]" />
                  <span>{stats.totalModules} modules actifs</span>
                </div>
                <Link href="/students" className="font-bold text-[#6d28d9] hover:underline">
                  Gérer la communauté &rarr;
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
