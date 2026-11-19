"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  User,
  Phone,
  Mail,
  GraduationCap,
  Calendar,
  CreditCard,
  MessageCircle,
  Receipt,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Copy,
  Sparkles,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { getStudentFinancialFileAction } from "@/lib/actions/payments";
import type { StudentFinancialFile, StudentPayment } from "@/types/database";

interface StudentFinancialSheetProps {
  studentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onQuickPay?: (studentId: string, defaultAmount: number) => void;
  onReprintReceipt?: (payment: StudentPayment) => void;
}

export function StudentFinancialSheet({
  studentId,
  open,
  onOpenChange,
  onQuickPay,
  onReprintReceipt,
}: StudentFinancialSheetProps) {
  const [data, setData] = useState<StudentFinancialFile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !studentId) {
      setData(null);
      return;
    }

    let active = true;
    setLoading(true);

    void (async () => {
      const res = await getStudentFinancialFileAction(studentId);
      if (!active) return;
      if (res.ok && res.data) {
        setData(res.data);
      } else {
        toast.error("Impossible de charger la fiche élève", {
          description: res.error,
        });
      }
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [open, studentId]);

  const copyPhone = (phone?: string | null) => {
    if (!phone) return;
    navigator.clipboard.writeText(phone);
    toast.success("Numéro copié", { description: phone });
  };

  const openWhatsApp = () => {
    if (!data) return;
    const phone = (data.student.parent_phone || "").replace(/[^0-9]/g, "");
    let cleanPhone = phone;
    if (cleanPhone.startsWith("0")) {
      cleanPhone = "213" + cleanPhone.slice(1);
    }
    const remaining = data.billingSummary.remainingBalance;
    const studentName = data.student.fullName;
    const parentName = data.student.parent_name || "Parent d'élève";

    const msg = `Bonjour ${parentName},\nITRI Academy (Centre de formation et soutien scolaire) vous informe du suivi de ${studentName} :\n- Séances consommées : ${data.cycleTracking.sessionsInCurrentCycle}/4\n- Solde à régler : ${remaining.toLocaleString("fr-FR")} DA\nMerci de vous rapprocher de notre secrétariat pour la régularisation.\nPour toute question, nous restons à votre entière disposition.`;

    if (!cleanPhone) {
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
      return;
    }
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto p-6 rounded-3xl border border-[#6d28d9]/20 shadow-2xl">
        <DialogHeader className="pb-3 border-b border-[#6d28d9]/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[#6d28d9] to-[#f97316] flex items-center justify-center text-white font-black text-lg shadow-md shadow-[#6d28d9]/20">
                {data?.student.initials || "ET"}
              </div>
              <div>
                <DialogTitle className="text-xl font-black text-[#1e1b4b] flex items-center gap-2">
                  {data?.student.fullName || "Fiche Financière & Suivi Élève"}
                  {data?.student.isactive ? (
                    <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20 text-[10px]">
                      Inscrit actif
                    </Badge>
                  ) : (
                    <Badge className="bg-slate-500/10 text-slate-600 border-none text-[10px]">
                      Inactif
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs text-[#64748b]">
                  Dossier financier, cotisations, inscriptions et suivi du cycle de séances
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-[#6d28d9]" />
            <p className="text-xs font-semibold text-[#64748b]">
              Chargement des informations complètes de l&apos;élève...
            </p>
          </div>
        ) : !data ? (
          <div className="py-12 text-center text-xs text-muted-foreground">
            Aucune donnée trouvée pour cet élève.
          </div>
        ) : (
          <div className="space-y-6 pt-2">
            {/* 1. Carte Contacts & Tuteur */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="rounded-2xl border border-[#6d28d9]/10 bg-[#f8f9fc]/60 p-4 shadow-xs">
                <div className="text-xs font-bold uppercase tracking-wider text-[#6d28d9] mb-2 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" /> Coordonnées Élève
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-2 text-[#1e1b4b]">
                    <Mail className="h-3.5 w-3.5 text-[#64748b]" />
                    <span>{data.student.email}</span>
                  </div>
                  {data.student.billing_notes && (
                    <div className="pt-1 text-[#64748b] italic">
                      Note : {data.student.billing_notes}
                    </div>
                  )}
                </div>
              </Card>

              <Card className="rounded-2xl border border-[#6d28d9]/10 bg-[#f8f9fc]/60 p-4 shadow-xs">
                <div className="text-xs font-bold uppercase tracking-wider text-[#f97316] mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" /> Contact Parent / Tuteur
                  </span>
                  {data.student.parent_phone && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyPhone(data.student.parent_phone)}
                      className="h-6 px-1.5 text-[10px] text-[#6d28d9] hover:bg-[#6d28d9]/10"
                    >
                      <Copy className="h-2.5 w-2.5 mr-1" /> Copier
                    </Button>
                  )}
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[#64748b]">Tuteur :</span>
                    <span className="font-semibold text-[#1e1b4b]">
                      {data.student.parent_name || "Non renseigné"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#64748b]">Téléphone :</span>
                    <span className="font-mono font-bold text-[#1e1b4b]">
                      {data.student.parent_phone || "Non renseigné"}
                    </span>
                  </div>

                  <div className="pt-1">
                    <Button
                      onClick={openWhatsApp}
                      className="w-full h-8 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 shadow-sm"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      Relance WhatsApp en 1 clic
                    </Button>
                  </div>
                </div>
              </Card>
            </div>

            {/* 2. Synthèse Financière (KPIs) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card className="rounded-2xl border border-[#6d28d9]/10 p-4 bg-white shadow-xs">
                <div className="text-[11px] font-bold uppercase text-[#64748b] tracking-wider">
                  Total Facturé
                </div>
                <div className="text-xl font-black text-[#1e1b4b] mt-1">
                  {data.billingSummary.totalBilled.toLocaleString("fr-FR")} DA
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Cotisations cumulées
                </div>
              </Card>

              <Card className="rounded-2xl border border-emerald-500/20 p-4 bg-gradient-to-br from-white to-emerald-500/5 shadow-xs">
                <div className="text-[11px] font-bold uppercase text-emerald-700 tracking-wider">
                  Total Encaissé
                </div>
                <div className="text-xl font-black text-emerald-700 mt-1">
                  {data.billingSummary.totalPaid.toLocaleString("fr-FR")} DA
                </div>
                <div className="text-[10px] text-emerald-600 mt-0.5">
                  Versements validés
                </div>
              </Card>

              <Card
                className={`rounded-2xl p-4 shadow-xs ${
                  data.billingSummary.remainingBalance > 0
                    ? "border-amber-500/30 bg-gradient-to-br from-white to-amber-500/5"
                    : "border-emerald-500/30 bg-gradient-to-br from-white to-emerald-500/5"
                }`}
              >
                <div className="text-[11px] font-bold uppercase tracking-wider flex items-center justify-between">
                  <span
                    className={
                      data.billingSummary.remainingBalance > 0
                        ? "text-amber-800"
                        : "text-emerald-800"
                    }
                  >
                    Reste à Régler
                  </span>
                  {data.billingSummary.remainingBalance > 0 ? (
                    <Badge className="bg-amber-500/20 text-amber-800 border-none text-[10px]">
                      Dette
                    </Badge>
                  ) : (
                    <Badge className="bg-emerald-500/20 text-emerald-800 border-none text-[10px]">
                      À jour
                    </Badge>
                  )}
                </div>
                <div
                  className={`text-xl font-black mt-1 ${
                    data.billingSummary.remainingBalance > 0
                      ? "text-amber-700"
                      : "text-emerald-700"
                  }`}
                >
                  {data.billingSummary.remainingBalance.toLocaleString("fr-FR")} DA
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Solde actuel dû
                </div>
              </Card>
            </div>

            {/* 3. Suivi de Séances & Cycle de 4 Séances */}
            <Card className="rounded-2xl border border-[#6d28d9]/15 bg-white p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-[#6d28d9]/10 pb-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-[#6d28d9]/10 flex items-center justify-center text-[#6d28d9]">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-[#1e1b4b]">
                      Suivi du Cycle de 4 Séances
                    </h3>
                    <p className="text-[11px] text-[#64748b]">
                      Cycle d&apos;apprentissage et décompte des séances effectuées
                    </p>
                  </div>
                </div>

                <Badge
                  className={`gap-1.5 px-3 py-1 rounded-xl text-xs font-bold ${
                    data.cycleTracking.cycleCompleted
                      ? "bg-[#6d28d9] text-white"
                      : "bg-[#6d28d9]/10 text-[#6d28d9] border-[#6d28d9]/20"
                  }`}
                >
                  <Sparkles className="h-3 w-3" />
                  {data.cycleTracking.sessionsInCurrentCycle} / 4 séances
                </Badge>
              </div>

              {/* Jauge visuelle de 4 pastilles */}
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map((step) => {
                    const isDone = step <= data.cycleTracking.sessionsInCurrentCycle;
                    return (
                      <div
                        key={step}
                        className={`p-2.5 rounded-xl border text-center transition-all ${
                          isDone
                            ? "bg-[#6d28d9] text-white border-[#6d28d9] shadow-xs"
                            : "bg-[#f8f9fc] text-[#64748b] border-[#6d28d9]/10"
                        }`}
                      >
                        <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                          Séance {step}
                        </div>
                        <div className="text-xs font-black mt-0.5 flex items-center justify-center gap-1">
                          {isDone ? (
                            <>
                              <CheckCircle2 className="h-3 w-3 text-emerald-300" />
                              Fait
                            </>
                          ) : (
                            "À venir"
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {data.cycleTracking.cycleCompleted && (
                  <div className="p-3 rounded-xl bg-[#6d28d9]/10 border border-[#6d28d9]/25 text-xs text-[#6d28d9] font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4 shrink-0 text-[#6d28d9]" />
                    <span>
                      Ce cycle de 4 séances est complété. Le renouvellement de cotisation doit être enregistré pour entamer le prochain cycle.
                    </span>
                  </div>
                )}
              </div>

              {/* Présences récentes */}
              {data.attendanceStats.recentSessions.length > 0 && (
                <div className="pt-2">
                  <div className="text-xs font-bold text-[#1e1b4b] mb-2 flex items-center justify-between">
                    <span>Derniers pointages de présence :</span>
                    <span className="text-[11px] text-muted-foreground font-normal">
                      {data.attendanceStats.presentCount} présent(s) · {data.attendanceStats.absentCount} absent(s) · {data.attendanceStats.lateCount} retard(s)
                    </span>
                  </div>
                  <div className="rounded-xl border border-[#6d28d9]/10 overflow-hidden">
                    <Table>
                      <TableHeader className="bg-[#f8f9fc]">
                        <TableRow>
                          <TableHead className="text-[10px] font-bold">Date</TableHead>
                          <TableHead className="text-[10px] font-bold">Matière / Classe</TableHead>
                          <TableHead className="text-[10px] font-bold text-right">Statut</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.attendanceStats.recentSessions.slice(0, 5).map((s) => (
                          <TableRow key={s.id} className="hover:bg-[#6d28d9]/5">
                            <TableCell className="text-xs font-medium text-[#1e1b4b]">
                              {s.sessiondate} ({s.starttime})
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {s.moduleName} — {s.groupName}
                            </TableCell>
                            <TableCell className="text-right">
                              {s.status === "present" ? (
                                <Badge className="bg-emerald-500/10 text-emerald-700 border-none text-[10px]">Présent</Badge>
                              ) : s.status === "late" ? (
                                <Badge className="bg-amber-500/10 text-amber-700 border-none text-[10px]">Retard</Badge>
                              ) : s.status === "justified" ? (
                                <Badge className="bg-[#6d28d9]/10 text-[#6d28d9] border-none text-[10px]">Justifié</Badge>
                              ) : (
                                <Badge className="bg-red-500/10 text-red-700 border-none text-[10px]">Absent</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </Card>

            {/* 4. Inscriptions Actives */}
            <Card className="rounded-2xl border border-[#6d28d9]/10 bg-white p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 border-b border-[#6d28d9]/10 pb-2">
                <BookOpen className="h-4 w-4 text-[#6d28d9]" />
                <h3 className="font-bold text-sm text-[#1e1b4b]">
                  Classes & Matières Inscrites ({data.enrollments.length})
                </h3>
              </div>

              {data.enrollments.length === 0 ? (
                <div className="text-xs text-muted-foreground py-2">
                  Aucune inscription active pour le moment.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {data.enrollments.map((enr) => (
                    <div
                      key={enr.id}
                      className="p-3 rounded-xl border border-[#6d28d9]/10 bg-[#f8f9fc]/50 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-[#1e1b4b] truncate">
                            {enr.moduleName}
                          </span>
                          <Badge className="text-[10px] bg-[#6d28d9]/10 text-[#6d28d9] border-none font-semibold">
                            {enr.groupName}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-[#64748b] mt-1 flex items-center gap-1">
                          <GraduationCap className="h-3 w-3 text-[#6d28d9]" />
                          <span>Prof : {enr.professorName}</span>
                        </div>
                      </div>

                      <div className="pt-2 mt-2 border-t border-[#6d28d9]/5 flex items-center justify-between text-[11px]">
                        <span className="text-[#64748b]">Tarif séance / mensuel :</span>
                        <span className="font-black text-[#1e1b4b]">
                          {enr.monthlyPrice.toLocaleString("fr-FR")} DA
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* 5. Historique des Versements */}
            <Card className="rounded-2xl border border-[#6d28d9]/10 bg-white p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-[#6d28d9]/10 pb-2">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-[#6d28d9]" />
                  <h3 className="font-bold text-sm text-[#1e1b4b]">
                    Historique des Règlements ({data.paymentsHistory.length})
                  </h3>
                </div>
              </div>

              {data.paymentsHistory.length === 0 ? (
                <div className="text-xs text-muted-foreground py-3 text-center">
                  Aucun versement n&apos;a encore été enregistré pour cet élève.
                </div>
              ) : (
                <div className="rounded-xl border border-[#6d28d9]/10 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-[#f8f9fc]">
                      <TableRow>
                        <TableHead className="text-[10px] font-bold">Période</TableHead>
                        <TableHead className="text-[10px] font-bold">Dû</TableHead>
                        <TableHead className="text-[10px] font-bold">Versé</TableHead>
                        <TableHead className="text-[10px] font-bold">Mode</TableHead>
                        <TableHead className="text-[10px] font-bold">Statut</TableHead>
                        <TableHead className="text-[10px] font-bold text-right">Reçu</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.paymentsHistory.map((p) => (
                        <TableRow key={p.id} className="hover:bg-[#6d28d9]/5">
                          <TableCell className="text-xs font-semibold text-[#1e1b4b]">
                            {p.billing_period}
                          </TableCell>
                          <TableCell className="text-xs font-medium">
                            {p.amount_due.toLocaleString("fr-FR")} DA
                          </TableCell>
                          <TableCell className="text-xs font-black text-emerald-700">
                            {p.amount_paid.toLocaleString("fr-FR")} DA
                          </TableCell>
                          <TableCell className="text-xs capitalize text-muted-foreground">
                            {p.payment_method}
                          </TableCell>
                          <TableCell>
                            {p.status === "paid" ? (
                              <Badge className="bg-emerald-500/10 text-emerald-700 border-none text-[10px]">
                                Payé
                              </Badge>
                            ) : p.status === "partial" ? (
                              <Badge className="bg-amber-500/10 text-amber-700 border-none text-[10px]">
                                Partiel
                              </Badge>
                            ) : (
                              <Badge className="bg-red-500/10 text-red-700 border-none text-[10px]">
                                En retard
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {p.amount_paid > 0 && onReprintReceipt && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onReprintReceipt(p)}
                                className="h-7 px-2 text-xs text-[#6d28d9] hover:bg-[#6d28d9]/10 font-bold rounded-lg"
                                title="Imprimer le reçu"
                              >
                                <Receipt className="h-3 w-3 mr-1" />
                                Reçu
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>

            {/* 6. Bouton d'action proéminent */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="w-full sm:w-auto h-11 rounded-xl border-[#6d28d9]/20 font-bold text-xs text-[#64748b]"
              >
                Fermer
              </Button>
              {onQuickPay && (
                <Button
                  onClick={() => {
                    const suggested = data.billingSummary.remainingBalance > 0
                      ? data.billingSummary.remainingBalance
                      : 3000;
                    onOpenChange(false);
                    onQuickPay(data.student.id, suggested);
                  }}
                  className="w-full sm:w-auto h-11 rounded-xl bg-[#6d28d9] hover:bg-[#5b21b6] text-white font-bold text-xs gap-2 shadow-lg shadow-[#6d28d9]/25"
                >
                  <Plus className="h-4 w-4" />
                  Enregistrer un versement pour cet élève
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
