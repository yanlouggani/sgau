"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Search, Plus, MoreHorizontal, Edit, Trash2, Loader2, Shield, UserCheck, User,
} from "lucide-react";
import { toast } from "sonner";
import { Mascot } from "@/components/mascot/Mascot";
import { MascotHeader } from "@/components/mascot/MascotHeader";
import type { AppUser, UserRole } from "@/types/database";
import { createUserAction, updateUserAuthAction } from "@/lib/actions/admin-users";

type FormData = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
};

const emptyForm: FormData = {
  email: "",
  password: "",
  firstName: "",
  lastName: "",
  role: "student",
};

export function UsersManagement({
  initialUsers,
}: {
  initialUsers: AppUser[];
}) {
  const [users, setUsers] = useState<AppUser[]>(initialUsers);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const filtered = users.filter(
    (u) =>
      u.fullName.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setEditingUser(null);
    setForm(emptyForm);
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
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingUser) {
        const { error } = await supabase
          .from("users")
          .update({
            email: form.email,
            firstname: form.firstName,
            lastname: form.lastName,
            role: form.role,
          })
          .eq("id", editingUser.id);
        if (error) throw error;
        
        if (form.password) {
          await updateUserAuthAction({ id: editingUser.id, password: form.password });
        }

        setUsers((prev) =>
          prev.map((u) =>
            u.id === editingUser.id
              ? {
                  ...u,
                  ...form,
                  role: form.role as UserRole,
                  fullName: `${form.firstName} ${form.lastName}`,
                }
              : u
          )
        );
        toast.success("Utilisateur mis à jour");
      } else {
        const { user: createdUser } = await createUserAction({
          email: form.email,
          password: form.password,
          firstname: form.firstName,
          lastname: form.lastName,
          role: form.role,
        });
        if (!createdUser) throw new Error("Échec de la création");

        const { data: newUser } = await supabase
          .from("users")
          .select("*")
          .eq("id", createdUser.id)
          .maybeSingle();

        if (newUser) {
          const u = newUser as Record<string, unknown>;
          const appUser: AppUser = {
            id: u.id as string,
            email: u.email as string,
            firstname: u.firstname as string,
            lastname: u.lastname as string,
            role: u.role as UserRole,
            isactive: u.isactive as boolean,
            identifier: (u.identifier as string) ?? null,
            get fullName() { return `${this.firstname} ${this.lastname}`; },
            get initials() { return `${(this.firstname[0] ?? "").toUpperCase()}${(this.lastname[0] ?? "").toUpperCase()}`; },
          };
          setUsers((prev) => [appUser, ...prev]);
        }
        toast.success("Utilisateur créé");
      }
      setDialogOpen(false);
    } catch (err) {
      toast.error("Erreur", { description: String(err) });
    }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.rpc("admin_delete_user", { p_uid: deleteTarget.id });
      if (error) {
        toast.error("Erreur", { description: error.message });
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      toast.success("Utilisateur supprimé");
      setDeleteTarget(null);
    } catch (err: unknown) {
      toast.error("Erreur", { description: String(err) });
    } finally {
      setDeleting(false);
    }
  };

  const roleBadge = (role: string) => {
    const styles: Record<string, string> = {
      admin: "bg-[#6d28d9]/10 text-[#6d28d9] border-[#6d28d9]/25 font-bold",
      secretary: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-300 font-bold",
      professor: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300 font-bold",
      student: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300 font-bold",
    };
    return styles[role] ?? "";
  };

  const roleIcon = (role: string) => {
    switch (role) {
      case "admin": return <Shield className="h-3.5 w-3.5" />;
      case "secretary": return <UserCheck className="h-3.5 w-3.5 text-purple-600" />;
      case "professor": return <UserCheck className="h-3.5 w-3.5" />;
      default: return <User className="h-3.5 w-3.5" />;
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <MascotHeader
        title="Gestion des Utilisateurs"
        description="Créez et gérez les comptes Administrateurs, Secrétaires, Professeurs et Élèves."
        pose="bonjour"
        mascotMessage={`${users.length} utilisateur(s) enregistrés dans le système.`}
        badge="Administration générale"
      >
        <Button
          onClick={openAdd}
          className="h-11 rounded-2xl bg-gradient-to-r from-[#6d28d9] to-[#8b5cf6] px-5 font-bold text-white shadow-md shadow-[#6d28d9]/20 hover:shadow-lg"
        >
          <Plus className="mr-2 h-4 w-4" />
          Ajouter un utilisateur
        </Button>
      </MascotHeader>

      <Card className="overflow-hidden rounded-3xl border border-[#6d28d9]/10 bg-white shadow-xs">
        <CardHeader className="p-5 border-b border-[#6d28d9]/5">
          <div className="relative max-w-md">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6d28d9]" />
            <Input
              placeholder="Rechercher par nom ou email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 rounded-2xl border-[#6d28d9]/15 bg-[#f8f9fc] pl-10 text-xs font-semibold text-[#1a1a2e] focus:border-[#6d28d9] focus:bg-white"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-[#f8f9fc]">
              <TableRow className="border-b border-[#6d28d9]/5">
                <TableHead className="py-4 text-xs font-extrabold uppercase tracking-wider text-[#6d28d9]">Utilisateur</TableHead>
                <TableHead className="py-4 text-xs font-extrabold uppercase tracking-wider text-[#6d28d9]">Rôle</TableHead>
                <TableHead className="hidden py-4 text-xs font-extrabold uppercase tracking-wider text-[#6d28d9] sm:table-cell">Statut</TableHead>
                <TableHead className="w-12 py-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((user) => (
                <TableRow key={user.id} className="border-b border-[#6d28d9]/5 hover:bg-[#f3f0ff]/30">
                  <TableCell className="py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9 border border-[#6d28d9]/20">
                        <AvatarFallback className="bg-[#6d28d9]/10 text-xs font-bold text-[#6d28d9]">
                          {user.initials}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-bold text-[#1a1a2e] leading-none">{user.fullName}</p>
                        <p className="text-xs text-[#64748b] mt-1">{user.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-3.5">
                    <Badge variant="outline" className={`gap-1 rounded-lg px-2.5 py-1 ${roleBadge(user.role)}`}>
                      {roleIcon(user.role)}
                      {user.role === "admin"
                        ? "Administrateur"
                        : user.role === "secretary"
                        ? "Secrétaire"
                        : user.role === "professor"
                        ? "Professeur"
                        : "Élève"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden py-3.5 sm:table-cell">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                        user.isactive ? "text-emerald-600" : "text-muted-foreground"
                      }`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${
                          user.isactive ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"
                        }`}
                      />
                      {user.isactive ? "Actif" : "Inactif"}
                    </span>
                  </TableCell>
                  <TableCell className="py-3.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl text-[#64748b] hover:bg-[#6d28d9]/10 hover:text-[#6d28d9]">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end" className="w-44 rounded-2xl p-1.5 shadow-xl border-[#6d28d9]/10">
                        <DropdownMenuItem onClick={() => openEdit(user)} className="rounded-xl text-xs font-semibold">
                          <Edit className="mr-2 h-4 w-4 text-[#6d28d9]" />
                          Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="rounded-xl text-xs font-semibold text-rose-600 focus:bg-rose-50"
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
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl p-6 border-[#6d28d9]/15">
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-3">
              <Mascot pose="validation" size="sm" />
              <div>
                <DialogTitle className="text-lg font-bold text-[#1a1a2e]">
                  {editingUser ? "Modifier l'utilisateur" : "Ajouter un utilisateur"}
                </DialogTitle>
                <DialogDescription className="text-xs text-[#64748b]">
                  {editingUser ? "Modifiez les informations ci-dessous." : "Remplissez les informations pour créer un nouveau compte."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="grid gap-4 py-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName" className="text-xs font-bold text-[#1a1a2e]">Prénom</Label>
                <Input
                  id="firstName"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  className="rounded-xl border-[#6d28d9]/15 text-xs font-medium focus:border-[#6d28d9]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName" className="text-xs font-bold text-[#1a1a2e]">Nom</Label>
                <Input
                  id="lastName"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  className="rounded-xl border-[#6d28d9]/15 text-xs font-medium focus:border-[#6d28d9]"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-bold text-[#1a1a2e]">Adresse email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="rounded-xl border-[#6d28d9]/15 text-xs font-medium focus:border-[#6d28d9]"
              />
            </div>
            {!editingUser && (
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-bold text-[#1a1a2e]">Mot de passe</Label>
                <Input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="rounded-xl border-[#6d28d9]/15 text-xs font-medium focus:border-[#6d28d9]"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-[#1a1a2e]">Rôle système</Label>
              <Select value={form.role} onValueChange={(v) => { if (v) setForm({ ...form, role: v }); }}>
                <SelectTrigger className="rounded-xl border-[#6d28d9]/15 text-xs font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-[#6d28d9]/15 shadow-xl">
                  <SelectItem value="admin" className="rounded-xl text-xs font-bold text-[#6d28d9]">
                    🛡️ Administrateur
                  </SelectItem>
                  <SelectItem value="secretary" className="rounded-xl text-xs font-bold text-purple-700">
                    📋 Secrétaire
                  </SelectItem>
                  <SelectItem value="professor" className="rounded-xl text-xs font-bold text-emerald-700">
                    👨‍🏫 Professeur
                  </SelectItem>
                  <SelectItem value="student" className="rounded-xl text-xs font-bold text-amber-700">
                    🎓 Élève
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl border-[#6d28d9]/20 font-bold">
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={saving} className="rounded-xl bg-[#6d28d9] hover:bg-[#5b21b6] text-white font-bold">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingUser ? "Enregistrer" : "Créer le compte"}
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
              <strong className="text-[#1a1a2e] font-semibold">{deleteTarget?.fullName}</strong> ({deleteTarget?.email}) ?
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
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
