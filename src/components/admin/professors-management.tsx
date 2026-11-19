"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/browser";
import { MascotHeader } from "@/components/mascot/MascotHeader";
import { Mascot } from "@/components/mascot/Mascot";
import { EmptyState } from "@/components/mascot/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search,
  Loader2,
  Plus,
  UserCheck,
  Trash2,
  Edit,
  MoreHorizontal,
  BookOpen,
  Clock,
  Percent,
  Check,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { toast } from "sonner";
import type { AppUser, PaymentType } from "@/types/database";
import { createUserAction, updateUserAuthAction } from "@/lib/actions/admin-users";

type GroupItem = {
  id: string;
  name: string;
  moduleid: string;
  moduleName: string;
};

type ProfessorWithGroups = AppUser & {
  groupids: string[];
};

export function ProfessorsManagement({
  initialProfessors,
  groups,
}: {
  initialProfessors: AppUser[];
  groups: GroupItem[];
}) {
  const [professors, setProfessors] = useState<ProfessorWithGroups[]>([]);
  const [search, setSearch] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [editing, setEditing] = useState<ProfessorWithGroups | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProfessorWithGroups | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Formulaire avec mode de rémunération
  const [form, setForm] = useState<{
    email: string;
    password: string;
    firstname: string;
    lastname: string;
    isactive: boolean;
    groupids: string[];
    payment_type: PaymentType;
    hourly_rate: number;
    percentage_rate: number;
  }>({
    email: "",
    password: "",
    firstname: "",
    lastname: "",
    isactive: true,
    groupids: [],
    payment_type: "hourly",
    hourly_rate: 1800,
    percentage_rate: 40,
  });

  const supabase = createClient();

  const loadGroups = async (prof: AppUser) => {
    const { data } = await supabase
      .from("professor_groups")
      .select("groupid")
      .eq("professorid", prof.id);
    if (data) {
      const gids = data.map((r: Record<string, unknown>) => r.groupid as string);
      setProfessors((prev) =>
        prev.map((p) => (p.id === prof.id ? { ...p, groupids: gids } : p))
      );
    }
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!active) return;
      const enriched: ProfessorWithGroups[] = initialProfessors.map((p) => ({
        ...p,
        fullName: `${p.firstname} ${p.lastname}`.trim(),
        initials: `${(p.firstname?.[0] ?? "").toUpperCase()}${(p.lastname?.[0] ?? "").toUpperCase()}`,
        groupids: [],
        payment_type: p.payment_type || "hourly",
        hourly_rate: p.hourly_rate ?? 1800,
        percentage_rate: p.percentage_rate ?? 40,
      }));
      setProfessors(enriched);
      await Promise.all(enriched.map((p) => loadGroups(p)));
    })();
    return () => {
      active = false;
    };
  }, [initialProfessors, supabase]);

  const openAdd = () => {
    setEditing(null);
    setForm({
      email: "",
      password: "",
      firstname: "",
      lastname: "",
      isactive: true,
      groupids: [],
      payment_type: "hourly",
      hourly_rate: 1800,
      percentage_rate: 40,
    });
    setWizardStep(1);
    setWizardOpen(true);
  };

  const openEdit = (prof: ProfessorWithGroups) => {
    setEditing(prof);
    setForm({
      email: prof.email,
      password: "",
      firstname: prof.firstname,
      lastname: prof.lastname,
      isactive: prof.isactive,
      groupids: prof.groupids || [],
      payment_type: prof.payment_type || "hourly",
      hourly_rate: prof.hourly_rate ?? 1800,
      percentage_rate: prof.percentage_rate ?? 40,
    });
    setWizardStep(1);
    setWizardOpen(true);
  };

  const handleNextStep = () => {
    if (wizardStep === 1) {
      if (!form.firstname.trim() || !form.lastname.trim()) {
        toast.error("Veuillez renseigner le nom et le prénom");
        return;
      }
      if (!form.email.trim() || !form.email.includes("@")) {
        toast.error("Adresse email invalide");
        return;
      }
      if (!editing && (!form.password || form.password.length < 8)) {
        toast.error("Le mot de passe doit comporter au moins 8 caractères");
        return;
      }
      setWizardStep(2);
    } else if (wizardStep === 2) {
      setWizardStep(3);
    } else if (wizardStep === 3) {
      if (form.payment_type === "hourly" && form.hourly_rate <= 0) {
        toast.error("Le taux horaire doit être supérieur à 0");
        return;
      }
      if (
        form.payment_type === "percentage" &&
        (form.percentage_rate <= 0 || form.percentage_rate > 100)
      ) {
        toast.error("Le pourcentage doit être compris entre 1 et 100 %");
        return;
      }
      setWizardStep(4);
    }
  };

  const toggleGroup = (gid: string) => {
    setForm((prev) => ({
      ...prev,
      groupids: prev.groupids.includes(gid)
        ? prev.groupids.filter((id) => id !== gid)
        : [...prev.groupids, gid],
    }));
  };

  const handleSaveWizard = async () => {
    setSaving(true);
    try {
      if (editing) {
        // Mise à jour de l'utilisateur
        const upd: Record<string, unknown> = {
          email: form.email,
          firstname: form.firstname,
          lastname: form.lastname,
          role: "professor",
          isactive: form.isactive,
          payment_type: form.payment_type,
          hourly_rate: form.payment_type === "hourly" ? form.hourly_rate : null,
          percentage_rate: form.payment_type === "percentage" ? form.percentage_rate : null,
        };
        await supabase.from("users").update(upd).eq("id", editing.id);

        // Mise à jour des groupes
        await supabase.from("professor_groups").delete().eq("professorid", editing.id);
        if (form.groupids.length > 0) {
          await supabase.from("professor_groups").insert(
            form.groupids.map((gid) => ({
              professorid: editing.id,
              groupid: gid,
            }))
          );
        }

        if (form.password) {
          await updateUserAuthAction({ id: editing.id, password: form.password });
        }

        setProfessors((prev) =>
          prev.map((p) =>
            p.id === editing.id
              ? {
                  ...p,
                  email: form.email,
                  firstname: form.firstname,
                  lastname: form.lastname,
                  fullName: `${form.firstname} ${form.lastname}`.trim(),
                  initials: `${(form.firstname[0] ?? "").toUpperCase()}${(form.lastname[0] ?? "").toUpperCase()}`,
                  isactive: form.isactive,
                  groupids: form.groupids,
                  payment_type: form.payment_type,
                  hourly_rate: form.hourly_rate,
                  percentage_rate: form.percentage_rate,
                }
              : p
          )
        );
        toast.success("Enseignant mis à jour avec succès");
      } else {
        // Création d'un nouvel enseignant via server action
        const { user: createdUser } = await createUserAction({
          email: form.email,
          password: form.password,
          firstname: form.firstname,
          lastname: form.lastname,
          role: "professor",
        });
        if (!createdUser) throw new Error("Échec de la création");

        // Mettre à jour les champs personnalisés de rémunération
        await supabase
          .from("users")
          .update({
            payment_type: form.payment_type,
            hourly_rate: form.payment_type === "hourly" ? form.hourly_rate : null,
            percentage_rate:
              form.payment_type === "percentage" ? form.percentage_rate : null,
          })
          .eq("id", createdUser.id);

        // Assigner les groupes
        if (form.groupids.length > 0) {
          await supabase.from("professor_groups").insert(
            form.groupids.map((gid) => ({
              professorid: createdUser.id,
              groupid: gid,
            }))
          );
        }

        const newProf: ProfessorWithGroups = {
          id: createdUser.id,
          email: form.email,
          firstname: form.firstname,
          lastname: form.lastname,
          role: "professor",
          fullName: `${form.firstname} ${form.lastname}`.trim(),
          initials: `${(form.firstname[0] ?? "").toUpperCase()}${(form.lastname[0] ?? "").toUpperCase()}`,
          isactive: form.isactive,
          identifier: null,
          groupids: form.groupids,
          payment_type: form.payment_type,
          hourly_rate: form.hourly_rate,
          percentage_rate: form.percentage_rate,
        };
        setProfessors((prev) => [newProf, ...prev]);
        toast.success("Profil enseignant créé avec succès");
      }
      setWizardOpen(false);
    } catch (err: unknown) {
      toast.error("Erreur", { description: String(err) });
    }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.rpc("admin_delete_user", { p_uid: deleteTarget.id });
      if (error) throw error;
      setProfessors((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      toast.success("Enseignant supprimé");
      setDeleteTarget(null);
    } catch (err: unknown) {
      toast.error("Erreur", { description: String(err) });
    } finally {
      setDeleting(false);
    }
  };

  const filtered = professors.filter(
    (p) =>
      p.fullName.toLowerCase().includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase())
  );

  const assignedGroupsFor = (prof: ProfessorWithGroups) =>
    groups.filter((g) => prof.groupids.includes(g.id));

  return (
    <div className="space-y-8 pb-10">
      <MascotHeader
        title="Gestion des Enseignants"
        description="Gérez les profils enseignants, les matières et classes de soutien prises en charge, et configurez leur mode de rémunération (taux horaire ou pourcentage)."
        pose="tous"
        mascotMessage={`${professors.length} enseignant(s) référencé(s)`}
        badge="Équipe Enseignante"
      >
        <Button
          onClick={openAdd}
          className="h-11 rounded-2xl bg-gradient-to-r from-[#6d28d9] to-[#8b5cf6] px-5 font-bold text-white shadow-md shadow-[#6d28d9]/20 hover:shadow-lg"
        >
          <Plus className="mr-2 h-4 w-4" />
          Ajouter un Enseignant
        </Button>
      </MascotHeader>

      {/* Barre de recherche */}
      <div className="rounded-3xl border border-[#6d28d9]/10 bg-white p-5 shadow-xs">
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

      {/* Grille des cartes enseignants */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((prof) => {
          const assigned = assignedGroupsFor(prof);
          const isHourly = prof.payment_type !== "percentage";
          return (
            <Card
              key={prof.id}
              className="overflow-hidden rounded-3xl border border-[#6d28d9]/10 bg-white shadow-xs hover:shadow-md transition-all relative"
            >
              <div className="absolute top-3 right-3 z-10">
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
                      onClick={() => openEdit(prof)}
                      className="rounded-xl text-xs font-semibold"
                    >
                      <Edit className="mr-2 h-4 w-4 text-[#6d28d9]" />
                      Modifier le profil
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="rounded-xl text-xs font-semibold text-rose-600 focus:bg-rose-50"
                      onClick={() => setDeleteTarget(prof)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Supprimer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 rounded-2xl ring-2 ring-[#6d28d9]/20">
                      <AvatarFallback className="bg-gradient-to-br from-[#6d28d9] to-[#8b5cf6] text-xs font-bold text-white">
                        {prof.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-sm font-bold text-[#1a1a2e]">
                        {prof.fullName}
                      </CardTitle>
                      <p className="text-xs font-semibold text-[#475569]">{prof.email}</p>
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#6d28d9]/10 p-2">
                    <UserCheck className="h-4 w-4 text-[#6d28d9]" />
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {/* Badge Rémunération */}
                <div className="flex items-center justify-between pt-1 border-t border-[#6d28d9]/10">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Rémunération :
                  </span>
                  {isHourly ? (
                    <Badge className="bg-[#6d28d9]/10 text-[#6d28d9] border-[#6d28d9]/25 gap-1 rounded-lg text-xs">
                      <Clock className="h-3 w-3" />
                      {prof.hourly_rate ? `${prof.hourly_rate.toLocaleString("fr-FR")} DA/h` : "Taux horaire"}
                    </Badge>
                  ) : (
                    <Badge className="bg-purple-500/15 text-purple-700 border-purple-500/30 gap-1 rounded-lg text-xs">
                      <Percent className="h-3 w-3" />
                      {prof.percentage_rate ? `${prof.percentage_rate} % (Frais)` : "Pourcentage"}
                    </Badge>
                  )}
                </div>

                {/* Groupes / Matières */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {assigned.length === 0 && (
                    <span className="text-xs font-semibold text-[#475569]">Aucune classe assignée</span>
                  )}
                  {assigned.slice(0, 3).map((g) => (
                    <Badge
                      key={g.id}
                      className="gap-1 rounded-full bg-[#6d28d9]/10 text-xs font-semibold text-[#6d28d9] border-none"
                    >
                      <BookOpen className="h-3 w-3" />
                      {g.name}
                    </Badge>
                  ))}
                  {assigned.length > 3 && (
                    <Badge
                      variant="outline"
                      className="rounded-full text-xs border-[#6d28d9]/20 text-[#6d28d9]"
                    >
                      +{assigned.length - 3}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {filtered.length === 0 && (
          <div className="col-span-full">
            <EmptyState
              pose="reflexion"
              title="Aucun enseignant trouvé"
              hint="Aucun profil ne correspond à vos critères de recherche."
            />
          </div>
        )}
      </div>

      {/* ---------------- WIZARD CRÉATION / ÉDITION ENSEIGNANT (4 ÉTAPES) ---------------- */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="sm:max-w-[580px] rounded-3xl p-6">
          <DialogHeader className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mascot pose="validation" size="sm" />
                <div>
                  <DialogTitle className="text-lg font-black text-[#1e1b4b]">
                    {editing ? "Modifier l'enseignant" : "Nouvel enseignant"}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Étape {wizardStep} sur 4 :{" "}
                    {wizardStep === 1
                      ? "Identité & Contact"
                      : wizardStep === 2
                      ? "Classes & Matières"
                      : wizardStep === 3
                      ? "Mode de Rémunération"
                      : "Récapitulatif & Validation"}
                  </DialogDescription>
                </div>
              </div>
              <Badge className="bg-[#6d28d9]/10 text-[#6d28d9] border-none font-bold">
                Étape {wizardStep} / 4
              </Badge>
            </div>

            {/* Barre de progression */}
            <div className="w-full bg-[#6d28d9]/10 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-[#6d28d9] h-full transition-all duration-300 rounded-full"
                style={{ width: `${(wizardStep / 4) * 100}%` }}
              />
            </div>
          </DialogHeader>

          {/* CONTENU DE L'ÉTAPE */}
          <div className="py-4">
            {/* ÉTAPE 1 : Identité & Contact */}
            {wizardStep === 1 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-[#1a1a2e]">Prénom *</Label>
                    <Input
                      value={form.firstname}
                      onChange={(e) => setForm({ ...form, firstname: e.target.value })}
                      placeholder="Ahmed"
                      className="rounded-xl border-[#6d28d9]/15 text-xs h-10"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-[#1a1a2e]">Nom *</Label>
                    <Input
                      value={form.lastname}
                      onChange={(e) => setForm({ ...form, lastname: e.target.value })}
                      placeholder="Kadi"
                      className="rounded-xl border-[#6d28d9]/15 text-xs h-10"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-[#1a1a2e]">Adresse email *</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="enseignant@soutien.dz"
                    className="rounded-xl border-[#6d28d9]/15 text-xs h-10"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-[#1a1a2e]">
                    {editing ? "Nouveau mot de passe (optionnel)" : "Mot de passe *"}
                  </Label>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={editing ? "Laisser vide pour ne pas changer" : "Au moins 8 caractères"}
                    className="rounded-xl border-[#6d28d9]/15 text-xs h-10"
                  />
                </div>

                {editing && (
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="prof-active"
                      checked={form.isactive}
                      onChange={(e) => setForm({ ...form, isactive: e.target.checked })}
                      className="rounded border-[#6d28d9]/20 text-[#6d28d9]"
                    />
                    <Label htmlFor="prof-active" className="text-xs font-semibold cursor-pointer">
                      Compte actif
                    </Label>
                  </div>
                )}
              </div>
            )}

            {/* ÉTAPE 2 : Matières & Classes */}
            {wizardStep === 2 && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Cochez les classes de soutien et matières prises en charge par cet enseignant :
                </p>
                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                  {groups.length === 0 ? (
                    <EmptyState
                      compact
                      pose="reflexion"
                      title="Aucune classe disponible"
                      hint="Créez d'abord des groupes de soutien dans l'onglet Groupes."
                    />
                  ) : (
                    groups.map((g) => {
                      const checked = form.groupids.includes(g.id);
                      return (
                        <label
                          key={g.id}
                          className={`flex items-center gap-3 rounded-2xl border p-3 cursor-pointer transition-colors ${
                            checked
                              ? "bg-[#6d28d9]/5 border-[#6d28d9]/30"
                              : "border-[#6d28d9]/10 hover:bg-[#f8f9fc]"
                          }`}
                        >
                          <Checkbox checked={checked} onCheckedChange={() => toggleGroup(g.id)} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-[#1a1a2e]">{g.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{g.moduleName}</p>
                          </div>
                          {checked && (
                            <Badge className="shrink-0 rounded-full bg-[#6d28d9]/10 text-xs font-semibold text-[#6d28d9] border-none">
                              Assigné
                            </Badge>
                          )}
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* ÉTAPE 3 : Mode de Rémunération */}
            {wizardStep === 3 && (
              <div className="space-y-4">
                <Label className="text-xs font-bold text-[#1a1a2e]">
                  Choisissez le mode de rémunération de cet enseignant :
                </Label>

                {/* Toggle / Choix binaire */}
                <div className="grid grid-cols-2 gap-3">
                  <div
                    onClick={() => setForm({ ...form, payment_type: "hourly" })}
                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                      form.payment_type === "hourly"
                        ? "border-[#6d28d9] bg-[#6d28d9]/5 shadow-xs"
                        : "border-border hover:border-[#6d28d9]/30"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <Clock className="h-5 w-5 text-[#6d28d9]" />
                      {form.payment_type === "hourly" && (
                        <Check className="h-4 w-4 text-[#6d28d9]" />
                      )}
                    </div>
                    <div className="text-sm font-bold text-[#1e1b4b]">Taux horaire</div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Payé selon le nombre d&apos;heures de cours dispensées.
                    </p>
                  </div>

                  <div
                    onClick={() => setForm({ ...form, payment_type: "percentage" })}
                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                      form.payment_type === "percentage"
                        ? "border-[#6d28d9] bg-[#6d28d9]/5 shadow-xs"
                        : "border-border hover:border-[#6d28d9]/30"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <Percent className="h-5 w-5 text-[#6d28d9]" />
                      {form.payment_type === "percentage" && (
                        <Check className="h-4 w-4 text-[#6d28d9]" />
                      )}
                    </div>
                    <div className="text-sm font-bold text-[#1e1b4b]">Pourcentage</div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Pourcentage sur les frais collectés auprès des élèves.
                    </p>
                  </div>
                </div>

                {/* Champ dynamique selon le choix */}
                {form.payment_type === "hourly" ? (
                  <div className="space-y-1.5 p-4 rounded-2xl bg-[#f8f9fc] border border-[#6d28d9]/10">
                    <Label className="text-xs font-bold text-[#1a1a2e]">
                      Taux horaire (DA / heure de cours) *
                    </Label>
                    <Input
                      type="number"
                      min="100"
                      step="100"
                      value={form.hourly_rate}
                      onChange={(e) =>
                        setForm({ ...form, hourly_rate: Number(e.target.value) })
                      }
                      placeholder="Ex: 1800"
                      className="rounded-xl border-[#6d28d9]/15 text-sm h-10 font-bold"
                    />
                    <p className="text-xs text-muted-foreground">
                      Exemple : 1 800 DA pour chaque heure et demie ou heure de cours assurée.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5 p-4 rounded-2xl bg-[#f8f9fc] border border-[#6d28d9]/10">
                    <Label className="text-xs font-bold text-[#1a1a2e]">
                      Pourcentage sur encaissements élèves (%) *
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      max="100"
                      step="1"
                      value={form.percentage_rate}
                      onChange={(e) =>
                        setForm({ ...form, percentage_rate: Number(e.target.value) })
                      }
                      placeholder="Ex: 40"
                      className="rounded-xl border-[#6d28d9]/15 text-sm h-10 font-bold text-[#6d28d9]"
                    />
                    <p className="text-xs text-muted-foreground">
                      Exemple : 40% des frais de scolarité réglés par les élèves de ses classes.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ÉTAPE 4 : Récapitulatif & Confirmation */}
            {wizardStep === 4 && (
              <div className="space-y-3 bg-[#f8f9fc] p-4 rounded-2xl border border-[#6d28d9]/10">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Vérification du profil
                </h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Nom & Prénom :</span>
                    <p className="font-bold text-[#1e1b4b]">{form.firstname} {form.lastname}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Email :</span>
                    <p className="font-bold text-[#1e1b4b]">{form.email}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Rémunération :</span>
                    <p className="font-bold text-[#6d28d9]">
                      {form.payment_type === "hourly"
                        ? `${form.hourly_rate} DA / h`
                        : `${form.percentage_rate} %`}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Classes assignées :</span>
                    <p className="font-bold text-[#1e1b4b]">
                      {form.groupids.length} classe(s)
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
            {wizardStep > 1 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWizardStep((prev) => (prev - 1) as 1 | 2 | 3)}
                className="rounded-xl font-bold gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Précédent
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWizardOpen(false)}
                className="rounded-xl font-bold"
              >
                Annuler
              </Button>
            )}

            {wizardStep < 4 ? (
              <Button
                size="sm"
                onClick={handleNextStep}
                className="bg-[#6d28d9] hover:bg-[#5b21b6] text-white rounded-xl font-bold gap-1"
              >
                Suivant
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleSaveWizard}
                disabled={saving}
                className="bg-[#6d28d9] hover:bg-[#5b21b6] text-white rounded-xl font-bold gap-1.5"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? "Enregistrer les modifications" : "Créer l'enseignant"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Suppression Enseignant AlertDialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet enseignant ?</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer définitivement le profil de l&apos;enseignant{" "}
              <strong className="text-[#1a1a2e] font-semibold">{deleteTarget?.fullName}</strong> ({deleteTarget?.email}) ?
              Cette action supprimera également ses affectations aux classes.
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
              Supprimer l&apos;enseignant
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
