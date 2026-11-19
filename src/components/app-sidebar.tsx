"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  GraduationCap,
  UserCheck,
  Shield,
  LayoutList,
  BookOpen,
  Group,
  ClipboardList,
  CalendarDays,
  Building2,
  Home,
  History,
  BarChart3,
  LogOut,
  Sparkles,
  User,
  CreditCard,
} from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Mascot } from "@/components/mascot/Mascot";
import { cn } from "@/lib/utils";
import { todayLocal } from "@/lib/dates";
import type { UserRole } from "@/types/database";

import Image from "next/image";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const adminNav: NavSection[] = [
  {
    label: "Accueil",
    items: [
      { label: "Aujourd'hui", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Élèves",
    items: [
      { label: "Liste des élèves", href: "/students", icon: GraduationCap },
      { label: "Inscriptions", href: "/enrollments", icon: ClipboardList },
    ],
  },
  {
    label: "Classes & Planning",
    items: [
      { label: "Emploi du temps", href: "/schedule", icon: CalendarDays },
      { label: "Classes", href: "/groups", icon: Group },
    ],
  },
  {
    label: "Équipe pédagogique",
    items: [
      { label: "Enseignants", href: "/professors", icon: UserCheck },
    ],
  },
  {
    label: "Finances",
    items: [
      { label: "Paiements & Caisse", href: "/payments", icon: CreditCard },
    ],
  },
  {
    label: "Configuration",
    items: [
      { label: "Matières & Tarifs", href: "/modules", icon: BookOpen },
      { label: "Domaines", href: "/domains", icon: LayoutList },
      { label: "Sections", href: "/sections", icon: Sparkles },
      { label: "Salles de cours", href: "/rooms", icon: Building2 },
      { label: "Comptes utilisateurs", href: "/admin/users", icon: Shield },
    ],
  },
];

const secretaryNav: NavSection[] = [
  {
    label: "Secrétariat & Présences",
    items: [
      { label: "Séances du jour", href: "/secretary/dashboard", icon: CalendarDays },
      { label: "Emploi du temps", href: "/schedule", icon: LayoutDashboard },
    ],
  },
  {
    label: "Élèves & Inscriptions",
    items: [
      { label: "Liste des élèves", href: "/students", icon: GraduationCap },
      { label: "Inscriptions", href: "/enrollments", icon: ClipboardList },
      { label: "Classes", href: "/groups", icon: Group },
    ],
  },
  {
    label: "Finances & Caisse",
    items: [
      { label: "Paiements & Caisse", href: "/payments", icon: CreditCard },
    ],
  },
];

const professorNav: NavSection[] = [
  {
    label: "Espace Enseignant",
    items: [
      { label: "Aujourd'hui", href: "/professor/dashboard", icon: Home },
      { label: "Emploi du temps", href: "/professor/timetable", icon: CalendarDays },
      { label: "Historique", href: "/professor/history", icon: History },
      { label: "Statistiques", href: "/professor/analytics", icon: BarChart3 },
    ],
  },
];

const studentNav: NavSection[] = [
  {
    label: "Espace Étudiant",
    items: [
      { label: "Vue d'ensemble", href: "/student/dashboard", icon: LayoutDashboard },
      { label: "Emploi du temps", href: "/student/timetable", icon: CalendarDays },
      { label: "Mes Absences", href: "/student/absences", icon: ClipboardList },
    ],
  },
];

export function AppSidebar({
  user,
}: {
  user: { id: string; fullName: string; initials: string; role: UserRole; email: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [lateCount, setLateCount] = useState<number>(0);

  useEffect(() => {
    if (user.role === "admin" || user.role === "secretary") {
      void (async () => {
        const today = todayLocal();
        const { count } = await supabase
          .from("student_payments")
          .select("id", { count: "exact", head: true })
          .or(`status.eq.late,and(status.neq.paid,due_date.lt.${today})`);
        if (count && count > 0) {
          setLateCount(count);
        }
      })();
    }
  }, [user.role, supabase]);

  const getNav = (): NavSection[] => {
    let baseNav: NavSection[] = [];
    switch (user.role) {
      case "admin":
        baseNav = adminNav;
        break;
      case "secretary":
        baseNav = secretaryNav;
        break;
      case "professor":
        baseNav = professorNav;
        break;
      case "student":
        baseNav = studentNav;
        break;
      default:
        baseNav = [];
    }

    if (lateCount > 0 && (user.role === "admin" || user.role === "secretary")) {
      return baseNav.map((sec) => ({
        ...sec,
        items: sec.items.map((item) =>
          item.href === "/payments"
            ? { ...item, badge: `${lateCount} retard${lateCount > 1 ? "s" : ""}` }
            : item
        ),
      }));
    }

    return baseNav;
  };

  const sections = getNav();
  const roleLabel: Record<UserRole, string> = {
    admin: "Administrateur",
    secretary: "Secrétaire",
    professor: "Professeur",
    student: "Élève",
  };

  const roleBadgeColor: Record<UserRole, string> = {
    admin: "bg-[#6d28d9]/10 text-[#6d28d9] border-[#6d28d9]/20",
    secretary: "bg-emerald-50 text-emerald-700 border-emerald-200",
    professor: "bg-amber-50 text-amber-700 border-amber-200",
    student: "bg-[#6d28d9]/10 text-[#6d28d9] border-[#6d28d9]/20",
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const isActive = (href: string) => pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  return (
    <Sidebar variant="sidebar" collapsible="icon" className="border-r border-[#6d28d9]/10 bg-white">
      {/* Sidebar Header with Brand & Mascot */}
      <SidebarHeader className="border-b border-[#6d28d9]/5 px-3 py-3">
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#6d28d9] to-[#8b5cf6] p-0.5 shadow-md shadow-[#6d28d9]/25">
            <Image src="/logo.png" alt="ITRI Academy" width={44} height={44} className="h-full w-full object-cover rounded-[14px]" />
          </div>

          <div className="flex flex-col group-data-[collapsible=icon]:hidden min-w-0">
            <span className="text-base font-extrabold tracking-tight text-[#1a1a2e] truncate">
              ITRI Academy
            </span>
            <span className="flex items-center gap-1 text-[11px] font-semibold text-[#6d28d9]">
              <Sparkles className="h-3 w-3 text-[#f97316]" />
              SGA Web
            </span>
          </div>
        </div>
      </SidebarHeader>

      {/* Navigation Links */}
      <SidebarContent className="px-2 py-4">
        {sections.map((section, si) => (
          <SidebarGroup key={si} className="py-2">
            <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden px-2 text-[10px] font-extrabold uppercase tracking-widest text-[#64748b]/70">
              {section.label}
            </SidebarGroupLabel>

            <SidebarGroupContent className="mt-1">
              <SidebarMenu>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={active}
                        tooltip={item.label}
                        className={cn(
                          "relative group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200",
                          active
                            ? "bg-gradient-to-r from-[#6d28d9] to-[#8b5cf6] text-white shadow-md shadow-[#6d28d9]/20"
                            : "text-[#475569] hover:bg-[#6d28d9]/5 hover:text-[#6d28d9]"
                        )}
                      >
                        <Icon className={cn("h-4 w-4 shrink-0 transition-transform group-hover:scale-110", active ? "text-white" : "text-[#64748b] group-hover:text-[#6d28d9]")} />
                        <span className="truncate group-data-[collapsible=icon]:hidden">{item.label}</span>

                        {item.badge && (
                          <Badge
                            variant="secondary"
                            className={cn(
                              "ml-auto text-[10px] font-bold border-none group-data-[collapsible=icon]:hidden",
                              active
                                ? "bg-white/20 text-white"
                                : "bg-[#f97316]/10 text-[#f97316]"
                            )}
                          >
                            {item.badge}
                          </Badge>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>

            {si < sections.length - 1 && (
              <SidebarSeparator className="my-2 bg-[#6d28d9]/[0.06]" />
            )}
          </SidebarGroup>
        ))}

        <SidebarSeparator className="my-2 bg-[#6d28d9]/[0.06]" />

        {/* Profile Link */}
        <SidebarGroup>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden px-2 text-[10px] font-extrabold uppercase tracking-widest text-[#64748b]/70">
            Mon Compte
          </SidebarGroupLabel>
          <SidebarGroupContent className="mt-1">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<Link href="/profile" />}
                  isActive={pathname === "/profile"}
                  tooltip="Profil utilisateur"
                  className={cn(
                    "relative group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200",
                    pathname === "/profile"
                      ? "bg-gradient-to-r from-[#6d28d9] to-[#8b5cf6] text-white shadow-md shadow-[#6d28d9]/20"
                      : "text-[#475569] hover:bg-[#6d28d9]/5 hover:text-[#6d28d9]"
                  )}
                >
                  <User className={cn("h-4 w-4 shrink-0 transition-transform group-hover:scale-110", pathname === "/profile" ? "text-white" : "text-[#64748b] group-hover:text-[#6d28d9]")} />
                  <span className="truncate group-data-[collapsible=icon]:hidden">Mon Profil</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Mascot Mini Assistant Card inside Sidebar */}
        <div className="mt-4 px-2 group-data-[collapsible=icon]:hidden">
          <div className="relative overflow-hidden rounded-2xl border border-[#6d28d9]/10 bg-gradient-to-br from-[#f8f9fc] via-white to-[#f3f0ff] p-3 text-left shadow-xs">
            <div className="flex items-center gap-2">
              <Mascot pose="eureka" size="xs" animate={true} />
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-bold text-[#1a1a2e]">Astuce SGA</span>
                <span className="text-[10px] text-[#64748b] truncate">Gestion rapide & sécurisée</span>
              </div>
            </div>
          </div>
        </div>
      </SidebarContent>

      {/* Sidebar Footer with User Info */}
      <SidebarFooter className="border-t border-[#6d28d9]/5 p-3">
        <div className="flex items-center gap-3 rounded-2xl bg-[#f8f9fc] p-2 transition-colors hover:bg-[#f3f0ff]/50 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0">
          <Avatar className="h-9 w-9 shrink-0 rounded-xl ring-2 ring-[#6d28d9]/20">
            <AvatarFallback className="bg-gradient-to-br from-[#6d28d9] to-[#8b5cf6] text-xs font-bold text-white">
              {user.initials}
            </AvatarFallback>
          </Avatar>

          <div className="flex flex-1 flex-col min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="text-xs font-bold text-[#1a1a2e] truncate">{user.fullName}</span>
            <span className={cn("inline-block w-fit rounded-md border px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide", roleBadgeColor[user.role])}>
              {roleLabel[user.role]}
            </span>
          </div>

          <button
            onClick={handleLogout}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-[#64748b] transition-all hover:bg-rose-50 hover:text-rose-600 shrink-0 group-data-[collapsible=icon]:hidden"
            aria-label="Se déconnecter"
            title="Se déconnecter"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
