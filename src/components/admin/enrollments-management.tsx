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
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, Plus, MoreHorizontal, Edit, Trash2, Loader2, ClipboardList, AlertTriangle, CreditCard, CheckCircle2, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { recordStudentPaymentAction } from "@/lib/actions/payments";
import { todayLocal, currentMonthLocal } from "@/lib/dates";
import type { PaymentMethod } from "@/types/database";

const DAYS_FR: Record<number, string> = {
  0: "Dimanche",
  1: "Lundi",
  2: "Mardi",
  3: "Mercredi",
  4: "Jeudi",
  5: "Vendredi",
  6: "Samedi",
};

type Enrollment = {
  id: string; studentid: string; studentName?: string;
  groupid: string; groupName?: string; moduleName?: string;
  status: "active" | "completed" | "dropped";
  enrolledat: string;
};

type Student = { id: string; firstname: string; lastname: string; fullName: string };
type Group = { id: string; name: string; moduleName: string };

export function EnrollmentsManagement({ initialEnrollments, students, groups }: {
  initialEnrollments: Enrollment[]; students: Student[]; groups: Group[];
}) {
  const [enrollments, setEnrollments] = useState<Enrollment[]>(initialEnrollments);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Enrollment | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ studentid: "", groupid: "", status: "active" as Enrollment["status"] });
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [checkingConflict, setCheckingConflict] = useState<boolean>(false);

  // État suppression
  const [deleteTarget, setDeleteTarget] = useState<Enrollment | null>(null);
  const [deleting, setDeleting] = useState(false);

  // État du Dialog de Paiement automatique post-inscription
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentStudent, setPaymentStudent] = useState<Student | null>(null);
  const [paymentGroup, setPaymentGroup] = useState<Group | null>(null);
  const [paymentProrata, setPaymentProrata] = useState<number>(4);
  const [paymentAmountPaid, setPaymentAmountPaid] = useState<number>(4000);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentBasePrice, setPaymentBasePrice] = useState(4000);

  const calculatedAmountDue = (paymentBasePrice * paymentProrata) / 4;

  const supabase = createClient();

  // Détection de conflits d'emploi du temps lors du choix élève + groupe
  useEffect(() => {
    if (!form.studentid || !form.groupid) {
      setConflictWarning(null);
      return;
    }
    let active = true;
    setCheckingConflict(true);

    void (async () => {
      // 1. Créneaux de la classe cible
      const { data: targetMasters } = await supabase
        .from("session_masters")
        .select("dayofweek, starttime, endtime")
        .eq("groupid", form.groupid);

      // 2. Autres classes actives de l'élève
      const { data: studentOtherEnrollments } = await supabase
        .from("enrollments")
        .select("groupid, groups(name, modules(name))")
        .eq("studentid", form.studentid)
        .eq("status", "active")
        .neq("groupid", form.groupid);

      if (!active) return;

      if (
        !targetMasters ||
        targetMasters.length === 0 ||
        !studentOtherEnrollments ||
        studentOtherEnrollments.length === 0
      ) {
        setConflictWarning(null);
        setCheckingConflict(false);
        return;
      }

      const otherGroupIds = studentOtherEnrollments.map((e: { groupid: string }) => e.groupid);
      const { data: otherMasters } = await supabase
        .from("session_masters")
        .select("groupid, dayofweek, starttime, endtime")
        .in("groupid", otherGroupIds);

      if (!active) return;

      let conflictFound: string | null = null;
      for (const t of targetMasters as { dayofweek: number; starttime: string; endtime: string }[]) {
        for (const o of (otherMasters || []) as { groupid: string; dayofweek: number; starttime: string; endtime: string }[]) {
          if (Number(t.dayofweek) === Number(o.dayofweek)) {
            const tStart = String(t.starttime).slice(0, 5);
            const tEnd = String(t.endtime).slice(0, 5);
            const oStart = String(o.starttime).slice(0, 5);
            const oEnd = String(o.endtime).slice(0, 5);

            if (tStart < oEnd && tEnd > oStart) {
              const conflictGrp = studentOtherEnrollments.find(
                (e: { groupid: string }) => e.groupid === o.groupid
              );
              const grpName =
                (conflictGrp?.groups as { name?: string })?.name || "une autre classe";
              const dayName = DAYS_FR[Number(t.dayofweek)] || `Jour ${t.dayofweek}`;
              conflictFound = `Conflit d'horaire le ${dayName} (${tStart} - ${tEnd}) : chevauchement direct avec la classe "${grpName}" (${oStart} - ${oEnd}).`;
              break;
            }
          }
        }
        if (conflictFound) break;
      }

      setConflictWarning(conflictFound);
      setCheckingConflict(false);
    })();

    return () => {
      active = false;
    };
  }, [form.studentid, form.groupid, supabase]);

  const openAdd = () => {
    setEditing(null);
    setForm({ studentid: "", groupid: "", status: "active" });
    setConflictWarning(null);
    setDialogOpen(true);
  };

  const openEdit = (e: Enrollment) => {
    setEditing(e);
    setForm({ studentid: e.studentid, groupid: e.groupid, status: e.status });
    setConflictWarning(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (!form.studentid || !form.groupid) { toast.error("Veuillez sélectionner un étudiant et un groupe"); setSaving(false); return; }
      const student = students.find((s) => s.id === form.studentid);
      const group = groups.find((g) => g.id === form.groupid);
      if (!student || !group) { toast.error("Étudiant ou groupe introuvable"); setSaving(false); return; }

      const { data: existing } = await supabase
        .from("enrollments")
        .select("id")
        .eq("studentid", form.studentid)
        .eq("groupid", form.groupid);
      const dupes = existing ?? [];

      if (editing) {
        if (dupes.some((d) => d.id !== editing.id)) { toast.error("Cet étudiant est déjà inscrit dans ce groupe"); setSaving(false); return; }
        await supabase.from("enrollments").update({
          studentid: form.studentid, groupid: form.groupid, status: form.status,
        }).eq("id", editing.id);
        setEnrollments((prev) => prev.map((e) => e.id === editing.id ? {
          ...e, studentid: form.studentid, studentName: student.fullName,
          groupid: form.groupid, groupName: group.name, moduleName: group.moduleName,
          status: form.status,
        } : e));
        toast.success("Inscription mise à jour");
      } else {
        if (dupes.length > 0) { toast.error("Cet étudiant est déjà inscrit dans ce groupe"); setSaving(false); return; }
        const id = uuid();
        const enrolledat = new Date().toISOString();
        await supabase.from("enrollments").insert({
          id, studentid: form.studentid, groupid: form.groupid, status: form.status, enrolledat,
        });
        setEnrollments((prev) => [{
          id, studentid: form.studentid, studentName: student.fullName,
          groupid: form.groupid, groupName: group.name, moduleName: group.moduleName,
          status: form.status, enrolledat,
        }, ...prev]);
        toast.success("Inscription créée");
        setDialogOpen(false);

        // Ouvre immédiatement la fenêtre de paiement
        setPaymentStudent(student);
        setPaymentGroup(group);
        setPaymentProrata(4);
        
        let realPrice = 4000;
        try {
          const { data: gData } = await supabase
            .from("groups")
            .select("moduleid, modules(monthly_price)")
            .eq("id", form.groupid)
            .single();
          const price = (gData as any)?.modules?.monthly_price;
          if (price) realPrice = price;
        } catch (e) {}

        setPaymentBasePrice(realPrice);
        setPaymentAmountPaid(realPrice);
        setPaymentMethod("cash");
        setPaymentDialogOpen(true);
      }
    } catch (err) { toast.error("Erreur", { description: String(err) }); }
    setSaving(false);
  };

  const handleSavePayment = async () => {
    if (!paymentStudent || !paymentGroup) return;
    setPaymentSaving(true);
    try {
      const todayPeriod = currentMonthLocal();
      const res = await recordStudentPaymentAction({
        student_id: paymentStudent.id,
        billing_period: todayPeriod,
        amount_due: calculatedAmountDue,
        amount_paid: paymentAmountPaid,
        due_date: todayLocal(),
        payment_method: paymentMethod,
        notes: `Paiement initial (${paymentProrata}/4 séances) - Groupe ${paymentGroup.name}`,
      });
      if (!res.ok) throw new Error(res.error || "Erreur enregistrement paiement");
      toast.success("Paiement enregistré avec succès !", {
        description: `Un reçu de ${paymentAmountPaid.toLocaleString("fr-FR")} DA a été généré pour ${paymentStudent.fullName}.`,
      });
      setPaymentDialogOpen(false);
    } catch (err) {
      toast.error("Erreur de paiement", { description: String(err) });
    }
    setPaymentSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.from("enrollments").delete().eq("id", deleteTarget.id).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Aucune ligne supprimée (vérifiez les permissions RLS)");
      setEnrollments((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      toast.success("Inscription supprimée");
      setDeleteTarget(null);
    } catch (err) {
      toast.error("Erreur", { description: String(err) });
    } finally {
      setDeleting(false);
    }
  };

  const statusBadge = (status: Enrollment["status"]) => {
    const map = {
      active: { label: "Actif", dot: "bg-emerald-500 animate-pulse", classes: "bg-emerald-50 text-emerald-600" },
      completed: { label: "Terminé", dot: "bg-[#6d28d9]", classes: "bg-[#6d28d9]/10 text-[#6d28d9]" },
      dropped: { label: "Abandonné", dot: "bg-amber-500", classes: "bg-amber-50 text-amber-600" },
    };
    const m = map[status];
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${m.classes}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
        {m.label}
      </span>
    );
  };

  const filtered = enrollments.filter(
    (e) => (e.studentName ?? "").toLowerCase().includes(search.toLowerCase()) ||
           (e.groupName ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-10">
      {/* Mascot Header */}
      <MascotHeader
        title="Gestion des Inscriptions"
        description="Affectez les étudiants aux groupes de formation et suivez le statut de chaque inscription."
        pose="tous"
        mascotMessage={`${enrollments.length} inscription(s) enregistrée(s)`}
        badge="Formation & Inscriptions"
      >
        <Button
          onClick={openAdd}
          className="h-11 rounded-2xl bg-gradient-to-r from-[#6d28d9] to-[#8b5cf6] px-5 font-bold text-white shadow-md shadow-[#6d28d9]/20 hover:shadow-lg"
        >
          <Plus className="mr-2 h-4 w-4" />
          Ajouter une Inscription
        </Button>
      </MascotHeader>

      {/* Main Table Card */}
      <Card className="overflow-hidden rounded-3xl border border-[#6d28d9]/10 bg-white shadow-xs">
        <div className="p-5 border-b border-[#6d28d9]/5">
          <div className="relative max-w-md">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6d28d9]" />
            <Input
              placeholder="Rechercher par étudiant ou groupe..."
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
              title="Aucune inscription trouvée"
              hint="Aucune inscription ne correspond à vos critères de recherche."
            />
          ) : (
            <Table>
              <TableHeader className="bg-[#f8f9fc]">
                <TableRow className="border-b border-[#6d28d9]/5 hover:bg-transparent">
                  <TableHead className="py-4 text-xs font-extrabold uppercase tracking-wider text-[#6d28d9]">Étudiant</TableHead>
                  <TableHead className="py-4 text-xs font-extrabold uppercase tracking-wider text-[#6d28d9]">Groupe</TableHead>
                  <TableHead className="hidden py-4 text-xs font-extrabold uppercase tracking-wider text-[#6d28d9] md:table-cell">Formation</TableHead>
                  <TableHead className="hidden py-4 text-xs font-extrabold uppercase tracking-wider text-[#6d28d9] sm:table-cell">Statut</TableHead>
                  <TableHead className="hidden py-4 text-xs font-extrabold uppercase tracking-wider text-[#6d28d9] lg:table-cell">Date d&apos;inscription</TableHead>
                  <TableHead className="w-16 py-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow key={e.id} className="border-b border-[#6d28d9]/5 transition-colors hover:bg-[#f3f0ff]/30">
                    <TableCell className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-[#6d28d9]/10 p-2">
                          <ClipboardList className="h-4 w-4 text-[#6d28d9]" />
                        </div>
                        <p className="text-sm font-bold text-[#1a1a2e]">{e.studentName ?? "—"}</p>
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <span className="text-xs font-semibold text-[#64748b]">{e.groupName ?? "—"}</span>
                    </TableCell>
                    <TableCell className="hidden py-4 md:table-cell">
                      <Badge className="rounded-full bg-[#6d28d9]/10 text-xs font-semibold text-[#6d28d9] border-none">{e.moduleName ?? "—"}</Badge>
                    </TableCell>
                    <TableCell className="hidden py-4 sm:table-cell">{statusBadge(e.status)}</TableCell>
                    <TableCell className="hidden py-4 lg:table-cell">
                      <span className="text-xs font-medium text-[#64748b]">
                        {new Date(e.enrolledat).toLocaleDateString("fr-FR")}
                      </span>
                    </TableCell>
                    <TableCell className="py-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl text-[#64748b] hover:bg-[#6d28d9]/10 hover:text-[#6d28d9]"><MoreHorizontal className="h-4 w-4" /></Button>} />
                        <DropdownMenuContent align="end" className="w-44 rounded-2xl p-1.5 shadow-xl">
                          <DropdownMenuItem onClick={() => openEdit(e)} className="rounded-xl text-xs font-semibold">
                            <Edit className="mr-2 h-4 w-4 text-[#6d28d9]" />
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuItem className="rounded-xl text-xs font-semibold text-rose-600 focus:bg-rose-50" onClick={() => setDeleteTarget(e)}>
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

      {/* Modal Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl p-6">
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-3">
              <Mascot pose="validation" size="sm" />
              <div>
                <DialogTitle className="text-lg font-bold text-[#1a1a2e]">
                  {editing ? "Modifier l'inscription" : "Ajouter une inscription"}
                </DialogTitle>
                <DialogDescription className="text-xs text-[#64748b]">
                  {editing ? "Modifiez les informations de l'inscription." : "Inscrivez un étudiant à un groupe de formation."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="enr-student" className="text-xs font-bold text-[#1a1a2e]">Étudiant</Label>
              <Select value={form.studentid} onValueChange={(v) => { if (v) setForm({ ...form, studentid: v }); }}>
                <SelectTrigger id="enr-student" className="rounded-xl border-[#6d28d9]/10 text-xs">
                  <SelectValue placeholder="Sélectionner un étudiant">
                    {students.find((s) => s.id === form.studentid)?.fullName}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {students.map((s) => <SelectItem key={s.id} value={s.id}>{s.fullName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="enr-group" className="text-xs font-bold text-[#1a1a2e]">Groupe</Label>
              <Select value={form.groupid} onValueChange={(v) => { if (v) setForm({ ...form, groupid: v }); }}>
                <SelectTrigger id="enr-group" className="rounded-xl border-[#6d28d9]/10 text-xs">
                  <SelectValue placeholder="Sélectionner un groupe">
                    {(() => {
                      const g = groups.find((g) => g.id === form.groupid);
                      return g ? `${g.name} (${g.moduleName})` : undefined;
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      <span className="font-medium">{g.name}</span>
                      <span className="text-[#64748b]"> — {g.moduleName}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {checkingConflict && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground italic py-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#6d28d9]" />
                Vérification des chevauchements d&apos;horaires...
              </div>
            )}

            {conflictWarning && (
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 space-y-1 animate-in fade-in duration-200">
                <div className="flex items-center gap-1.5 font-bold text-xs text-amber-800">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  Attention : Conflit d&apos;Emploi du Temps Détecté
                </div>
                <p className="text-[11px] leading-relaxed text-amber-800/90 pl-5">
                  {conflictWarning}
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="enr-status" className="text-xs font-bold text-[#1a1a2e]">Statut</Label>
              <Select value={form.status} onValueChange={(v) => { if (v) setForm({ ...form, status: v as Enrollment["status"] }); }}>
                <SelectTrigger id="enr-status" className="rounded-xl border-[#6d28d9]/10 text-xs">
                  <SelectValue placeholder="Sélectionner un statut">
                    {form.status === "active" ? "Actif" : form.status === "completed" ? "Terminé" : form.status === "dropped" ? "Abandonné" : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Actif</SelectItem>
                  <SelectItem value="completed">Terminé</SelectItem>
                  <SelectItem value="dropped">Abandonné</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl">Annuler</Button>
            <Button onClick={handleSave} disabled={saving} className="rounded-xl bg-[#6d28d9] hover:bg-[#5b21b6] text-white font-bold">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Enregistrer" : "Créer l'inscription"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Paiement Automatique Post-Inscription */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="sm:max-w-[520px] rounded-3xl p-6 border-[#6d28d9]/20 shadow-2xl">
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-[#6d28d9]/10 p-2.5 text-[#6d28d9]">
                <CreditCard className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-[#1a1a2e]">
                  Encaisser le Paiement Initial
                </DialogTitle>
                <DialogDescription className="text-xs text-[#64748b]">
                  L&apos;élève <strong className="text-[#6d28d9]">{paymentStudent?.fullName}</strong> vient d&apos;être inscrit dans <strong className="text-[#6d28d9]">{paymentGroup?.name}</strong>.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {/* Prorata / Nombre de séances */}
            <div className="space-y-2 rounded-2xl bg-[#f8f9fc] p-3.5 border border-[#6d28d9]/10">
              <Label className="text-xs font-bold text-[#1a1a2e]">Choix de la Formule (Prorata / Bloc de 4 séances)</Label>
              <div className="grid grid-cols-4 gap-2 pt-1">
                {[1, 2, 3, 4].map((nb) => (
                  <Button
                    key={nb}
                    type="button"
                    variant={paymentProrata === nb ? "default" : "outline"}
                    onClick={() => {
                      setPaymentProrata(nb);
                      const newDue = (paymentBasePrice * nb) / 4;
                      setPaymentAmountPaid(newDue);
                    }}
                    className={`h-10 rounded-xl text-xs font-bold ${
                      paymentProrata === nb
                        ? "bg-[#6d28d9] text-white shadow-md hover:bg-[#5b21b6]"
                        : "border-[#6d28d9]/20 hover:bg-[#6d28d9]/5 text-[#1a1a2e]"
                    }`}
                  >
                    {nb} {nb === 1 ? "séance" : "séances"} ({((nb / 4) * 100).toFixed(0)}%)
                  </Button>
                ))}
              </div>
            </div>

            {/* Calcul & Montant */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-[#1a1a2e]">Montant Dû (DA)</Label>
                <Input
                  type="number"
                  value={calculatedAmountDue}
                  disabled
                  className="rounded-xl border-[#6d28d9]/20 bg-purple-50/50 font-bold text-[#6d28d9]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-[#1a1a2e]">Montant Versé (DA)</Label>
                <Input
                  type="number"
                  value={paymentAmountPaid}
                  onChange={(e) => setPaymentAmountPaid(Number(e.target.value))}
                  className="rounded-xl border-[#6d28d9]/20 font-bold text-emerald-600 focus:border-[#6d28d9]"
                />
              </div>
            </div>

            {/* Mode de paiement */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-[#1a1a2e]">Mode de règlement</Label>
              <Select value={paymentMethod} onValueChange={(v) => { if (v) setPaymentMethod(v as PaymentMethod); }}>
                <SelectTrigger className="rounded-xl border-[#6d28d9]/15 text-xs font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-[#6d28d9]/15 shadow-xl">
                  <SelectItem value="cash" className="rounded-xl text-xs font-bold">💵 Espèces (Cash)</SelectItem>
                  <SelectItem value="baridimob" className="rounded-xl text-xs font-bold">📱 BaridiMob</SelectItem>
                  <SelectItem value="cc" className="rounded-xl text-xs font-bold">💳 Carte Bancaire (CIB)</SelectItem>
                  <SelectItem value="bank_transfer" className="rounded-xl text-xs font-bold">🏦 Virement Bancaire</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)} className="rounded-xl border-[#6d28d9]/20 font-bold">
              Ignorer (Payer plus tard)
            </Button>
            <Button onClick={handleSavePayment} disabled={paymentSaving} className="rounded-xl bg-[#6d28d9] hover:bg-[#5b21b6] text-white font-bold">
              {paymentSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Encaisser {paymentAmountPaid.toLocaleString("fr-FR")} DA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Suppression Inscription AlertDialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette inscription ?</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir retirer l&apos;élève{" "}
              <strong className="text-[#1a1a2e] font-semibold">{deleteTarget?.studentName ?? deleteTarget?.studentid}</strong>{" "}
              de la classe <strong className="text-[#1a1a2e] font-semibold">{deleteTarget?.groupName ?? deleteTarget?.groupid}</strong> ?
              Cette action supprimera également les pointages d&apos;assiduité rattachés.
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
              Supprimer l&apos;inscription
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
