"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Search,
  Plus,
  MoreHorizontal,
  Edit,
  Trash2,
  Loader2,
  Shield,
  UserCheck,
  User,
  GraduationCap,
  ClipboardList,
  Eye,
  EyeOff,
  KeyRound,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { Mascot } from "@/components/mascot/Mascot";
import { MascotHeader } from "@/components/mascot/MascotHeader";
import { EmptyState } from "@/components/mascot/EmptyState";
import type { AppUser, UserRole } from "@/types/database";
import { createUserAction, updateUserAuthAction } from "@/lib/actions/admin-users";
import { cn } from "@/lib/utils";

type FormData = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
};

const emptyForm: FormData = {
  email: "",
  password: "",
  firstName: "",
  lastName: "",
  role: "secretary",
  isActive: true,
};

const ROLE_DEFINITIONS: {
  role: UserRole;
  label: string;
  shortLabel: string;
  description: string;
  icon: typeof Shield;
  color: string;
  bgLight: string;
  badgeStyle: string;
  activeBorder: string;
}[] = [
  {
    role: "admin",
    label: "Administrateur",
    shortLabel: "Admin",
    description: "Accès total au système, finances, configurations et gestion d'école.",
    icon: Shield,
    color: "text-[#6d28d9]",
    bgLight: "bg-[#6d28d9]/10",
    badgeStyle: "bg-[#6d28d9]/10 text-[#6d28d9] border-[#6d28d9]/25 font-bold",
    activeBorder: "border-[#6d28d9] ring-2 ring-[#6d28d9]/20",
  },
  {
    role: "secretary",
    label: "Secrétaire",
    shortLabel: "Secrétariat",
    description: "Gestion des inscriptions, paiements / caisse, emplois du temps et présences.",
    icon: ClipboardList,
    color: "text-[#7c3aed]",
    bgLight: "bg-purple-100",
    badgeStyle: "bg-purple-100 text-[#5b21b6] border-purple-200 font-bold",
    activeBorder: "border-[#7c3aed] ring-2 ring-[#7c3aed]/20",
  },
  {
    role: "professor",
    label: "Professeur",
    shortLabel: "Enseignant",
    description: "Accès à son planning personnel, appel et saisie des présences en classe.",
    icon: UserCheck,
    color: "text-emerald-700",
    bgLight: "bg-emerald-50",
    badgeStyle: "bg-emerald-50 text-emerald-700 border-emerald-200 font-bold",
    activeBorder: "border-emerald-600 ring-2 ring-emerald-500/20",
  },
  {
    role: "student",
    label: "Élève",
    shortLabel: "Élève",
    description: "Accès à son badge QR Code d'entrée, son planning et son suivi d'assiduité.",
    icon: GraduationCap,
    color: "text-amber-800",
    bgLight: "bg-amber-50",
    badgeStyle: "bg-amber-50 text-amber-800 border-amber-200 font-bold",
    activeBorder: "border-amber-600 ring-2 ring-amber-500/20",
  },
];

export function UsersManagement({
  initialUsers,
}: {
  initialUsers: AppUser[];
}) {
  const [users, setUsers] = useState<AppUser[]>(initialUsers);
  const [search, setSearch] = useState("");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  // Statistiques par rôle
  const roleCounts = {
    all: users.length,
    admin: users.filter((u) => u.role === "admin").length,
    secretary: users.filter((u) => u.role === "secretary").length,
    professor: users.filter((u) => u.role === "professor").length,
    student: users.filter((u) => u.role === "student").length,
  };

  const filtered = users.filter((u) => {
    const term = search.trim().toLowerCase();
    const matchesSearch =
      !term ||
      u.fullName.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term);
    const matchesRole =
      selectedRoleFilter === "all" || u.role === selectedRoleFilter;
    return matchesSearch && matchesRole;
  });

  const openAdd = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setShowPassword(false);
    setDialogOpen(true);
  };

  const openEdit = (user: AppUser) => {
    setEditingUser(user);
    setForm({
      email: user.email,
      password: "",
      firstName: user.firstname,
      lastName: user.lastname,
      role: user.role,
      isActive: user.isactive ?? true,
    });
    setShowPassword(false);
    setDialogOpen(true);
  };

  const generateRandomPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    let pass = "";
    for (let i = 0; i < 12; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setForm((prev) => ({ ...prev, password: pass }));
    setShowPassword(true);
    toast.info("Mot de passe généré automatiquement", { description: pass });
  };

  const handleSave = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.error("Veuillez saisir le prénom et le nom de l'utilisateur.");
      return;
    }
    if (!form.email.trim() || !form.email.includes("@")) {
      toast.error("Veuillez saisir une adresse email valide.");
      return;
    }
    if (!editingUser && (!form.password || form.password.length < 6)) {
      toast.error("Le mot de passe doit comporter au moins 6 caractères.");
      return;
    }

    setSaving(true);
    try {
      if (editingUser) {
        // Mise à jour profil
        const { error } = await supabase
          .from("users")
          .update({
            email: form.email.trim().toLowerCase(),
            firstname: form.firstName.trim(),
            lastname: form.lastName.trim(),
            role: form.role,
            isactive: form.isActive,
          })
          .eq("id", editingUser.id);
        if (error) throw error;

        // Mise à jour mot de passe auth si renseigné
        if (form.password && form.password.trim().length >= 6) {
          await updateUserAuthAction({ id: editingUser.id, password: form.password.trim() });
        }

        setUsers((prev) =>
          prev.map((u) =>
            u.id === editingUser.id
              ? {
                  ...u,
                  email: form.email.trim().toLowerCase(),
                  firstname: form.firstName.trim(),
                  lastname: form.lastName.trim(),
                  role: form.role,
                  isactive: form.isActive,
                  fullName: `${form.firstName.trim()} ${form.lastName.trim()}`,
                  initials: `${(form.firstName.trim()[0] ?? "").toUpperCase()}${(form.lastName.trim()[0] ?? "").toUpperCase()}`,
                }
              : u
          )
        );
        toast.success("Compte utilisateur mis à jour");
      } else {
        // Création nouveau compte avec rôle choisi
        const { user: createdUser } = await createUserAction({
          email: form.email.trim().toLowerCase(),
          password: form.password,
          firstname: form.firstName.trim(),
          lastname: form.lastName.trim(),
          role: form.role,
        });

        if (!createdUser) throw new Error("Échec de la création du compte.");

        // Si le compte a été marqué inactif lors de la création
        if (!form.isActive) {
          await supabase
            .from("users")
            .update({ isactive: false })
            .eq("id", createdUser.id);
        }

        const appUser: AppUser = {
          id: createdUser.id,
          email: form.email.trim().toLowerCase(),
          firstname: form.firstName.trim(),
          lastname: form.lastName.trim(),
          role: form.role,
          isactive: form.isActive,
          identifier: null,
          fullName: `${form.firstName.trim()} ${form.lastName.trim()}`,
          initials: `${(form.firstName.trim()[0] ?? "").toUpperCase()}${(form.lastName.trim()[0] ?? "").toUpperCase()}`,
        };

        setUsers((prev) => [appUser, ...prev]);
        toast.success(`Compte ${getRoleLabel(form.role)} créé avec succès !`);
      }
      setDialogOpen(false);
    } catch (err) {
      toast.error("Erreur lors de l'enregistrement", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.rpc("admin_delete_user", { p_uid: deleteTarget.id });
      if (error) {
        toast.error("Erreur de suppression", { description: error.message });
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      toast.success("Utilisateur supprimé définitivement");
      setDeleteTarget(null);
    } catch (err: unknown) {
      toast.error("Erreur", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setDeleting(false);
    }
  };

  const getRoleBadge = (role: string) => {
    const def = ROLE_DEFINITIONS.find((r) => r.role === role);
    return def ? def.badgeStyle : "bg-slate-100 text-slate-700 font-bold";
  };

  const getRoleLabel = (role: string) => {
    const def = ROLE_DEFINITIONS.find((r) => r.role === role);
    return def ? def.label : role;
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "admin":
        return <Shield className="h-3.5 w-3.5 text-[#6d28d9]" />;
      case "secretary":
        return <ClipboardList className="h-3.5 w-3.5 text-[#7c3aed]" />;
      case "professor":
        return <UserCheck className="h-3.5 w-3.5 text-emerald-600" />;
      default:
        return <GraduationCap className="h-3.5 w-3.5 text-amber-600" />;
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <MascotHeader
        title="Comptes Utilisateurs"
        description="Gérez les comptes d'accès : Administrateurs, Secrétaires, Professeurs et Élèves."
        pose="bonjour"
        mascotMessage={`${users.length} utilisateur(s) enregistrés dans le système.`}
        badge="Gestion des Accès"
      >
        <Button
          onClick={openAdd}
          className="h-11 rounded-2xl bg-gradient-to-r from-[#6d28d9] to-[#8b5cf6] px-5 font-bold text-white shadow-md shadow-[#6d28d9]/20 hover:shadow-lg"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nouveau compte utilisateur
        </Button>
      </MascotHeader>

      {/* Onglets de filtrage par Rôle */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={selectedRoleFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedRoleFilter("all")}
          className={cn(
            "rounded-xl font-bold text-xs h-9 px-3.5 transition-all",
            selectedRoleFilter === "all"
              ? "bg-[#6d28d9] text-white shadow-xs"
              : "border-slate-200 text-[#334155] hover:text-[#6d28d9] hover:bg-[#6d28d9]/5"
          )}
        >
          Tous les comptes
          <Badge
            variant="secondary"
            className={cn(
              "ml-1.5 px-1.5 py-0 text-[10px] font-black rounded-md",
              selectedRoleFilter === "all" ? "bg-white/20 text-white" : "bg-slate-100 text-[#334155]"
            )}
          >
            {roleCounts.all}
          </Badge>
        </Button>

        {ROLE_DEFINITIONS.map((def) => {
          const Icon = def.icon;
          const isActive = selectedRoleFilter === def.role;
          const count = roleCounts[def.role];
          return (
            <Button
              key={def.role}
              variant={isActive ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedRoleFilter(def.role)}
              className={cn(
                "rounded-xl font-bold text-xs h-9 px-3.5 gap-1.5 transition-all",
                isActive
                  ? "bg-[#6d28d9] text-white shadow-xs"
                  : "border-slate-200 text-[#334155] hover:text-[#6d28d9] hover:bg-[#6d28d9]/5"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{def.label}s</span>
              <Badge
                variant="secondary"
                className={cn(
                  "px-1.5 py-0 text-[10px] font-black rounded-md",
                  isActive ? "bg-white/20 text-white" : "bg-slate-100 text-[#334155]"
                )}
              >
                {count}
              </Badge>
            </Button>
          );
        })}
      </div>

      {/* Carte Principale avec Tableau */}
      <Card className="overflow-hidden rounded-3xl border border-[#6d28d9]/10 bg-white shadow-xs">
        <CardHeader className="p-5 border-b border-[#6d28d9]/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6d28d9]" />
            <Input
              placeholder="Rechercher par nom, prénom ou email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 rounded-2xl border-[#6d28d9]/15 bg-[#f8f9fc] pl-10 text-xs font-semibold text-[#0f172a] focus:border-[#6d28d9] focus:bg-white"
            />
          </div>
          <p className="text-xs font-bold text-[#475569] shrink-0">
            {filtered.length} compte{filtered.length > 1 ? "s" : ""} affiché{filtered.length > 1 ? "s" : ""}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              compact
              pose="reflexion"
              title="Aucun compte trouvé"
              hint={
                search
                  ? "Aucun résultat pour cette recherche. Essayez avec d'autres termes."
                  : "Aucun utilisateur n'est enregistré pour ce rôle."
              }
            />
          ) : (
            <Table>
              <TableHeader className="bg-[#f8f9fc]">
                <TableRow className="border-b border-[#6d28d9]/5">
                  <TableHead className="py-4 text-xs font-extrabold uppercase tracking-wider text-[#6d28d9]">
                    Utilisateur
                  </TableHead>
                  <TableHead className="py-4 text-xs font-extrabold uppercase tracking-wider text-[#6d28d9]">
                    Rôle attribué
                  </TableHead>
                  <TableHead className="hidden py-4 text-xs font-extrabold uppercase tracking-wider text-[#6d28d9] sm:table-cell">
                    Statut du compte
                  </TableHead>
                  <TableHead className="w-12 py-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((user) => (
                  <TableRow
                    key={user.id}
                    className="border-b border-[#6d28d9]/5 hover:bg-[#f3f0ff]/30 transition-colors"
                  >
                    <TableCell className="py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border border-[#6d28d9]/20 ring-1 ring-[#6d28d9]/10">
                          <AvatarFallback className="bg-gradient-to-br from-[#6d28d9] to-[#8b5cf6] text-xs font-bold text-white">
                            {user.initials}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-bold text-[#0f172a] leading-none">
                            {user.fullName}
                          </p>
                          <p className="text-xs text-[#475569] mt-1 font-semibold">
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5">
                      <Badge
                        variant="outline"
                        className={cn("gap-1 rounded-lg px-2.5 py-1 text-xs", getRoleBadge(user.role))}
                      >
                        {getRoleIcon(user.role)}
                        {getRoleLabel(user.role)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden py-3.5 sm:table-cell">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold",
                          user.isactive
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        )}
                      >
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full",
                            user.isactive ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                          )}
                        />
                        {user.isactive ? "Actif" : "Inactif"}
                      </span>
                    </TableCell>
                    <TableCell className="py-3.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-xl text-[#475569] hover:bg-[#6d28d9]/10 hover:text-[#6d28d9]"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent
                          align="end"
                          className="w-44 rounded-2xl p-1.5 shadow-xl border-[#6d28d9]/10"
                        >
                          <DropdownMenuItem
                            onClick={() => openEdit(user)}
                            className="rounded-xl text-xs font-semibold cursor-pointer"
                          >
                            <Edit className="mr-2 h-4 w-4 text-[#6d28d9]" />
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="rounded-xl text-xs font-semibold text-rose-600 focus:bg-rose-50 cursor-pointer"
                            onClick={() => setDeleteTarget(user)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ---------------- MODAL CRÉATION / ÉDITION COMPTE AVEC CHOIX DU RÔLE ---------------- */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[560px] rounded-3xl p-6 sm:p-7 border-[#6d28d9]/25 shadow-2xl">
          <DialogHeader className="space-y-1">
            <div className="flex items-center gap-3">
              <Mascot pose="validation" size="sm" />
              <div>
                <DialogTitle className="text-lg font-black text-[#0f172a]">
                  {editingUser ? "Modifier le compte utilisateur" : "Nouveau compte utilisateur"}
                </DialogTitle>
                <DialogDescription className="text-xs font-semibold text-[#475569]">
                  {editingUser
                    ? "Mettez à jour les informations, le rôle ou le mot de passe."
                    : "Choisissez le rôle à attribuer et configurez les accès du compte."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* SÉLECTEUR DE RÔLE VISUEL ET INTERACTIF */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-[#0f172a]">
                Rôle du compte *
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {ROLE_DEFINITIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = form.role === opt.role;
                  return (
                    <button
                      key={opt.role}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, role: opt.role }))}
                      className={cn(
                        "flex items-start gap-2.5 p-3 rounded-2xl border text-left transition-all duration-150 cursor-pointer relative",
                        isSelected
                          ? cn("bg-white shadow-xs", opt.activeBorder)
                          : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60"
                      )}
                    >
                      <div
                        className={cn("rounded-xl p-2 shrink-0", opt.bgLight, opt.color)}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span
                            className={cn(
                              "text-xs font-black",
                              isSelected ? opt.color : "text-[#0f172a]"
                            )}
                          >
                            {opt.label}
                          </span>
                          {isSelected && (
                            <div className="h-4 w-4 rounded-full bg-[#6d28d9] flex items-center justify-center text-white">
                              <Check className="h-2.5 w-2.5 stroke-[3]" />
                            </div>
                          )}
                        </div>
                        <p className="text-[11px] text-[#475569] leading-snug mt-0.5 font-medium line-clamp-2">
                          {opt.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Identité : Prénom & Nom */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName" className="text-xs font-bold text-[#0f172a]">
                  Prénom *
                </Label>
                <Input
                  id="firstName"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  placeholder="Ex: Sarah"
                  className="rounded-xl border-slate-200 text-xs font-medium focus:border-[#6d28d9]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName" className="text-xs font-bold text-[#0f172a]">
                  Nom *
                </Label>
                <Input
                  id="lastName"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  placeholder="Ex: Benali"
                  className="rounded-xl border-slate-200 text-xs font-medium focus:border-[#6d28d9]"
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-bold text-[#0f172a]">
                Adresse email *
              </Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="nom@itri-academy.com"
                className="rounded-xl border-slate-200 text-xs font-medium focus:border-[#6d28d9]"
              />
            </div>

            {/* Mot de passe */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-bold text-[#0f172a]">
                  {editingUser ? "Nouveau mot de passe" : "Mot de passe *"}
                </Label>
                <button
                  type="button"
                  onClick={generateRandomPassword}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#6d28d9] hover:underline cursor-pointer"
                >
                  <KeyRound className="h-3 w-3" />
                  Générer automatiquement
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={
                    editingUser
                      ? "Laisser vide si inchangé"
                      : "Minimum 6 caractères (ex: Securite2026!)"
                  }
                  className="rounded-xl border-slate-200 text-xs font-medium focus:border-[#6d28d9] pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#475569] hover:text-[#6d28d9] transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Statut actif */}
            <div className="flex items-center gap-2.5 pt-1">
              <input
                type="checkbox"
                id="user-active"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-[#6d28d9] focus:ring-[#6d28d9]"
              />
              <Label htmlFor="user-active" className="text-xs font-semibold text-[#0f172a] cursor-pointer">
                Compte actif (autoriser la connexion à la plateforme)
              </Label>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 mt-4 pt-4 border-t border-[#6d28d9]/10">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="rounded-xl border-slate-200 text-[#334155] font-bold text-xs h-10 px-4"
            >
              Annuler
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-[#6d28d9] hover:bg-[#5b21b6] text-white font-bold text-xs h-10 px-5 gap-2"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingUser ? "Enregistrer les modifications" : `Créer le compte ${getRoleLabel(form.role)}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Suppression Utilisateur AlertDialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet utilisateur ?</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer définitivement le compte de{" "}
              <strong className="text-[#0f172a] font-bold">{deleteTarget?.fullName}</strong> ({deleteTarget?.email}) ?
              Cette action supprimera également ses droits d&apos;accès.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Supprimer l&apos;utilisateur
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
