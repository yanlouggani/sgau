"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/browser";
import { uuid } from "@/lib/uuid";
import { MascotHeader } from "@/components/mascot/MascotHeader";
import { Mascot } from "@/components/mascot/Mascot";
import { EmptyState } from "@/components/mascot/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search,
  Plus,
  MoreHorizontal,
  Edit,
  Trash2,
  Loader2,
  BookOpen,
  Phone,
  User,
  CreditCard,
  ChevronRight,
  ChevronLeft,
  DollarSign,
  FileText,
  QrCode,
  Printer,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import QRCode from "qrcode";
import { recordStudentPaymentAction } from "@/lib/actions/payments";
import { createUserAction, updateUserAuthAction } from "@/lib/actions/admin-users";

type Enrollment = {
  groupid: string;
  groupName: string;
  moduleName: string;
  status: string;
};

type Student = {
  id: string;
  email: string;
  firstname: string;
  lastname: string;
  role: "student";
  fullName: string;
  initials: string;
  isactive: boolean;
  parent_name?: string | null;
  parent_phone?: string | null;
  billing_notes?: string | null;
  enrollments: Enrollment[];
};

type GroupItem = {
  id: string;
  name: string;
  moduleName: string;
};

export function StudentsManagement({
  initialStudents,
  groups,
}: {
  initialStudents: Student[];
  groups: GroupItem[];
}) {
  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [search, setSearch] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [editing, setEditing] = useState<Student | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  // État Badge Élève & QR Code imprimable
  const [badgeStudent, setBadgeStudent] = useState<Student | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  useEffect(() => {
    if (!badgeStudent) {
      setQrDataUrl("");
      return;
    }
    void QRCode.toDataURL(badgeStudent.id, {
      width: 250,
      margin: 1,
      color: {
        dark: "#1e1b4b",
        light: "#ffffff",
      },
    }).then((url) => {
      setQrDataUrl(url);
    }).catch((err) => {
      console.error("Erreur génération QR code", err);
    });
  }, [badgeStudent]);

  // Formulaire progressif
  const [form, setForm] = useState<{
    email: string;
    password: string;
    firstname: string;
    lastname: string;
    parent_name: string;
    parent_phone: string;
    groupids: string[];
    monthly_fee: number;
    due_day: number;
    billing_notes: string;
    is_draft: boolean;
    isactive: boolean;
  }>({
    email: "",
    password: "",
    firstname: "",
    lastname: "",
    parent_name: "",
    parent_phone: "",
    groupids: [],
    monthly_fee: 3000,
    due_day: 5,
    billing_notes: "",
    is_draft: false,
    isactive: true,
  });

  const supabase = createClient();

  const openAdd = () => {
    setEditing(null);
    setForm({
      email: "",
      password: "",
      firstname: "",
      lastname: "",
      parent_name: "",
      parent_phone: "",
      groupids: [],
      monthly_fee: 3000,
      due_day: 5,
      billing_notes: "",
      is_draft: false,
      isactive: true,
    });
    setWizardStep(1);
    setWizardOpen(true);
  };

  const openEdit = (s: Student) => {
    setEditing(s);
    setForm({
      email: s.email,
      password: "",
      firstname: s.firstname,
      lastname: s.lastname,
      parent_name: s.parent_name || "",
      parent_phone: s.parent_phone || "",
      groupids: s.enrollments.map((e) => e.groupid),
      monthly_fee: 3000,
      due_day: 5,
      billing_notes: s.billing_notes || "",
      is_draft: !s.isactive,
      isactive: s.isactive,
    });
    setWizardStep(1);
    setWizardOpen(true);
  };

  const handleNextStep = () => {
    if (wizardStep === 1) {
      if (!form.firstname.trim() || !form.lastname.trim()) {
        toast.error("Veuillez renseigner le nom et le prénom de l'élève");
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
    }
  };

  const toggleGroup = (groupid: string) => {
    setForm((prev) => ({
      ...prev,
      groupids: prev.groupids.includes(groupid)
        ? prev.groupids.filter((id) => id !== groupid)
        : [...prev.groupids, groupid],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const activeStatus = form.is_draft ? false : form.isactive;

      if (editing) {
        const upd: Record<string, unknown> = {
          email: form.email,
          firstname: form.firstname,
          lastname: form.lastname,
          parent_name: form.parent_name || null,
          parent_phone: form.parent_phone || null,
          billing_notes: form.billing_notes || null,
          role: "student",
          isactive: activeStatus,
        };
        await supabase.from("users").update(upd).eq("id", editing.id);

        const { data: existingEnrolls } = await supabase
          .from("enrollments")
          .select("groupid, status")
          .eq("studentid", editing.id);
        const statusMap: Record<string, string> = {};
        for (const e of existingEnrolls ?? []) {
          const r = e as Record<string, unknown>;
          statusMap[r.groupid as string] = (r.status as string) ?? "active";
        }
        await supabase.from("enrollments").delete().eq("studentid", editing.id);
        if (form.groupids.length > 0) {
          await supabase.from("enrollments").insert(
            form.groupids.map((groupid) => ({
              id: uuid(),
              studentid: editing.id,
              groupid,
              status: statusMap[groupid] ?? "active",
            }))
          );
        }
        const enrolledGroups = groups.filter((g) => form.groupids.includes(g.id));
        setStudents((prev) =>
          prev.map((s) =>
            s.id === editing.id
              ? {
                  ...s,
                  email: form.email,
                  firstname: form.firstname,
                  lastname: form.lastname,
                  parent_name: form.parent_name,
                  parent_phone: form.parent_phone,
                  billing_notes: form.billing_notes,
                  fullName: `${form.firstname} ${form.lastname}`.trim(),
                  initials: `${(form.firstname[0] ?? "").toUpperCase()}${(form.lastname[0] ?? "").toUpperCase()}`,
                  isactive: activeStatus,
                  enrollments: enrolledGroups.map((g) => ({
                    groupid: g.id,
                    groupName: g.name,
                    moduleName: g.moduleName,
                    status: statusMap[g.id] ?? "active",
                  })),
                }
              : s
          )
        );
        if (form.password) {
          await updateUserAuthAction({ id: editing.id, password: form.password });
        }
        toast.success("Fiche élève mise à jour");
      } else {
        const { user: createdUser } = await createUserAction({
          email: form.email,
          password: form.password,
          firstname: form.firstname,
          lastname: form.lastname,
          role: "student",
        });
        if (!createdUser) throw new Error("Échec de la création");

        // Mettre à jour les champs personnalisés
        await supabase
          .from("users")
          .update({
            parent_name: form.parent_name || null,
            parent_phone: form.parent_phone || null,
            billing_notes: form.billing_notes || null,
            isactive: activeStatus,
          })
          .eq("id", createdUser.id);

        if (form.groupids.length > 0) {
          await supabase.from("enrollments").insert(
            form.groupids.map((groupid) => ({
              id: uuid(),
              studentid: createdUser.id,
              groupid,
              status: "active",
            }))
          );
        }

        // Initialiser le premier paiement si mensualité renseignée
        if (form.monthly_fee > 0 && !form.is_draft) {
          const now = new Date();
          const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
          const dueDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(form.due_day).padStart(2, "0")}`;
          await recordStudentPaymentAction({
            student_id: createdUser.id,
            billing_period: period,
            amount_due: form.monthly_fee,
            amount_paid: 0,
            due_date: dueDate,
            payment_method: "cash",
            notes: form.billing_notes || "Inscription initiale",
          });
        }

        const enrolledGroups = groups.filter((g) => form.groupids.includes(g.id));
        setStudents((prev) => [
          {
            id: createdUser.id,
            email: form.email,
            firstname: form.firstname,
            lastname: form.lastname,
            role: "student" as const,
            fullName: `${form.firstname} ${form.lastname}`.trim(),
            initials: `${(form.firstname[0] ?? "").toUpperCase()}${(form.lastname[0] ?? "").toUpperCase()}`,
            isactive: activeStatus,
            parent_name: form.parent_name,
            parent_phone: form.parent_phone,
            billing_notes: form.billing_notes,
            enrollments: enrolledGroups.map((g) => ({
              groupid: g.id,
              groupName: g.name,
              moduleName: g.moduleName,
              status: "active",
            })),
          },
          ...prev,
        ]);
        toast.success(
          form.is_draft ? "Profil élève enregistré en brouillon" : "Élève inscrit avec succès"
        );
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
      setStudents((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      toast.success("Élève supprimé");
      setDeleteTarget(null);
    } catch (err: unknown) {
      toast.error("Erreur", { description: String(err) });
    } finally {
      setDeleting(false);
    }
  };

  const filtered = students.filter(
    (s) =>
      s.fullName.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase()) ||
      (s.parent_name && s.parent_name.toLowerCase().includes(search.toLowerCase())) ||
      (s.parent_phone && s.parent_phone.includes(search))
  );

  return (
    <div className="space-y-8 pb-10">
      <MascotHeader
        title="Gestion des Élèves"
        description="Consultez, inscrivez et gérez le suivi des élèves du centre de soutien scolaire (coordonnées des parents, classes suivies, tarifs)."
        pose="tous"
        mascotMessage={`${students.length} élève(s) au total !`}
        badge="Élèves & Inscriptions"
      >
        <Button
          onClick={openAdd}
          className="h-11 rounded-2xl bg-gradient-to-r from-[#6d28d9] to-[#8b5cf6] px-5 font-bold text-white shadow-md shadow-[#6d28d9]/20 hover:shadow-lg"
        >
          <Plus className="mr-2 h-4 w-4" />
          Inscrire un Élève
        </Button>
      </MascotHeader>

      <Card className="overflow-hidden rounded-3xl border border-[#6d28d9]/10 bg-white shadow-xs">
        <div className="p-5 border-b border-[#6d28d9]/5">
          <div className="relative max-w-md">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6d28d9]" />
            <Input
              placeholder="Rechercher par élève, parent, téléphone..."
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
              title="Aucun élève trouvé"
              hint="Aucun profil ne correspond à vos critères de recherche."
            />
          ) : (
            <Table>
              <TableHeader className="bg-[#f8f9fc]">
                <TableRow className="border-b border-[#6d28d9]/5 hover:bg-transparent">
                  <TableHead className="py-4 text-xs font-extrabold uppercase tracking-wider text-[#6d28d9]">
                    Élève
                  </TableHead>
                  <TableHead className="py-4 text-xs font-extrabold uppercase tracking-wider text-[#6d28d9]">
                    Contact Parent / Tuteur
                  </TableHead>
                  <TableHead className="hidden py-4 text-xs font-extrabold uppercase tracking-wider text-[#6d28d9] md:table-cell">
                    Classes de Soutien
                  </TableHead>
                  <TableHead className="py-4 text-xs font-extrabold uppercase tracking-wider text-[#6d28d9]">
                    Statut
                  </TableHead>
                  <TableHead className="text-right py-4 text-xs font-extrabold uppercase tracking-wider text-[#6d28d9]">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filtered.map((s) => (
                  <TableRow
                    key={s.id}
                    className="border-b border-[#6d28d9]/5 transition-colors hover:bg-[#f3f0ff]/30"
                  >
                    <TableCell className="py-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 shrink-0 rounded-2xl ring-2 ring-[#6d28d9]/20">
                          <AvatarFallback className="bg-gradient-to-br from-[#6d28d9] to-[#f97316] text-xs font-black text-white">
                            {s.initials}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-bold text-[#1a1a2e]">{s.fullName}</p>
                          <p className="text-xs font-semibold text-[#475569]">{s.email}</p>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="py-4">
                      {s.parent_name || s.parent_phone ? (
                        <div className="text-xs space-y-0.5">
                          <div className="font-semibold text-[#1e1b4b] flex items-center gap-1">
                            <User className="h-3 w-3 text-muted-foreground" />
                            {s.parent_name || "Tuteur légal"}
                          </div>
                          {s.parent_phone && (
                            <div className="text-muted-foreground flex items-center gap-1 font-mono">
                              <Phone className="h-3 w-3 text-[#6d28d9]" />
                              {s.parent_phone}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Non renseigné</span>
                      )}
                    </TableCell>

                    <TableCell className="hidden py-4 md:table-cell">
                      <div className="flex flex-wrap gap-1.5">
                        {s.enrollments.length === 0 ? (
                          <span className="text-xs text-[#475569] italic">Aucune classe</span>
                        ) : (
                          s.enrollments.map((e) => (
                            <Badge
                              key={e.groupid}
                              className="bg-[#6d28d9]/10 text-[#6d28d9] border-none text-[10px] font-bold"
                            >
                              <BookOpen className="h-3 w-3 mr-1" />
                              {e.groupName}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                          s.isactive
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-amber-50 text-amber-600"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            s.isactive ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                          }`}
                        />
                        {s.isactive ? "Inscrit" : "Brouillon / Inactif"}
                      </span>
                    </TableCell>

                    <TableCell className="py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link href={`/payments?studentId=${s.id}`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 rounded-lg px-2 text-xs font-bold text-[#6d28d9] hover:bg-[#6d28d9]/10"
                          >
                            <CreditCard className="h-3.5 w-3.5 mr-1" />
                            Paiements
                          </Button>
                        </Link>
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
                          <DropdownMenuContent align="end" className="w-48 rounded-2xl p-1.5 shadow-xl">
                            <DropdownMenuItem
                              onClick={() => setBadgeStudent(s)}
                              className="rounded-xl text-xs font-semibold text-[#6d28d9] focus:bg-[#6d28d9]/10"
                            >
                              <QrCode className="mr-2 h-4 w-4" />
                              Badge & QR Code
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => openEdit(s)}
                              className="rounded-xl text-xs font-semibold"
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              Modifier
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="rounded-xl text-xs font-semibold text-rose-600 focus:bg-rose-50"
                              onClick={() => setDeleteTarget(s)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ---------------- WIZARD INSCRIPTION ÉLÈVE (3 ÉTAPES) ---------------- */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="sm:max-w-[560px] rounded-3xl p-6">
          <DialogHeader className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mascot pose="validation" size="sm" />
                <div>
                  <DialogTitle className="text-lg font-black text-[#1e1b4b]">
                    {editing ? "Modifier la fiche élève" : "Inscription d'un nouvel élève"}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Étape {wizardStep} sur 3 :{" "}
                    {wizardStep === 1
                      ? "Identité & Contact Parents"
                      : wizardStep === 2
                      ? "Classes & Matières de Soutien"
                      : "Tarification & Modalités"}
                  </DialogDescription>
                </div>
              </div>
              <Badge className="bg-[#6d28d9]/10 text-[#6d28d9] border-none font-bold">
                Étape {wizardStep} / 3
              </Badge>
            </div>

            {/* Barre de progression */}
            <div className="w-full bg-[#6d28d9]/10 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-[#6d28d9] h-full transition-all duration-300 rounded-full"
                style={{ width: `${(wizardStep / 3) * 100}%` }}
              />
            </div>
          </DialogHeader>

          {/* CONTENU DU WIZARD */}
          <div className="py-4">
            {/* ÉTAPE 1 : Identité & Contact Parent */}
            {wizardStep === 1 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-[#1a1a2e]">Prénom de l&apos;élève *</Label>
                    <Input
                      value={form.firstname}
                      onChange={(e) => setForm({ ...form, firstname: e.target.value })}
                      placeholder="Sarah"
                      className="rounded-xl border-[#6d28d9]/15 text-xs h-10"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-[#1a1a2e]">Nom de l&apos;élève *</Label>
                    <Input
                      value={form.lastname}
                      onChange={(e) => setForm({ ...form, lastname: e.target.value })}
                      placeholder="Benali"
                      className="rounded-xl border-[#6d28d9]/15 text-xs h-10"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-[#1a1a2e]">Email de connexion *</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="eleve@soutien.dz"
                    className="rounded-xl border-[#6d28d9]/15 text-xs h-10"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-[#1a1a2e]">
                    {editing ? "Nouveau mot de passe (optionnel)" : "Mot de passe élève *"}
                  </Label>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={editing ? "Laisser vide pour ne pas changer" : "Au moins 8 caractères"}
                    className="rounded-xl border-[#6d28d9]/15 text-xs h-10"
                  />
                </div>

                <div className="pt-2 border-t border-[#6d28d9]/10 space-y-3">
                  <p className="text-xs font-bold text-[#6d28d9] flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" /> Coordonnées du Tuteur / Responsable Légal
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Nom du parent / tuteur</Label>
                      <Input
                        value={form.parent_name}
                        onChange={(e) => setForm({ ...form, parent_name: e.target.value })}
                        placeholder="M. ou Mme Benali"
                        className="rounded-xl border-[#6d28d9]/15 text-xs h-10"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Téléphone parent (SMS/WhatsApp)</Label>
                      <Input
                        value={form.parent_phone}
                        onChange={(e) => setForm({ ...form, parent_phone: e.target.value })}
                        placeholder="0550 12 34 56"
                        className="rounded-xl border-[#6d28d9]/15 text-xs h-10 font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ÉTAPE 2 : Classes & Matières */}
            {wizardStep === 2 && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Sélectionnez les classes de soutien auxquelles inscrire cet élève :
                </p>
                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                  {groups.length === 0 ? (
                    <EmptyState
                      compact
                      pose="reflexion"
                      title="Aucune classe disponible"
                      hint="Créez d'abord des classes de soutien dans l'onglet Groupes."
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
                              Inscrit
                            </Badge>
                          )}
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* ÉTAPE 3 : Tarification & Facturation */}
            {wizardStep === 3 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5 p-4 rounded-2xl bg-[#f8f9fc] border border-[#6d28d9]/10">
                    <Label className="text-xs font-bold text-[#1a1a2e] flex items-center gap-1">
                      <DollarSign className="h-3.5 w-3.5 text-[#6d28d9]" />
                      Mensualité prévue (DA)
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="500"
                      value={form.monthly_fee}
                      onChange={(e) =>
                        setForm({ ...form, monthly_fee: Number(e.target.value) })
                      }
                      className="rounded-xl border-[#6d28d9]/15 text-sm h-10 font-bold"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Montant facturé chaque mois pour ses cours.
                    </p>
                  </div>

                  <div className="space-y-1.5 p-4 rounded-2xl bg-[#f8f9fc] border border-[#6d28d9]/10">
                    <Label className="text-xs font-bold text-[#1a1a2e]">
                      Jour d&apos;échéance mensuel
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      max="31"
                      value={form.due_day}
                      onChange={(e) =>
                        setForm({ ...form, due_day: Number(e.target.value) })
                      }
                      className="rounded-xl border-[#6d28d9]/15 text-sm h-10 font-bold"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Ex: le 5 du mois pour les relances.
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-[#1a1a2e] flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    Notes financières / Référence
                  </Label>
                  <Input
                    value={form.billing_notes}
                    onChange={(e) => setForm({ ...form, billing_notes: e.target.value })}
                    placeholder="Ex: Réduction fratrie, pack 2 matières..."
                    className="rounded-xl border-[#6d28d9]/15 text-xs h-10"
                  />
                </div>

                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-amber-900">Enregistrer en brouillon ?</p>
                    <p className="text-[11px] text-amber-700">
                      L&apos;élève ne sera pas immédiatement activé sur le planning.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.is_draft}
                    onChange={(e) => setForm({ ...form, is_draft: e.target.checked })}
                    className="rounded border-amber-300 text-amber-600 focus:ring-amber-500 h-4 w-4"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
            {wizardStep > 1 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWizardStep((prev) => (prev - 1) as 1 | 2)}
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

            {wizardStep < 3 ? (
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
                onClick={handleSave}
                disabled={saving}
                className="bg-[#6d28d9] hover:bg-[#5b21b6] text-white rounded-xl font-bold gap-1.5"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? "Mettre à jour" : form.is_draft ? "Enregistrer le brouillon" : "Finaliser l'inscription"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- DIALOG BADGE ÉLÈVE & CARTE SCOLAIRE AVEC QR CODE (1-A) ---------------- */}
      <Dialog open={!!badgeStudent} onOpenChange={(o) => !o && setBadgeStudent(null)}>
        <DialogContent className="sm:max-w-[480px] rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-[#1e1b4b] flex items-center gap-2">
              <QrCode className="h-5 w-5 text-[#6d28d9]" />
              Carte Scolaire & Badge Élève
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Badge avec QR code individuel pour check-in automatique et contrôle des accès.
            </DialogDescription>
          </DialogHeader>

          {badgeStudent && (
            <div className="flex flex-col items-center py-2">
              {/* Carte Badge (Visuelle à l'écran et seule visible au print) */}
              <div
                id="printable-student-badge"
                className="w-full max-w-[380px] rounded-2xl border-2 border-slate-200 bg-white overflow-hidden shadow-md text-slate-800"
              >
                {/* Bandeau supérieur de la carte */}
                <div className="bg-gradient-to-r from-[#6d28d9] to-[#7c3aed] text-white p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-white/20 flex items-center justify-center font-black text-xs">
                      ITRI
                    </div>
                    <div>
                      <h4 className="font-black text-xs uppercase tracking-wider">
                        ITRI Academy
                      </h4>
                      <p className="text-[9px] text-white/80">Carte d&apos;Élève • Formation & Soutien</p>
                    </div>
                  </div>
                  <Badge className="bg-white/20 text-white border-none text-[9px] font-bold">
                    2026-2027
                  </Badge>
                </div>

                {/* Corps du badge */}
                <div className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-16 w-16 rounded-xl ring-2 ring-[#6d28d9]/30 shrink-0">
                      <AvatarFallback className="bg-gradient-to-br from-[#6d28d9] to-[#f97316] text-white font-black text-lg">
                        {badgeStudent.initials}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <h3 className="font-black text-slate-900 text-base leading-tight truncate">
                        {badgeStudent.fullName}
                      </h3>
                      <p className="text-[11px] font-mono text-[#6d28d9] font-bold mt-0.5">
                        ID: {badgeStudent.id.slice(0, 10).toUpperCase()}
                      </p>
                      {badgeStudent.parent_name && (
                        <p className="text-[11px] text-slate-600 mt-1 truncate">
                          Tuteur : <span className="font-semibold">{badgeStudent.parent_name}</span>
                        </p>
                      )}
                      {badgeStudent.parent_phone && (
                        <p className="text-[10px] text-slate-500 font-mono">
                          Tél : {badgeStudent.parent_phone}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* QR Code Scannable */}
                  <div className="flex flex-col items-center justify-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                    {qrDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={qrDataUrl}
                        alt="QR Code Élève"
                        className="h-32 w-32 object-contain"
                      />
                    ) : (
                      <div className="h-32 w-32 flex items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-[#6d28d9]" />
                      </div>
                    )}
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                      Scanner à l&apos;entrée pour pointer
                    </span>
                  </div>

                  {/* Classes & Matières */}
                  <div className="text-[10px] text-slate-600 border-t pt-2 flex items-center justify-between">
                    <span className="font-bold">Matières suivies :</span>
                    <span className="truncate max-w-[200px] text-right font-medium text-slate-800">
                      {badgeStudent.enrollments.map((e) => e.groupName).join(", ") || "Général"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between w-full">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="rounded-xl font-bold border-[#6d28d9]/30 text-[#6d28d9] hover:bg-[#6d28d9]/10 gap-1.5 text-xs"
              >
                <Printer className="h-4 w-4" />
                Imprimer le badge (Carte / PDF)
              </Button>
              <Button
                size="sm"
                onClick={() => setBadgeStudent(null)}
                className="rounded-xl font-bold bg-[#6d28d9] text-white hover:bg-[#5b21b6] text-xs"
              >
                Fermer
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-student-badge,
          #printable-student-badge * {
            visibility: visible !important;
          }
          #printable-student-badge {
            display: block !important;
            position: fixed !important;
            left: 50% !important;
            top: 50% !important;
            transform: translate(-50%, -50%) !important;
            width: 85.6mm !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            border: 1px solid #cbd5e1 !important;
            border-radius: 12px !important;
            box-shadow: none !important;
            z-index: 999999 !important;
          }
        }
      `}</style>

      {/* Confirmation Suppression Élève AlertDialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet élève ?</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer définitivement le profil de l&apos;élève{" "}
              <strong className="text-[#1a1a2e] font-semibold">{deleteTarget?.fullName}</strong> ({deleteTarget?.email}) ?
              Cette action supprimera également ses inscriptions et ses pointages d&apos;assiduité.
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
              Supprimer l&apos;élève
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
