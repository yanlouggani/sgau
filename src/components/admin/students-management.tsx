"use client";

import { useState, useEffect, useMemo, useRef } from "react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Camera,
  X,
  KeyRound,
  Sparkles,
  Check,
  Copy,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import QRCode from "qrcode";
import { recordStudentPaymentAction } from "@/lib/actions/payments";
import { createUserAction, updateUserAuthAction } from "@/lib/actions/admin-users";
import { generateQRToken, isQRTokenFormat } from "@/lib/qr-token";
import {
  validateStudentStep1,
  validateStudentStep2,
  validateStudentStep3,
  validateStudentStep4,
  validateFullStudentForm,
  calculateSuggestedMonthlyFee,
  diffEnrollments,
  generateStudentSecurePassword,
} from "@/lib/student-validation";

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
  photo_url?: string | null;
  enrollments: Enrollment[];
};

type GroupItem = {
  id: string;
  name: string;
  moduleId?: string;
  moduleName: string;
  monthlyPrice?: number | null;
  levelName?: string | null;
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
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [editing, setEditing] = useState<Student | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  // État Badge Élève & QR Code imprimable
  const [badgeStudent, setBadgeStudent] = useState<Student | null>(null);
  const [badgeTokenType, setBadgeTokenType] = useState<"signed" | "id">("signed");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [activeQRTokenString, setActiveQRTokenString] = useState<string>("");
  const [copiedToken, setCopiedToken] = useState(false);

  // Filtre module à l'étape 3 du wizard
  const [selectedModuleFilter, setSelectedModuleFilter] = useState<string>("all");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Formulaire progressif (4 étapes)
  const [form, setForm] = useState<{
    email: string;
    password: string;
    firstname: string;
    lastname: string;
    photo_url: string;
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
    photo_url: "",
    parent_name: "",
    parent_phone: "",
    groupids: [],
    monthly_fee: 3500,
    due_day: 5,
    billing_notes: "",
    is_draft: false,
    isactive: true,
  });

  const supabase = createClient();

  // Liste des matières uniques pour le filtre de classes
  const availableModules = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups) {
      if (g.moduleName) {
        map.set(g.moduleName, g.moduleName);
      }
    }
    return Array.from(map.values()).sort();
  }, [groups]);

  // Groupes filtrés par matière
  const filteredWizardGroups = useMemo(() => {
    if (selectedModuleFilter === "all") return groups;
    return groups.filter((g) => g.moduleName === selectedModuleFilter);
  }, [groups, selectedModuleFilter]);

  // Génération du QR Code pour le badge
  useEffect(() => {
    if (!badgeStudent) {
      setQrDataUrl("");
      setActiveQRTokenString("");
      return;
    }
    const tokenVal =
      badgeTokenType === "signed" ? generateQRToken(badgeStudent.id) : badgeStudent.id;
    setActiveQRTokenString(tokenVal);

    void QRCode.toDataURL(tokenVal, {
      width: 260,
      margin: 1,
      color: {
        dark: "#1e1b4b",
        light: "#ffffff",
      },
    })
      .then((url) => {
        setQrDataUrl(url);
      })
      .catch((err) => {
        console.error("Erreur génération QR code", err);
      });
  }, [badgeStudent, badgeTokenType]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Veuillez sélectionner un fichier image (JPG, PNG, WebP).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("La photo ne doit pas dépasser 5 Mo.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({ ...prev, photo_url: reader.result as string }));
      toast.success("Photo d'identité chargée");
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setForm((prev) => ({ ...prev, photo_url: "" }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openAdd = () => {
    setEditing(null);
    setForm({
      email: "",
      password: "",
      firstname: "",
      lastname: "",
      photo_url: "",
      parent_name: "",
      parent_phone: "",
      groupids: [],
      monthly_fee: 3500,
      due_day: 5,
      billing_notes: "",
      is_draft: false,
      isactive: true,
    });
    setSelectedModuleFilter("all");
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
      photo_url: s.photo_url || "",
      parent_name: s.parent_name || "",
      parent_phone: s.parent_phone || "",
      groupids: s.enrollments.map((e) => e.groupid),
      monthly_fee: 3500,
      due_day: 5,
      billing_notes: s.billing_notes || "",
      is_draft: !s.isactive,
      isactive: s.isactive,
    });
    setSelectedModuleFilter("all");
    setWizardStep(1);
    setWizardOpen(true);
  };

  const handleNextStep = () => {
    if (wizardStep === 1) {
      const v = validateStudentStep1({
        firstname: form.firstname,
        lastname: form.lastname,
        email: form.email,
        password: form.password,
        isEdit: !!editing,
      });
      if (!v.isValid) {
        const firstErr = Object.values(v.errors)[0];
        toast.error(firstErr);
        return;
      }
      setWizardStep(2);
    } else if (wizardStep === 2) {
      const v = validateStudentStep2({
        parent_name: form.parent_name,
        parent_phone: form.parent_phone,
      });
      if (!v.isValid) {
        const firstErr = Object.values(v.errors)[0];
        toast.error(firstErr);
        return;
      }
      setWizardStep(3);
    } else if (wizardStep === 3) {
      const v = validateStudentStep3(
        { groupids: form.groupids },
        { allowEmptyIfDraft: true, isDraft: form.is_draft }
      );
      if (!v.isValid) {
        const firstErr = Object.values(v.errors)[0];
        toast.error(firstErr);
        return;
      }
      setWizardStep(4);
    }
  };

  const toggleGroup = (groupid: string) => {
    setForm((prev) => {
      const nextGroupIds = prev.groupids.includes(groupid)
        ? prev.groupids.filter((id) => id !== groupid)
        : [...prev.groupids, groupid];

      const selectedGroups = groups.filter((g) => nextGroupIds.includes(g.id));
      const autoFee = calculateSuggestedMonthlyFee(selectedGroups);

      return {
        ...prev,
        groupids: nextGroupIds,
        monthly_fee: autoFee > 0 ? autoFee : prev.monthly_fee,
      };
    });
  };

  const handleGeneratePassword = () => {
    const generated = generateStudentSecurePassword();
    setForm((prev) => ({ ...prev, password: generated }));
    toast.info("Mot de passe sécurisé généré", { description: generated });
  };

  const handleSave = async () => {
    const validation = validateFullStudentForm({
      firstname: form.firstname,
      lastname: form.lastname,
      email: form.email,
      password: form.password,
      photo_url: form.photo_url,
      parent_name: form.parent_name,
      parent_phone: form.parent_phone,
      groupids: form.groupids,
      monthly_fee: form.monthly_fee,
      due_day: form.due_day,
      is_draft: form.is_draft,
      isEdit: !!editing,
    });

    if (!validation.isValid) {
      const firstErr = Object.values(validation.errors)[0];
      toast.error(firstErr);
      return;
    }

    setSaving(true);
    try {
      const activeStatus = form.is_draft ? false : form.isactive;
      const cleanEmail = form.email.trim().toLowerCase();
      const cleanFirstname = form.firstname.trim();
      const cleanLastname = form.lastname.trim();

      if (editing) {
        // Mise à jour de l'utilisateur
        const upd: Record<string, unknown> = {
          email: cleanEmail,
          firstname: cleanFirstname,
          lastname: cleanLastname,
          parent_name: form.parent_name.trim() || null,
          parent_phone: form.parent_phone.trim() || null,
          billing_notes: form.billing_notes.trim() || null,
          role: "student",
          isactive: activeStatus,
        };

        const { error: updErr } = await supabase.from("users").update(upd).eq("id", editing.id);
        if (updErr) throw updErr;

        // Différentiel d'inscriptions pour préserver l'historique et les timestamps
        const { data: existingEnrolls } = await supabase
          .from("enrollments")
          .select("groupid, status")
          .eq("studentid", editing.id);

        const existingIds = (existingEnrolls ?? []).map(
          (e: { groupid: string }) => e.groupid
        );
        const diff = diffEnrollments(existingIds, form.groupids);

        if (diff.toRemove.length > 0) {
          await supabase
            .from("enrollments")
            .delete()
            .eq("studentid", editing.id)
            .in("groupid", diff.toRemove);
        }

        if (diff.toAdd.length > 0) {
          await supabase.from("enrollments").insert(
            diff.toAdd.map((groupid) => ({
              id: uuid(),
              studentid: editing.id,
              groupid,
              status: "active",
              enrolledat: new Date().toISOString(),
            }))
          );
        }

        if (form.password && form.password.trim().length >= 8) {
          await updateUserAuthAction({ id: editing.id, password: form.password.trim() });
        }

        const enrolledGroups = groups.filter((g) => form.groupids.includes(g.id));
        setStudents((prev) =>
          prev.map((s) =>
            s.id === editing.id
              ? {
                  ...s,
                  email: cleanEmail,
                  firstname: cleanFirstname,
                  lastname: cleanLastname,
                  parent_name: form.parent_name.trim() || null,
                  parent_phone: form.parent_phone.trim() || null,
                  billing_notes: form.billing_notes.trim() || null,
                  photo_url: form.photo_url || s.photo_url || null,
                  fullName: `${cleanFirstname} ${cleanLastname}`.trim(),
                  initials: `${(cleanFirstname[0] ?? "").toUpperCase()}${(cleanLastname[0] ?? "").toUpperCase()}`,
                  isactive: activeStatus,
                  enrollments: enrolledGroups.map((g) => ({
                    groupid: g.id,
                    groupName: g.name,
                    moduleName: g.moduleName,
                    status: "active",
                  })),
                }
              : s
          )
        );
        toast.success("Fiche élève mise à jour avec succès");
      } else {
        // Création nouveau compte
        const { user: createdUser } = await createUserAction({
          email: cleanEmail,
          password: form.password.trim(),
          firstname: cleanFirstname,
          lastname: cleanLastname,
          role: "student",
        });
        if (!createdUser) throw new Error("Échec de la création du compte élève");

        // Mise à jour des coordonnées et tuteur
        await supabase
          .from("users")
          .update({
            parent_name: form.parent_name.trim() || null,
            parent_phone: form.parent_phone.trim() || null,
            billing_notes: form.billing_notes.trim() || null,
            isactive: activeStatus,
          })
          .eq("id", createdUser.id);

        // Inscriptions initiales
        if (form.groupids.length > 0) {
          await supabase.from("enrollments").insert(
            form.groupids.map((groupid) => ({
              id: uuid(),
              studentid: createdUser.id,
              groupid,
              status: "active",
              enrolledat: new Date().toISOString(),
            }))
          );
        }

        // Initialisation de la première facture mensuelle si renseignée
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
            notes: form.billing_notes.trim() || "Inscription initiale",
          });
        }

        const enrolledGroups = groups.filter((g) => form.groupids.includes(g.id));
        setStudents((prev) => [
          {
            id: createdUser.id,
            email: cleanEmail,
            firstname: cleanFirstname,
            lastname: cleanLastname,
            role: "student" as const,
            fullName: `${cleanFirstname} ${cleanLastname}`.trim(),
            initials: `${(cleanFirstname[0] ?? "").toUpperCase()}${(cleanLastname[0] ?? "").toUpperCase()}`,
            isactive: activeStatus,
            parent_name: form.parent_name.trim() || null,
            parent_phone: form.parent_phone.trim() || null,
            billing_notes: form.billing_notes.trim() || null,
            photo_url: form.photo_url || null,
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
      toast.error("Erreur d'enregistrement", { description: String(err) });
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
      toast.success("Élève supprimé définitivement");
      setDeleteTarget(null);
    } catch (err: unknown) {
      toast.error("Erreur lors de la suppression", { description: String(err) });
    } finally {
      setDeleting(false);
    }
  };

  const copyTokenToClipboard = () => {
    if (!activeQRTokenString) return;
    navigator.clipboard.writeText(activeQRTokenString);
    setCopiedToken(true);
    toast.success("Jeton QR copié dans le presse-papier");
    setTimeout(() => setCopiedToken(false), 2000);
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
        description="Consultez, inscrivez et gérez le suivi des élèves du centre de soutien scolaire (coordonnées des parents, classes suivies, tarifs et badges)."
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
                        <Avatar className="h-10 w-10 shrink-0 rounded-2xl ring-2 ring-[#6d28d9]/20 overflow-hidden">
                          {s.photo_url && (
                            <AvatarImage src={s.photo_url} alt={s.fullName} className="object-cover" />
                          )}
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
                          <DropdownMenuContent align="end" className="w-52 rounded-2xl p-1.5 shadow-xl">
                            <DropdownMenuItem
                              onClick={() => {
                                setBadgeStudent(s);
                                setBadgeTokenType("signed");
                              }}
                              className="rounded-xl text-xs font-semibold text-[#6d28d9] focus:bg-[#6d28d9]/10"
                            >
                              <QrCode className="mr-2 h-4 w-4" />
                              Badge & QR Code Sécurisé
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

      {/* ---------------- WIZARD INSCRIPTION ÉLÈVE EN 4 ÉTAPES ---------------- */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="sm:max-w-[580px] rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
          <DialogHeader className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mascot pose="validation" size="sm" />
                <div>
                  <DialogTitle className="text-lg font-black text-[#1e1b4b]">
                    {editing ? "Modifier la fiche élève" : "Inscription d'un nouvel élève"}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Étape {wizardStep} sur 4 :{" "}
                    {wizardStep === 1
                      ? "Identité de l'Élève & Photo"
                      : wizardStep === 2
                      ? "Responsable Légal & Contact Parents"
                      : wizardStep === 3
                      ? "Classes & Matières de Soutien"
                      : "Tarification, Statut & Badge"}
                  </DialogDescription>
                </div>
              </div>
              <Badge className="bg-[#6d28d9]/10 text-[#6d28d9] border-none font-bold">
                Étape {wizardStep} / 4
              </Badge>
            </div>

            {/* Barre de progression (4 étapes) */}
            <div className="w-full bg-[#6d28d9]/10 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-[#6d28d9] h-full transition-all duration-300 rounded-full"
                style={{ width: `${(wizardStep / 4) * 100}%` }}
              />
            </div>
          </DialogHeader>

          {/* CONTENU DU WIZARD */}
          <div className="py-3">
            {/* ÉTAPE 1 : Identité & Photo de l'élève */}
            {wizardStep === 1 && (
              <div className="space-y-4">
                {/* Photo de profil élève */}
                <div className="flex items-center gap-4 p-3.5 rounded-2xl bg-[#f8f9fc] border border-[#6d28d9]/15">
                  <div className="relative">
                    <Avatar className="h-16 w-16 rounded-2xl ring-2 ring-[#6d28d9]/30 overflow-hidden shrink-0">
                      {form.photo_url ? (
                        <AvatarImage src={form.photo_url} alt="Photo élève" className="object-cover" />
                      ) : null}
                      <AvatarFallback className="bg-gradient-to-br from-[#6d28d9] to-[#f97316] text-white font-black text-base">
                        {form.firstname && form.lastname
                          ? `${form.firstname[0]?.toUpperCase()}${form.lastname[0]?.toUpperCase()}`
                          : "ÉL"}
                      </AvatarFallback>
                    </Avatar>
                    {form.photo_url && (
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-md hover:bg-rose-600"
                        title="Supprimer la photo"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-xs font-bold text-[#1e1b4b] flex items-center gap-1.5">
                      <Camera className="h-3.5 w-3.5 text-[#6d28d9]" />
                      Photo d&apos;identité pour le badge scolaire
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Format JPG ou PNG (recommandé pour impression sur la carte élève).
                    </p>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handlePhotoUpload}
                      accept="image/*"
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="h-8 rounded-xl text-xs font-bold border-[#6d28d9]/20 text-[#6d28d9] hover:bg-[#6d28d9]/10"
                    >
                      {form.photo_url ? "Changer la photo" : "Ajouter une photo"}
                    </Button>
                  </div>
                </div>

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
                      placeholder="Haddad"
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
                    placeholder="sarah.haddad@eleve.dz"
                    className="rounded-xl border-[#6d28d9]/15 text-xs h-10"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-[#1a1a2e]">
                      {editing ? "Nouveau mot de passe (optionnel)" : "Mot de passe élève *"}
                    </Label>
                    <button
                      type="button"
                      onClick={handleGeneratePassword}
                      className="text-[11px] font-bold text-[#6d28d9] hover:underline flex items-center gap-1"
                    >
                      <Sparkles className="h-3 w-3" />
                      Générer sécurisé
                    </button>
                  </div>
                  <Input
                    type="text"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={editing ? "Laisser vide pour ne pas modifier" : "Au moins 8 caractères"}
                    className="rounded-xl border-[#6d28d9]/15 text-xs h-10 font-mono"
                  />
                </div>
              </div>
            )}

            {/* ÉTAPE 2 : Responsable Légal & Contact Parents */}
            {wizardStep === 2 && (
              <div className="space-y-4">
                <div className="p-3.5 rounded-2xl bg-[#6d28d9]/5 border border-[#6d28d9]/15">
                  <p className="text-xs font-bold text-[#6d28d9] flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" /> Coordonnées du Responsable Légal / Parent
                  </p>
                  <p className="text-[11px] text-[#475569] mt-0.5">
                    Ces coordonnées servent à l&apos;envoi des alertes d&apos;absences, reçus de paiement et relances WhatsApp.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-[#1a1a2e]">Nom complet du parent / tuteur</Label>
                  <Input
                    value={form.parent_name}
                    onChange={(e) => setForm({ ...form, parent_name: e.target.value })}
                    placeholder="M. ou Mme Haddad (Père / Mère)"
                    className="rounded-xl border-[#6d28d9]/15 text-xs h-10"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-[#1a1a2e]">
                    Téléphone parent (SMS / Relance WhatsApp)
                  </Label>
                  <Input
                    value={form.parent_phone}
                    onChange={(e) => setForm({ ...form, parent_phone: e.target.value })}
                    placeholder="0550 12 34 56 ou 0661 22 33 44"
                    className="rounded-xl border-[#6d28d9]/15 text-xs h-10 font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Format standard algérien à 10 chiffres (Ooredoo, Djezzy, Mobilis).
                  </p>
                </div>
              </div>
            )}

            {/* ÉTAPE 3 : Choix Pédagogique (Matières & Classes) */}
            {wizardStep === 3 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Sélectionnez les matières et classes de soutien pour cet élève :
                  </p>
                  {/* Filtre par matière */}
                  <div className="w-48 shrink-0">
                    <Select
                      value={selectedModuleFilter}
                      onValueChange={(v) => { if (v) setSelectedModuleFilter(v); }}
                    >
                      <SelectTrigger className="h-9 rounded-xl border-[#6d28d9]/20 text-xs font-semibold">
                        <SelectValue placeholder="Toutes les matières" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Toutes les matières</SelectItem>
                        {availableModules.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {filteredWizardGroups.length === 0 ? (
                    <EmptyState
                      compact
                      pose="reflexion"
                      title="Aucune classe trouvée"
                      hint="Aucune classe ne correspond à cette matière."
                    />
                  ) : (
                    filteredWizardGroups.map((g) => {
                      const checked = form.groupids.includes(g.id);
                      return (
                        <label
                          key={g.id}
                          className={`flex items-center gap-3 rounded-2xl border p-3 cursor-pointer transition-all ${
                            checked
                              ? "bg-[#6d28d9]/10 border-[#6d28d9]/40 shadow-xs"
                              : "border-[#6d28d9]/10 hover:bg-[#f8f9fc]"
                          }`}
                        >
                          <Checkbox checked={checked} onCheckedChange={() => toggleGroup(g.id)} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-bold text-[#1a1a2e]">{g.name}</p>
                              {g.levelName && (
                                <span className="text-[10px] text-muted-foreground font-medium">
                                  • {g.levelName}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge className="bg-[#6d28d9]/10 text-[#6d28d9] border-none text-[10px] font-semibold">
                                {g.moduleName}
                              </Badge>
                              {g.monthlyPrice ? (
                                <span className="text-[10px] font-bold text-emerald-600 font-mono">
                                  {g.monthlyPrice.toLocaleString("fr-FR")} DA/mois
                                </span>
                              ) : null}
                            </div>
                          </div>
                          {checked && (
                            <Badge className="shrink-0 rounded-full bg-[#6d28d9] text-white border-none text-[10px] font-bold">
                              Inscrit
                            </Badge>
                          )}
                        </label>
                      );
                    })
                  )}
                </div>

                <div className="p-3 rounded-2xl bg-[#f8f9fc] border border-[#6d28d9]/10 flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1e1b4b]">
                    Classes sélectionnées : <span className="text-[#6d28d9]">{form.groupids.length}</span>
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">
                    Tarif mensuel calculé :{" "}
                    <strong className="text-emerald-600 font-mono font-bold">
                      {calculateSuggestedMonthlyFee(
                        groups.filter((g) => form.groupids.includes(g.id))
                      ).toLocaleString("fr-FR")}{" "}
                      DA
                    </strong>
                  </span>
                </div>
              </div>
            )}

            {/* ÉTAPE 4 : Tarification, Statut & Badge */}
            {wizardStep === 4 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5 p-3.5 rounded-2xl bg-[#f8f9fc] border border-[#6d28d9]/15">
                    <Label className="text-xs font-bold text-[#1a1a2e] flex items-center gap-1">
                      <DollarSign className="h-3.5 w-3.5 text-[#6d28d9]" />
                      Mensualité convenue (DA)
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="500"
                      value={form.monthly_fee}
                      onChange={(e) =>
                        setForm({ ...form, monthly_fee: Number(e.target.value) })
                      }
                      className="rounded-xl border-[#6d28d9]/15 text-sm h-10 font-bold text-[#1e1b4b]"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Montant facturé chaque mois pour toutes les classes.
                    </p>
                  </div>

                  <div className="space-y-1.5 p-3.5 rounded-2xl bg-[#f8f9fc] border border-[#6d28d9]/15">
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
                      className="rounded-xl border-[#6d28d9]/15 text-sm h-10 font-bold text-[#1e1b4b]"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Ex: le 5 du mois pour les alertes de paiement.
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-[#1a1a2e] flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    Notes financières / Référence de tarification
                  </Label>
                  <Input
                    value={form.billing_notes}
                    onChange={(e) => setForm({ ...form, billing_notes: e.target.value })}
                    placeholder="Ex: Réduction fratrie -10%, Pack BAC Scientifique..."
                    className="rounded-xl border-[#6d28d9]/15 text-xs h-10"
                  />
                </div>

                {/* Brouillon vs Actif */}
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-amber-900">Enregistrer en brouillon ?</p>
                    <p className="text-[11px] text-amber-800/80">
                      L&apos;élève restera inactif jusqu&apos;à validation finale.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.is_draft}
                    onChange={(e) => setForm({ ...form, is_draft: e.target.checked })}
                    className="rounded border-amber-300 text-amber-600 focus:ring-amber-500 h-4 w-4 cursor-pointer"
                  />
                </div>

                {/* Aperçu du badge d'accès élève */}
                <div className="p-3 rounded-2xl bg-[#6d28d9]/5 border border-[#6d28d9]/20 flex items-center gap-3">
                  <Avatar className="h-12 w-12 rounded-xl ring-2 ring-[#6d28d9]/20 overflow-hidden shrink-0">
                    {form.photo_url ? (
                      <AvatarImage src={form.photo_url} alt="Photo" className="object-cover" />
                    ) : null}
                    <AvatarFallback className="bg-gradient-to-br from-[#6d28d9] to-[#f97316] text-white font-bold text-xs">
                      {form.firstname && form.lastname
                        ? `${form.firstname[0]?.toUpperCase()}${form.lastname[0]?.toUpperCase()}`
                        : "ÉL"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[#1e1b4b] truncate">
                      {form.firstname} {form.lastname}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {form.groupids.length} classe(s) assignée(s)
                    </p>
                  </div>
                  <Badge className="bg-emerald-50 text-emerald-600 border border-emerald-200 text-[10px] font-bold flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                    Badge QR Prêt
                  </Badge>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between w-full pt-3 border-t border-slate-100">
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

      {/* ---------------- DIALOG BADGE ÉLÈVE & CARTE SCOLAIRE AVEC QR CODE ---------------- */}
      <Dialog open={!!badgeStudent} onOpenChange={(o) => !o && setBadgeStudent(null)}>
        <DialogContent className="sm:max-w-[490px] rounded-3xl p-6">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-lg font-black text-[#1e1b4b] flex items-center gap-2">
                <QrCode className="h-5 w-5 text-[#6d28d9]" />
                Carte Scolaire & Badge Élève
              </DialogTitle>
              {/* Sélecteur de format de jeton QR */}
              <div className="flex rounded-xl bg-slate-100 p-0.5 border text-xs">
                <button
                  type="button"
                  onClick={() => setBadgeTokenType("signed")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                    badgeTokenType === "signed"
                      ? "bg-white text-[#6d28d9] shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Jeton 24h SGAU
                </button>
                <button
                  type="button"
                  onClick={() => setBadgeTokenType("id")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                    badgeTokenType === "id"
                      ? "bg-white text-[#6d28d9] shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  ID Permanent
                </button>
              </div>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Badge individuel scannable à la douchette ou caméra pour check-in automatique.
            </DialogDescription>
          </DialogHeader>

          {badgeStudent && (
            <div className="flex flex-col items-center py-2">
              {/* Carte Badge (Visuelle à l'écran et imprimable) */}
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
                    <Avatar className="h-16 w-16 rounded-xl ring-2 ring-[#6d28d9]/30 shrink-0 overflow-hidden">
                      {badgeStudent.photo_url ? (
                        <AvatarImage src={badgeStudent.photo_url} alt={badgeStudent.fullName} className="object-cover" />
                      ) : null}
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
                    <div className="flex items-center gap-1 mt-1 text-[9px] font-bold text-slate-600">
                      <ShieldCheck className="h-3 w-3 text-emerald-600" />
                      {badgeTokenType === "signed" ? "Jeton signé anti-fraude (24h)" : "Identifiant Permanent"}
                    </div>
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

              {/* Jeton textuel avec bouton copier */}
              <div className="w-full max-w-[380px] mt-3 flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200 text-[10px] font-mono text-slate-600">
                <span className="truncate flex-1">{activeQRTokenString}</span>
                <button
                  type="button"
                  onClick={copyTokenToClipboard}
                  className="p-1 hover:bg-slate-200 rounded text-slate-700"
                  title="Copier le jeton"
                >
                  {copiedToken ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
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
