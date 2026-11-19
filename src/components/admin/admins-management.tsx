"use client";

import { useState } from "react";
import { MascotHeader } from "@/components/mascot/MascotHeader";
import { Mascot } from "@/components/mascot/Mascot";
import { EmptyState } from "@/components/mascot/EmptyState";
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
import { Card, CardContent } from "@/components/ui/card";
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
  KeyRound,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import {
  createUserAction,
  updateUserAction,
  deleteUserAction,
} from "@/lib/actions/admin-users";
import { generateSecureTempPassword } from "@/lib/user-auth-utils";

type AdminUser = {
  id: string;
  email: string;
  firstname: string;
  lastname: string;
  role: "admin" | "secretary" | "professor" | "student";
  fullName: string;
  initials: string;
  isactive: boolean;
};

export function AdminsManagement({
  initialAdmins,
  currentUserId,
}: {
  initialAdmins: AdminUser[];
  currentUserId?: string;
}) {
  const [admins, setAdmins] = useState<AdminUser[]>(
    initialAdmins.map((a) => ({
      ...a,
      fullName: a.fullName ?? `${a.firstname} ${a.lastname}`,
      initials:
        a.initials ??
        `${(a.firstname[0] ?? "").toUpperCase()}${(a.lastname[0] ?? "").toUpperCase()}`,
    }))
  );
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState<{
    email: string;
    password: string;
    firstname: string;
    lastname: string;
    role: "admin" | "secretary" | "professor" | "student";
    isactive: boolean;
  }>({
    email: "",
    password: "",
    firstname: "",
    lastname: "",
    role: "admin",
    isactive: true,
  });

  const openAdd = () => {
    setEditing(null);
    setForm({
      email: "",
      password: "",
      firstname: "",
      lastname: "",
      role: "admin",
      isactive: true,
    });
    setShowPassword(false);
    setDialogOpen(true);
  };

  const openEdit = (a: AdminUser) => {
    setEditing(a);
    setForm({
      email: a.email,
      password: "",
      firstname: a.firstname,
      lastname: a.lastname,
      role: a.role,
      isactive: a.isactive,
    });
    setShowPassword(false);
    setDialogOpen(true);
  };

  const generateRandomPassword = () => {
    const pass = generateSecureTempPassword();
    setForm((prev) => ({ ...prev, password: pass }));
    setShowPassword(true);
    toast.info("Mot de passe sécurisé généré", {
      description: pass,
      action: {
        label: "Copier",
        onClick: () => {
          navigator.clipboard.writeText(pass);
          toast.success("Mot de passe copié !");
        },
      },
    });
  };

  const handleSave = async () => {
    if (!form.firstname.trim() || !form.lastname.trim()) {
      toast.error("Veuillez saisir le prénom et le nom.");
      return;
    }
    if (!form.email.trim() || !form.email.includes("@")) {
      toast.error("Veuillez saisir une adresse email valide.");
      return;
    }
    if (form.password && form.password.trim().length > 0 && form.password.trim().length < 8) {
      toast.error("Le mot de passe doit comporter au moins 8 caractères.");
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await updateUserAction({
          id: editing.id,
          email: form.email.trim().toLowerCase(),
          firstname: form.firstname.trim(),
          lastname: form.lastname.trim(),
          role: form.role,
          isActive: form.isactive,
          password: form.password.trim().length >= 8 ? form.password.trim() : undefined,
        });

        setAdmins((prev) =>
          prev.map((a) =>
            a.id === editing.id
              ? {
                  ...a,
                  email: form.email.trim().toLowerCase(),
                  firstname: form.firstname.trim(),
                  lastname: form.lastname.trim(),
                  role: form.role,
                  fullName: `${form.firstname.trim()} ${form.lastname.trim()}`,
                  initials: `${(form.firstname.trim()[0] ?? "").toUpperCase()}${(form.lastname.trim()[0] ?? "").toUpperCase()}`,
                  isactive: form.isactive,
                }
              : a
          )
        );
        toast.success("Utilisateur mis à jour");
      } else {
        const res = await createUserAction({
          email: form.email.trim().toLowerCase(),
          password: form.password.trim() ? form.password.trim() : undefined,
          firstname: form.firstname.trim(),
          lastname: form.lastname.trim(),
          role: form.role,
          isActive: form.isactive,
        });

        if (!res.user) throw new Error("Échec de la création");

        setAdmins((prev) => [
          {
            id: res.user!.id,
            email: form.email.trim().toLowerCase(),
            firstname: form.firstname.trim(),
            lastname: form.lastname.trim(),
            role: form.role,
            fullName: `${form.firstname.trim()} ${form.lastname.trim()}`,
            initials: `${(form.firstname.trim()[0] ?? "").toUpperCase()}${(form.lastname.trim()[0] ?? "").toUpperCase()}`,
            isactive: form.isactive,
          },
          ...prev,
        ]);

        if (res.tempPassword) {
          toast.success("Compte créé avec succès", {
            description: `Mot de passe temporaire : ${res.tempPassword}`,
            duration: 12000,
          });
        } else {
          toast.success("Compte créé avec succès");
        }
      }
      setDialogOpen(false);
    } catch (err) {
      toast.error("Erreur", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    if (currentUserId && deleteTarget.id === currentUserId) {
      toast.error("Action impossible", {
        description: "Vous ne pouvez pas supprimer votre propre compte.",
      });
      setDeleteTarget(null);
      return;
    }

    setDeleting(true);
    try {
      await deleteUserAction({ id: deleteTarget.id });
      setAdmins((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      toast.success("Administrateur supprimé");
      setDeleteTarget(null);
    } catch (err) {
      toast.error("Erreur de suppression", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setDeleting(false);
    }
  };

  const filtered = admins.filter(
    (a) =>
      a.fullName.toLowerCase().includes(search.toLowerCase()) ||
      a.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-10">
      {/* Mascot Header */}
      <MascotHeader
        title="Gestion des Administrateurs"
        description="Gérez les comptes d'accès complet au panneau d'administration de l'établissement."
        pose="tous"
        mascotMessage={`${admins.length} administrateur(s) enregistré(s)`}
        badge="Accès & Sécurité"
      >
        <Button
          onClick={openAdd}
          className="h-11 rounded-2xl bg-gradient-to-r from-[#6d28d9] to-[#8b5cf6] px-5 font-bold text-white shadow-md shadow-[#6d28d9]/20 hover:shadow-lg"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nouveau Compte
        </Button>
      </MascotHeader>

      {/* Main Table Card */}
      <Card className="overflow-hidden rounded-3xl border border-[#6d28d9]/10 bg-white shadow-xs">
        <div className="p-5 border-b border-[#6d28d9]/5">
          <div className="relative max-w-md">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6d28d9]" />
            <Input
              placeholder="Rechercher par nom ou email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 rounded-2xl border-[#6d28d9]/15 bg-[#f8f9fc] pl-10 text-xs font-semibold text-[#1a1a2e] focus:border-[#6d28d9] focus:bg-white"
            />
          </div>
        </div>

        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              pose="reflexion"
              title="Aucun administrateur trouvé"
              hint="Essayez d'ajuster vos critères de recherche."
            />
          ) : (
            <Table>
              <TableHeader className="bg-[#f8f9fc]">
                <TableRow className="border-b border-[#6d28d9]/5 hover:bg-transparent">
                  <TableHead className="py-4 text-xs font-extrabold uppercase tracking-wider text-[#6d28d9]">
                    Administrateur
                  </TableHead>
                  <TableHead className="hidden py-4 text-xs font-extrabold uppercase tracking-wider text-[#6d28d9] md:table-cell">
                    Email
                  </TableHead>
                  <TableHead className="py-4 text-xs font-extrabold uppercase tracking-wider text-[#6d28d9]">
                    Statut
                  </TableHead>
                  <TableHead className="w-16 py-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => (
                  <TableRow
                    key={a.id}
                    className="border-b border-[#6d28d9]/5 transition-colors hover:bg-[#f3f0ff]/30"
                  >
                    <TableCell className="py-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 shrink-0 rounded-2xl ring-2 ring-[#6d28d9]/20">
                          <AvatarFallback className="bg-gradient-to-br from-[#6d28d9] to-[#8b5cf6] text-xs font-bold text-white">
                            {a.initials}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-bold text-[#1a1a2e]">{a.fullName}</p>
                          <p className="text-xs font-semibold text-[#475569] md:hidden">{a.email}</p>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="hidden py-4 text-xs font-semibold text-[#475569] md:table-cell">
                      {a.email}
                    </TableCell>

                    <TableCell className="py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                          a.isactive
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-amber-50 text-amber-600"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            a.isactive ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                          }`}
                        />
                        {a.isactive ? "Actif" : "Inactif"}
                      </span>
                    </TableCell>

                    <TableCell className="py-4">
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
                        <DropdownMenuContent align="end" className="w-44 rounded-2xl p-1.5 shadow-xl">
                          <DropdownMenuItem
                            onClick={() => openEdit(a)}
                            className="rounded-xl text-xs font-semibold cursor-pointer"
                          >
                            <Edit className="mr-2 h-4 w-4 text-[#6d28d9]" />
                            Modifier
                          </DropdownMenuItem>
                          {(!currentUserId || a.id !== currentUserId) && (
                            <DropdownMenuItem
                              className="rounded-xl text-xs font-semibold text-rose-600 focus:bg-rose-50 cursor-pointer"
                              onClick={() => setDeleteTarget(a)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Supprimer
                            </DropdownMenuItem>
                          )}
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

      {/* Modal Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl p-6">
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-3">
              <Mascot pose="validation" size="sm" />
              <div>
                <DialogTitle className="text-lg font-bold text-[#1a1a2e]">
                  {editing ? "Modifier l'utilisateur" : "Nouveau compte utilisateur"}
                </DialogTitle>
                <DialogDescription className="text-xs text-[#475569]">
                  {editing
                    ? "Mise à jour des accès, rôle et informations personnelles."
                    : "Choisissez le rôle et configurez les accès du compte."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="admin-first" className="text-xs font-bold text-[#1a1a2e]">
                  Prénom *
                </Label>
                <Input
                  id="admin-first"
                  value={form.firstname}
                  onChange={(e) => setForm({ ...form, firstname: e.target.value })}
                  placeholder="Jean"
                  className="rounded-xl border-[#6d28d9]/10 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="admin-last" className="text-xs font-bold text-[#1a1a2e]">
                  Nom *
                </Label>
                <Input
                  id="admin-last"
                  value={form.lastname}
                  onChange={(e) => setForm({ ...form, lastname: e.target.value })}
                  placeholder="Dupont"
                  className="rounded-xl border-[#6d28d9]/10 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="admin-email" className="text-xs font-bold text-[#1a1a2e]">
                Adresse email *
              </Label>
              <Input
                id="admin-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="admin@itri.dz"
                className="rounded-xl border-[#6d28d9]/10 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-[#1a1a2e]">Rôle attribué au compte *</Label>
              <Select
                value={form.role}
                onValueChange={(val) => {
                  if (val) setForm({ ...form, role: val as "admin" | "secretary" | "professor" | "student" });
                }}
              >
                <SelectTrigger className="rounded-xl border-[#6d28d9]/10 text-xs font-semibold">
                  <SelectValue placeholder="Sélectionnez un rôle" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-[#6d28d9]/15 shadow-xl">
                  <SelectItem value="admin" className="rounded-xl text-xs font-bold text-[#6d28d9]">
                    🛡️ Administrateur (Accès total)
                  </SelectItem>
                  <SelectItem value="secretary" className="rounded-xl text-xs font-bold text-purple-700">
                    📋 Secrétaire (Inscriptions & Caisse)
                  </SelectItem>
                  <SelectItem value="professor" className="rounded-xl text-xs font-bold text-emerald-700">
                    👨‍🏫 Professeur (Présences & Emploi du temps)
                  </SelectItem>
                  <SelectItem value="student" className="rounded-xl text-xs font-bold text-amber-700">
                    🎓 Élève (Badge QR & Planning)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="admin-password" className="text-xs font-bold text-[#1a1a2e]">
                  {editing ? "Nouveau mot de passe" : "Mot de passe"}
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
                  id="admin-password"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={
                    editing
                      ? "Laisser vide si inchangé (min. 8 caractères)"
                      : "Min. 8 caractères (laisser vide pour auto-générer)"
                  }
                  className="rounded-xl border-[#6d28d9]/10 text-xs pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#475569] hover:text-[#6d28d9] transition-colors cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="admin-active"
                checked={form.isactive}
                onChange={(e) => setForm({ ...form, isactive: e.target.checked })}
                className="rounded border-[#6d28d9]/20 text-[#6d28d9] focus:ring-[#6d28d9] cursor-pointer"
              />
              <Label htmlFor="admin-active" className="text-xs font-semibold text-[#1a1a2e] cursor-pointer">
                Compte actif
              </Label>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="rounded-xl"
            >
              Annuler
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-[#6d28d9] hover:bg-[#5b21b6] text-white font-bold"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Enregistrer" : "Créer le compte"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Suppression AlertDialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet administrateur ?</AlertDialogTitle>
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
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
