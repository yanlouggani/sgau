"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { MascotHeader } from "@/components/mascot/MascotHeader";
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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Search,
  Plus,
  Loader2,
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  RefreshCw,
  Eye,
  CreditCard,
  UserCheck,
  GraduationCap,
  Percent,
  Printer,
  Sparkles,
  Tag,
  Users,
  FileText,
  Calendar,
  Check,
  MessageCircle,
  Receipt,
  Wallet,
  ArrowDownRight,
  ArrowUpRight,
  Trash2,
  Send,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  getStudentPaymentsAction,
  getTodayCashReceiptsAction,
  recordStudentPaymentAction,
  getProfessorPaymentsAction,
  generateMonthlyProfessorPaymentsAction,
  updateProfessorPaymentStatusAction,
} from "@/lib/actions/payments";
import { calculateStudentBilling, getLocalModulePricing } from "@/lib/pricing";
import { StudentFinancialSheet } from "@/components/admin/payments/student-financial-sheet";
import { todayLocal } from "@/lib/dates";
import {
  type CashExpense,
  EXPENSE_CATEGORIES,
  getLocalExpenses,
  getExpensesForDate,
  calculateDailyCashSummary,
  addLocalExpense,
  deleteLocalExpense,
} from "@/lib/cash-register";
import type {
  StudentPayment,
  ProfessorPayment,
  PaymentStatus,
  PaymentMethod,
  AppUser,
} from "@/types/database";

function PaymentsPageContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"students" | "professors" | "cash_register">("students");

  // Période courante par défaut (format AAAA-MM)
  const currentMonthPeriod = useMemo(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${d.getFullYear()}-${m}`;
  }, []);

  const [selectedPeriod, setSelectedPeriod] = useState<string>(currentMonthPeriod);

  // Données des paiements élèves
  const [studentPayments, setStudentPayments] = useState<StudentPayment[]>([]);
  const [studentsList, setStudentsList] = useState<AppUser[]>([]);
  const [studentStatusFilter, setStudentStatusFilter] = useState<string>("all");
  const [studentSearch, setStudentSearch] = useState<string>("");
  const [loadingStudents, setLoadingStudents] = useState<boolean>(true);

  // Fiche financière & suivi élève détaillé
  const [selectedStudentForFile, setSelectedStudentForFile] = useState<string | null>(null);
  const [studentSheetOpen, setStudentSheetOpen] = useState<boolean>(false);

  // Détection du paramètre URL studentId (ex: redirection depuis la liste des élèves)
  useEffect(() => {
    const sid = searchParams.get("studentId");
    if (sid) {
      setSelectedStudentForFile(sid);
      setStudentSheetOpen(true);
    }
  }, [searchParams]);

  // Recherche dynamique d'élèves pour l'autocomplétion
  const matchingStudents = useMemo(() => {
    if (!studentSearch.trim()) return [];
    const q = studentSearch.toLowerCase().trim();
    return studentsList.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q)
    );
  }, [studentSearch, studentsList]);

  // Dialog d'enregistrement paiement élève
  const [studentDialogOpen, setStudentDialogOpen] = useState<boolean>(false);
  const [editingStudentPayment, setEditingStudentPayment] = useState<StudentPayment | null>(null);
  const [studentForm, setStudentForm] = useState<{
    student_id: string;
    billing_period: string;
    amount_due: number;
    amount_paid: number;
    due_date: string;
    payment_method: PaymentMethod;
    notes: string;
  }>({
    student_id: "",
    billing_period: currentMonthPeriod,
    amount_due: 3000,
    amount_paid: 0,
    due_date: todayLocal(),
    payment_method: "cash",
    notes: "",
  });
  const [savingStudentPayment, setSavingStudentPayment] = useState<boolean>(false);

  // Données des rémunérations enseignants
  const [professorPayments, setProfessorPayments] = useState<ProfessorPayment[]>([]);
  const [loadingProfessors, setLoadingProfessors] = useState<boolean>(true);
  const [generatingProfPayments, setGeneratingProfPayments] = useState<boolean>(false);
  const [viewingProfPayment, setViewingProfPayment] = useState<ProfessorPayment | null>(null);

  // Date du jour pour la caisse
  const todayStr = useMemo(() => todayLocal(), []);

  // État Reçu de paiement élève imprimable
  const [viewingStudentReceipt, setViewingStudentReceipt] = useState<StudentPayment | null>(null);

  // État Caisse Journalière (Z de Caisse) & Dépenses
  const [serverCashReceipts, setServerCashReceipts] = useState<StudentPayment[]>([]);
  const [todayExpenses, setTodayExpenses] = useState<CashExpense[]>([]);
  const [newExpenseDialogOpen, setNewExpenseDialogOpen] = useState<boolean>(false);
  const [newExpenseForm, setNewExpenseForm] = useState<{
    description: string;
    category: "supplies" | "photocopy" | "maintenance" | "hospitality" | "other";
    amount: number;
  }>({
    description: "",
    category: "supplies",
    amount: 500,
  });

  // Charger les dépenses locales du jour au montage
  useEffect(() => {
    setTodayExpenses(getExpensesForDate(todayStr));
  }, [todayStr]);

  // Charger les encaissements espèces serveur du jour
  const loadTodayCashReceipts = useCallback(async () => {
    const res = await getTodayCashReceiptsAction(todayStr);
    if (res.ok && res.data) {
      setServerCashReceipts(res.data);
    }
  }, [todayStr]);

  useEffect(() => {
    loadTodayCashReceipts();
  }, [loadTodayCashReceipts]);

  // Fonction de relance WhatsApp en 1 clic
  const openWhatsAppReminder = (payment: StudentPayment) => {
    const phone = (payment.parentPhone || "").replace(/[^0-9]/g, "");
    let cleanPhone = phone;
    if (cleanPhone.startsWith("0")) {
      cleanPhone = "213" + cleanPhone.slice(1);
    }
    const remaining = Math.max(0, payment.amount_due - payment.amount_paid);
    const message = `Bonjour, Centre de soutien scolaire.\nNous vous informons aimablement que la cotisation du mois de ${payment.billing_period} pour votre enfant ${payment.studentName} est arrivée à échéance.\nReste à régler : ${remaining.toLocaleString("fr-FR")} DA (Échéance : ${payment.due_date}).\nMerci de vous rapprocher du secrétariat pour régulariser le dossier.\nCordialement.`;

    if (!cleanPhone || cleanPhone.length < 9) {
      toast.info("Numéro parent non renseigné ou incomplet", {
        description: "Ouverture de WhatsApp pour choisir le destinataire manuellement.",
      });
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
      return;
    }
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, "_blank");
  };

  // État Réduction & Tarification automatique pour l'élève sélectionné
  const [enrolledModulesForStudent, setEnrolledModulesForStudent] = useState<
    Array<{ id: string; name: string; price: number }>
  >([]);
  const [isSiblingDiscount, setIsSiblingDiscount] = useState<boolean>(false);
  const [isProrataActive, setIsProrataActive] = useState<boolean>(false);
  const [prorataSessionsCount, setProrataSessionsCount] = useState<number>(4);
  const [loadingStudentPricing, setLoadingStudentPricing] = useState<boolean>(false);

  // État Période de paie enseignants personnalisée (ex: du 2 au 1er)
  const [profPeriodMode, setProfPeriodMode] = useState<"fixed_day" | "month">("fixed_day");
  const [profCutoffDay, setProfCutoffDay] = useState<number>(2);
  const [profStartDate, setProfStartDate] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}-02`;
  });
  const [profEndDate, setProfEndDate] = useState<string>(() => {
    const d = new Date();
    const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const y = nextMonth.getFullYear();
    const m = String(nextMonth.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}-01`;
  });

  const supabase = createClient();

  // Mise à jour automatique des dates de paie enseignant en fonction de la période choisie
  useEffect(() => {
    const period = selectedPeriod === "all" ? currentMonthPeriod : selectedPeriod;
    const [yStr, mStr] = period.split("-");
    const year = Number(yStr) || new Date().getFullYear();
    const month = Number(mStr) || new Date().getMonth() + 1;

    if (profPeriodMode === "fixed_day") {
      const sDate = `${year}-${String(month).padStart(2, "0")}-${String(profCutoffDay).padStart(2, "0")}`;
      const nextDate = new Date(year, month, profCutoffDay - 1);
      const eDate = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-${String(nextDate.getDate()).padStart(2, "0")}`;
      setProfStartDate(sDate);
      setProfEndDate(eDate);
    } else {
      const sDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const eDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      setProfStartDate(sDate);
      setProfEndDate(eDate);
    }
  }, [selectedPeriod, profCutoffDay, profPeriodMode, currentMonthPeriod]);

  // Chargement des matières et calcul automatique des tarifs pour l'élève sélectionné
  useEffect(() => {
    if (!studentForm.student_id) {
      setEnrolledModulesForStudent([]);
      return;
    }
    let active = true;
    setLoadingStudentPricing(true);
    void (async () => {
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("groupid, groups(id, name, moduleid, modules(id, name, monthly_price, price_per_session))")
        .eq("studentid", studentForm.student_id)
        .eq("status", "active");

      if (!active) return;

      const moduleMap = new Map<string, { id: string; name: string; price: number }>();
      if (enrollments) {
        for (const e of enrollments as Record<string, unknown>[]) {
          const grp = e.groups as Record<string, unknown> | null;
          const mod = grp?.modules as Record<string, unknown> | null;
          if (mod && mod.id) {
            const modId = String(mod.id);
            const modName = String(mod.name || "Matière");
            const localPricing = getLocalModulePricing(modId);
            const price = Number(mod.monthly_price) || localPricing?.monthly_price || 3500;
            moduleMap.set(modId, { id: modId, name: modName, price });
          }
        }
      }

      const mods = Array.from(moduleMap.values());
      setEnrolledModulesForStudent(mods);
      setLoadingStudentPricing(false);

      if (!editingStudentPayment && mods.length > 0) {
        const effectiveCount = isProrataActive ? prorataSessionsCount : 4;
        const billing = calculateStudentBilling({
          enrolledModules: mods.map((m) => ({ id: m.id, name: m.name, monthlyPrice: m.price })),
          sessionsCount: effectiveCount,
          isSibling: isSiblingDiscount,
        });
        setStudentForm((prev) => ({ ...prev, amount_due: billing.netAmount }));
      }
    })();

    return () => {
      active = false;
    };
  }, [studentForm.student_id, editingStudentPayment, supabase, isSiblingDiscount, isProrataActive, prorataSessionsCount]);

  // Chargement des paiements élèves
  const loadStudentPayments = useCallback(async () => {
    setLoadingStudents(true);
    const res = await getStudentPaymentsAction({
      billingPeriod: selectedPeriod === "all" ? undefined : selectedPeriod,
      status: studentStatusFilter === "all" ? undefined : studentStatusFilter,
      search: studentSearch,
    });
    if (res.ok && res.data) {
      setStudentPayments(res.data);
    } else {
      toast.error("Impossible de charger les paiements élèves");
    }
    setLoadingStudents(false);
  }, [selectedPeriod, studentStatusFilter, studentSearch]);

  // Chargement des élèves pour le select
  useEffect(() => {
    const fetchStudents = async () => {
      const { data } = await supabase
        .from("users")
        .select("id, firstname, lastname, email, role, isactive")
        .eq("role", "student")
        .eq("isactive", true)
        .order("firstname");
      if (data) {
        setStudentsList(
          data.map((u: Record<string, unknown>) => ({
            id: String(u.id),
            firstname: String(u.firstname || ""),
            lastname: String(u.lastname || ""),
            email: String(u.email || ""),
            role: "student",
            isactive: true,
            fullName: `${u.firstname || ""} ${u.lastname || ""}`.trim(),
            initials: `${(String(u.firstname || "")[0] || "").toUpperCase()}${(String(u.lastname || "")[0] || "").toUpperCase()}`,
          }))
        );
      }
    };
    fetchStudents();
  }, [supabase]);

  // Chargement des rémunérations enseignants
  const loadProfessorPayments = useCallback(async () => {
    setLoadingProfessors(true);
    const res = await getProfessorPaymentsAction({
      billingPeriod: selectedPeriod === "all" ? currentMonthPeriod : selectedPeriod,
    });
    if (res.ok && res.data) {
      setProfessorPayments(res.data);
    } else {
      toast.error("Impossible de charger les rémunérations");
    }
    setLoadingProfessors(false);
  }, [selectedPeriod, currentMonthPeriod]);

  useEffect(() => {
    if (activeTab === "students") {
      loadStudentPayments();
    } else {
      loadProfessorPayments();
    }
  }, [activeTab, loadStudentPayments, loadProfessorPayments]);

  // KPIs Élèves
  const studentMetrics = useMemo(() => {
    let totalDue = 0;
    let totalPaid = 0;
    let lateCount = 0;

    studentPayments.forEach((p) => {
      totalDue += p.amount_due;
      totalPaid += p.amount_paid;
      if (p.status === "late") lateCount++;
    });

    const recoveryRate = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0;
    const remaining = Math.max(0, totalDue - totalPaid);

    return { totalDue, totalPaid, remaining, recoveryRate, lateCount };
  }, [studentPayments]);

  // KPIs Enseignants
  const professorMetrics = useMemo(() => {
    let totalAmount = 0;
    let paidAmount = 0;
    let pendingCount = 0;

    professorPayments.forEach((p) => {
      totalAmount += p.total_amount;
      if (p.status === "paid") {
        paidAmount += p.total_amount;
      } else {
        pendingCount++;
      }
    });

    return { totalAmount, paidAmount, pendingCount };
  }, [professorPayments]);

  // Total encaissé en espèces aujourd'hui (exhaustif : serveur + local)
  const todayCashReceipts = useMemo(() => {
    const map = new Map<string, StudentPayment>();
    serverCashReceipts.forEach((p) => map.set(p.id, p));
    studentPayments.forEach((p) => {
      const isToday =
        (p.paid_at && p.paid_at.startsWith(todayStr)) ||
        (p.created_at && p.created_at.startsWith(todayStr));
      if (isToday && p.payment_method === "cash" && p.amount_paid > 0) {
        map.set(p.id, p);
      }
    });
    return Array.from(map.values());
  }, [serverCashReceipts, studentPayments, todayStr]);

  const { totalIn: todayCashIn, totalOut: todayCashOut, netBalance: todayCashNet } = useMemo(() => {
    return calculateDailyCashSummary(todayCashReceipts, todayExpenses);
  }, [todayCashReceipts, todayExpenses]);

  const handleAddExpense = () => {
    if (!newExpenseForm.description.trim()) {
      toast.error("Veuillez indiquer le motif de la dépense.");
      return;
    }
    const safeAmount = Number(newExpenseForm.amount) || 0;
    if (safeAmount <= 0) {
      toast.error("Le montant doit être supérieur à 0 DA.");
      return;
    }

    addLocalExpense({
      description: newExpenseForm.description.trim(),
      category: newExpenseForm.category,
      amount: safeAmount,
      date: todayStr,
    });

    setTodayExpenses(getExpensesForDate(todayStr));
    toast.success("Dépense enregistrée dans la caisse du jour");
    setNewExpenseDialogOpen(false);
    setNewExpenseForm({
      description: "",
      category: "supplies",
      amount: 500,
    });
  };

  const handleDeleteExpense = (expId: string) => {
    deleteLocalExpense(expId);
    setTodayExpenses(getExpensesForDate(todayStr));
    toast.info("Dépense retirée du journal de caisse");
  };

  // Handlers d'impression séparés sans superposition
  const handlePrintReceipt = () => {
    document.body.classList.add("print-receipt");
    window.print();
    setTimeout(() => {
      document.body.classList.remove("print-receipt");
    }, 1000);
  };

  const handlePrintPaySlip = () => {
    document.body.classList.add("print-payslip");
    window.print();
    setTimeout(() => {
      document.body.classList.remove("print-payslip");
    }, 1000);
  };

  const handlePrintZ = () => {
    document.body.classList.add("print-z");
    window.print();
    setTimeout(() => {
      document.body.classList.remove("print-z");
    }, 1000);
  };

  // Enregistrer ou modifier un paiement élève
  const handleSaveStudentPayment = async () => {
    if (!studentForm.student_id) {
      toast.error("Veuillez sélectionner un élève");
      return;
    }
    if (studentForm.amount_due <= 0) {
      toast.error("Le montant dû doit être supérieur à 0");
      return;
    }

    setSavingStudentPayment(true);
    const res = await recordStudentPaymentAction({
      id: editingStudentPayment?.id,
      student_id: studentForm.student_id,
      billing_period: studentForm.billing_period,
      amount_due: Number(studentForm.amount_due),
      amount_paid: Number(studentForm.amount_paid),
      due_date: studentForm.due_date,
      payment_method: studentForm.payment_method,
      notes: studentForm.notes,
    });

    if (res.ok) {
      toast.success(
        editingStudentPayment
          ? "Paiement mis à jour avec succès"
          : "Paiement enregistré avec succès"
      );
      setStudentDialogOpen(false);
      loadStudentPayments();
      loadTodayCashReceipts();
    } else {
      toast.error(res.error || "Erreur lors de l'enregistrement");
    }
    setSavingStudentPayment(false);
  };

  // Générer les rémunérations enseignants pour la période choisie
  const handleGenerateProfessorPayments = async () => {
    setGeneratingProfPayments(true);
    const period = selectedPeriod === "all" ? currentMonthPeriod : selectedPeriod;
    const res = await generateMonthlyProfessorPaymentsAction({
      billingPeriod: period,
      startDate: profStartDate,
      endDate: profEndDate,
    });
    if (res.ok) {
      toast.success(
        `Rémunérations actualisées (${res.count || 0} enseignant(s) calculé(s) du ${profStartDate} au ${profEndDate})`
      );
      loadProfessorPayments();
    } else {
      toast.error(res.error || "Erreur lors du calcul des rémunérations");
    }
    setGeneratingProfPayments(false);
  };

  // Mettre à jour le statut d'une rémunération
  const handleUpdateProfStatus = async (
    paymentId: string,
    newStatus: "draft" | "validated" | "paid"
  ) => {
    const res = await updateProfessorPaymentStatusAction(paymentId, newStatus);
    if (res.ok) {
      toast.success(
        newStatus === "paid"
          ? "Rémunération marquée comme payée"
          : newStatus === "validated"
          ? "Rémunération validée"
          : "Statut mis à jour"
      );
      loadProfessorPayments();
    } else {
      toast.error(res.error || "Erreur de mise à jour");
    }
  };

  // Exporter en CSV
  const handleExportCSV = () => {
    let csvContent = "";
    if (activeTab === "students") {
      csvContent = "ID,Élève,Email,Période,Montant Dû (DA),Montant Payé (DA),Statut,Mode,Date Échéance\n";
      studentPayments.forEach((p) => {
        csvContent += `"${p.id}","${p.studentName}","${p.studentEmail}","${p.billing_period}",${p.amount_due},${p.amount_paid},"${p.status}","${p.payment_method}","${p.due_date}"\n`;
      });
    } else {
      csvContent = "ID,Enseignant,Période,Type Rémunération,Taux,Montant Total (DA),Statut\n";
      professorPayments.forEach((p) => {
        csvContent += `"${p.id}","${p.professorName}","${p.billing_period}","${p.payment_type}",${p.rate_applied},${p.total_amount},"${p.status}"\n`;
      });
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `finances_${activeTab}_${selectedPeriod || "export"}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusBadge = (status: PaymentStatus) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">Payé</Badge>;
      case "partial":
        return <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30">Partiel</Badge>;
      case "late":
        return <Badge className="bg-rose-500/15 text-rose-700 border-rose-500/30">En retard</Badge>;
      case "unpaid":
      default:
        return <Badge className="bg-slate-500/15 text-slate-700 border-slate-500/30">Impayé</Badge>;
    }
  };

  const getProfStatusBadge = (status: "draft" | "validated" | "paid") => {
    switch (status) {
      case "paid":
        return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">Payé</Badge>;
      case "validated":
        return <Badge className="bg-[#6d28d9]/15 text-[#6d28d9] border-[#6d28d9]/30">Validé</Badge>;
      case "draft":
      default:
        return <Badge className="bg-slate-500/15 text-slate-700 border-slate-500/30">Brouillon</Badge>;
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <MascotHeader
        title="Gestion Financière & Suivi des Paiements"
        description="Suivi des frais de scolarité des élèves et des rémunérations des enseignants du centre de soutien scolaire (DZD)."
      />

      {/* Onglets principaux */}
      <div className="w-full">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#6d28d9]/10 pb-4">
          <div className="bg-[#6d28d9]/10 p-1 rounded-2xl inline-flex">
            <button
              onClick={() => setActiveTab("students")}
              className={`rounded-xl px-5 py-2 font-bold transition-all flex items-center gap-2 text-xs ${
                activeTab === "students"
                  ? "bg-[#6d28d9] text-white shadow-xs"
                  : "text-[#6d28d9] hover:bg-[#6d28d9]/10"
              }`}
            >
              <GraduationCap className="h-4 w-4" />
              Frais de cours Élèves
            </button>
            <button
              onClick={() => setActiveTab("professors")}
              className={`rounded-xl px-5 py-2 font-bold transition-all flex items-center gap-2 text-xs ${
                activeTab === "professors"
                  ? "bg-[#6d28d9] text-white shadow-xs"
                  : "text-[#6d28d9] hover:bg-[#6d28d9]/10"
              }`}
            >
              <UserCheck className="h-4 w-4" />
              Rémunérations Enseignants
            </button>
            <button
              onClick={() => setActiveTab("cash_register")}
              className={`rounded-xl px-5 py-2 font-bold transition-all flex items-center gap-2 text-xs ${
                activeTab === "cash_register"
                  ? "bg-[#6d28d9] text-white shadow-xs"
                  : "text-[#6d28d9] hover:bg-[#6d28d9]/10"
              }`}
            >
              <Wallet className="h-4 w-4" />
              Caisse du Jour & Z
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
                Période :
              </Label>
              <Input
                type="month"
                value={selectedPeriod === "all" ? currentMonthPeriod : selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="w-40 rounded-xl h-9 text-xs"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="rounded-xl border-[#6d28d9]/20 hover:bg-[#6d28d9]/5 flex items-center gap-1.5"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              Exporter CSV
            </Button>
          </div>
        </div>

        {/* ----------------- ONGLET ÉLÈVES ----------------- */}
        {activeTab === "students" && (
          <div className="space-y-6 mt-6">
          {/* Métriques / KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="rounded-3xl border border-[#6d28d9]/15 shadow-xs bg-gradient-to-br from-white to-[#6d28d9]/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground">
                  Total Attendu
                </CardTitle>
                <DollarSign className="h-4 w-4 text-[#6d28d9]" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-[#1e1b4b]">
                  {studentMetrics.totalDue.toLocaleString("fr-FR")} DA
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Sur la période sélectionnée
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border border-emerald-500/20 shadow-xs bg-gradient-to-br from-white to-emerald-500/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground">
                  Total Encaissé
                </CardTitle>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-emerald-700">
                  {studentMetrics.totalPaid.toLocaleString("fr-FR")} DA
                </div>
                <p className="text-xs text-emerald-600 font-medium mt-1">
                  Taux de recouvrement : {studentMetrics.recoveryRate} %
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border border-amber-500/20 shadow-xs bg-gradient-to-br from-white to-amber-500/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground">
                  Reste à Recouvrer
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-amber-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-amber-700">
                  {studentMetrics.remaining.toLocaleString("fr-FR")} DA
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  À encaisser pour solder le mois
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border border-rose-500/20 shadow-xs bg-gradient-to-br from-white to-rose-500/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground">
                  Impayés en Retard
                </CardTitle>
                <AlertCircle className="h-4 w-4 text-rose-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-rose-700">
                  {studentMetrics.lateCount} dossier(s)
                </div>
                <p className="text-xs text-rose-600 font-medium mt-1">
                  Date d&apos;échéance dépassée
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Barre d'actions et filtres */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-3xl border border-[#6d28d9]/10 shadow-xs">
            <div className="flex flex-1 items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher par nom d'élève..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  className="pl-9 rounded-xl h-10 border-[#6d28d9]/15"
                />
                {studentSearch.trim().length > 1 && matchingStudents.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 z-40 bg-white rounded-2xl border border-[#6d28d9]/20 shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
                    <div className="px-3 py-1.5 bg-[#f8f9fc] border-b border-[#6d28d9]/10 text-[10px] font-bold text-[#334155] uppercase tracking-wider">
                      Élèves correspondants ({matchingStudents.length})
                    </div>
                    {matchingStudents.slice(0, 6).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSelectedStudentForFile(s.id);
                          setStudentSheetOpen(true);
                          setStudentSearch("");
                        }}
                        className="w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-[#6d28d9]/10 transition-colors border-b border-[#6d28d9]/5 last:border-none"
                      >
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-[#6d28d9]/10 text-[#6d28d9] flex items-center justify-center font-bold text-[10px]">
                            {s.initials}
                          </div>
                          <div>
                            <div className="font-bold text-[#1e1b4b]">{s.fullName}</div>
                            <div className="text-[10px] text-muted-foreground">{s.email}</div>
                          </div>
                        </div>
                        <span className="text-[10px] text-[#6d28d9] font-bold flex items-center gap-1">
                          Voir fiche →
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Select
                value={studentStatusFilter}
                onValueChange={(val) => setStudentStatusFilter(val || "all")}
              >
                <SelectTrigger className="w-36 rounded-xl h-10 border-[#6d28d9]/15">
                  <SelectValue placeholder="Tous les statuts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  <SelectItem value="paid">Payé</SelectItem>
                  <SelectItem value="partial">Partiel</SelectItem>
                  <SelectItem value="late">En retard</SelectItem>
                  <SelectItem value="unpaid">Impayé</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={() => {
                setEditingStudentPayment(null);
                setStudentForm({
                  student_id: "",
                  billing_period: selectedPeriod === "all" ? currentMonthPeriod : selectedPeriod,
                  amount_due: 3000,
                  amount_paid: 0,
                  due_date: todayLocal(),
                  payment_method: "cash",
                  notes: "",
                });
                setStudentDialogOpen(true);
              }}
              className="bg-[#6d28d9] hover:bg-[#5b21b6] text-white rounded-xl shadow-xs font-bold gap-2"
            >
              <Plus className="h-4 w-4" />
              Enregistrer un paiement
            </Button>
          </div>

          {/* Table des paiements élèves */}
          <div className="rounded-3xl border border-[#6d28d9]/10 bg-white shadow-xs overflow-hidden">
            {loadingStudents ? (
              <div className="p-12 flex flex-col items-center justify-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-[#6d28d9]" />
                <p className="text-sm font-semibold text-muted-foreground">
                  Chargement des données financières...
                </p>
              </div>
            ) : studentPayments.length === 0 ? (
              <div className="p-10">
                <EmptyState
                  title="Aucun paiement trouvé"
                  hint="Aucun dossier de paiement ne correspond à cette période ou à ces filtres."
                />
              </div>
            ) : (
              <>
                {/* Vue Table pour écrans larges (Tablette & Desktop) */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader className="bg-[#f8f9fc]">
                      <TableRow>
                        <TableHead className="font-bold">Élève</TableHead>
                        <TableHead className="font-bold">Période</TableHead>
                        <TableHead className="font-bold">Montant Dû</TableHead>
                        <TableHead className="font-bold">Montant Versé</TableHead>
                        <TableHead className="font-bold">Reste</TableHead>
                        <TableHead className="font-bold">Échéance</TableHead>
                        <TableHead className="font-bold">Mode</TableHead>
                        <TableHead className="font-bold">Statut</TableHead>
                        <TableHead className="text-right font-bold">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {studentPayments.map((p) => {
                        const remaining = Math.max(0, p.amount_due - p.amount_paid);
                        return (
                          <TableRow key={p.id} className="hover:bg-[#6d28d9]/5 transition-colors">
                            <TableCell className="font-semibold text-[#1e1b4b]">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedStudentForFile(p.student_id);
                                  setStudentSheetOpen(true);
                                }}
                                className="text-left font-bold text-[#1e1b4b] hover:text-[#6d28d9] transition-colors flex items-center gap-1.5 group cursor-pointer"
                                title="Ouvrir la fiche financière & le suivi de séances"
                              >
                                <span>{p.studentName}</span>
                                <Eye className="h-3 w-3 text-[#6d28d9]/50 group-hover:text-[#6d28d9] transition-colors" />
                              </button>
                              <div className="text-xs font-normal text-muted-foreground">
                                {p.studentEmail}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="rounded-lg text-xs font-mono">
                                {p.billing_period}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-bold">
                              {p.amount_due.toLocaleString("fr-FR")} DA
                            </TableCell>
                            <TableCell className="font-bold text-emerald-700">
                              {p.amount_paid.toLocaleString("fr-FR")} DA
                            </TableCell>
                            <TableCell className="font-semibold text-amber-700">
                              {remaining.toLocaleString("fr-FR")} DA
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {p.due_date}
                            </TableCell>
                            <TableCell>
                              <span className="text-xs font-medium capitalize">
                                {p.payment_method === "cash"
                                  ? "Espèces"
                                  : p.payment_method === "baridimob"
                                  ? "BaridiMob"
                                  : p.payment_method === "ccp"
                                  ? "CCP"
                                  : p.payment_method === "bank_transfer"
                                  ? "Virement"
                                  : "Chèque"}
                              </span>
                            </TableCell>
                            <TableCell>{getStatusBadge(p.status)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedStudentForFile(p.student_id);
                                    setStudentSheetOpen(true);
                                  }}
                                  className="rounded-xl h-8 px-2 text-xs text-[#6d28d9] hover:bg-[#6d28d9]/10 font-bold border-[#6d28d9]/25"
                                  title="Consulter le dossier financier complet et le suivi de séances"
                                >
                                  <Eye className="h-3.5 w-3.5 mr-1" />
                                  Fiche
                                </Button>

                                {p.amount_paid > 0 && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setViewingStudentReceipt(p)}
                                    className="rounded-xl h-8 px-2 text-xs text-[#1e1b4b] hover:bg-[#6d28d9]/10 font-bold border-[#6d28d9]/20"
                                    title="Imprimer le reçu de paiement"
                                  >
                                    <Receipt className="h-3.5 w-3.5 mr-1 text-[#6d28d9]" />
                                    Reçu
                                  </Button>
                                )}

                                {p.status !== "paid" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openWhatsAppReminder(p)}
                                    className="rounded-xl h-8 px-2 text-xs text-emerald-700 hover:bg-emerald-50 font-bold border-emerald-500/30"
                                    title="Envoyer une relance WhatsApp aux parents"
                                  >
                                    <MessageCircle className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                                    WhatsApp
                                  </Button>
                                )}

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setEditingStudentPayment(p);
                                    setStudentForm({
                                      student_id: p.student_id,
                                      billing_period: p.billing_period,
                                      amount_due: p.amount_due,
                                      amount_paid: p.amount_paid,
                                      due_date: p.due_date,
                                      payment_method: p.payment_method,
                                      notes: p.notes || "",
                                    });
                                    setStudentDialogOpen(true);
                                  }}
                                  className="rounded-xl h-8 px-2.5 text-xs text-[#6d28d9] hover:bg-[#6d28d9]/10 font-bold"
                                >
                                  Modifier
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Vue Cartes empilées pour Mobiles (< 768px) */}
                <div className="md:hidden divide-y divide-[#6d28d9]/10">
                  {studentPayments.map((p) => {
                    const remaining = Math.max(0, p.amount_due - p.amount_paid);
                    return (
                      <div key={p.id} className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedStudentForFile(p.student_id);
                                setStudentSheetOpen(true);
                              }}
                              className="text-left font-black text-sm text-[#1e1b4b] hover:text-[#6d28d9] flex items-center gap-1.5"
                            >
                              {p.studentName}
                              <Eye className="h-3 w-3 text-[#6d28d9]" />
                            </button>
                            <div className="text-xs text-muted-foreground">{p.studentEmail}</div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {getStatusBadge(p.status)}
                            <Badge variant="outline" className="text-[10px] font-mono">
                              {p.billing_period}
                            </Badge>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 p-2.5 rounded-2xl bg-[#f8f9fc] text-xs">
                          <div>
                            <span className="text-[10px] text-muted-foreground block">Dû</span>
                            <span className="font-bold text-[#1e1b4b]">{p.amount_due} DA</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-emerald-700 block">Versé</span>
                            <span className="font-black text-emerald-700">{p.amount_paid} DA</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-amber-700 block">Reste</span>
                            <span className="font-black text-amber-700">{remaining} DA</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-1.5 pt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedStudentForFile(p.student_id);
                              setStudentSheetOpen(true);
                            }}
                            className="rounded-xl h-8 px-2 text-xs text-[#6d28d9] border-[#6d28d9]/25 font-bold"
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            Fiche
                          </Button>

                          {p.amount_paid > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setViewingStudentReceipt(p)}
                              className="rounded-xl h-8 px-2 text-xs border-[#6d28d9]/20 font-bold"
                            >
                              <Receipt className="h-3.5 w-3.5 mr-1 text-[#6d28d9]" />
                              Reçu
                            </Button>
                          )}

                          {p.status !== "paid" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openWhatsAppReminder(p)}
                              className="rounded-xl h-8 px-2 text-xs text-emerald-700 border-emerald-500/30 font-bold"
                            >
                              <MessageCircle className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                              WhatsApp
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingStudentPayment(p);
                              setStudentForm({
                                student_id: p.student_id,
                                billing_period: p.billing_period,
                                amount_due: p.amount_due,
                                amount_paid: p.amount_paid,
                                due_date: p.due_date,
                                payment_method: p.payment_method,
                                notes: p.notes || "",
                              });
                              setStudentDialogOpen(true);
                            }}
                            className="rounded-xl h-8 px-2.5 text-xs text-[#6d28d9] font-bold"
                          >
                            Modifier
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ----------------- ONGLET ENSEIGNANTS ----------------- */}
      {activeTab === "professors" && (
        <div className="space-y-6 mt-6">
          {/* Métriques / KPIs Enseignants */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="rounded-3xl border border-[#6d28d9]/15 shadow-xs bg-gradient-to-br from-white to-[#6d28d9]/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground">
                  Masse Rémunérations
                </CardTitle>
                <DollarSign className="h-4 w-4 text-[#6d28d9]" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-[#1e1b4b]">
                  {professorMetrics.totalAmount.toLocaleString("fr-FR")} DA
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Montant total dû aux enseignants pour le mois
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border border-emerald-500/20 shadow-xs bg-gradient-to-br from-white to-emerald-500/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground">
                  Déjà Versé
                </CardTitle>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-emerald-700">
                  {professorMetrics.paidAmount.toLocaleString("fr-FR")} DA
                </div>
                <p className="text-xs text-emerald-600 font-medium mt-1">
                  Honoraires clôturés et réglés
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border border-amber-500/20 shadow-xs bg-gradient-to-br from-white to-amber-500/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground">
                  En Attente de Règlement
                </CardTitle>
                <Clock className="h-4 w-4 text-amber-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-amber-700">
                  {professorMetrics.pendingCount} enseignant(s)
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Dossiers brouillon ou validés non payés
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Action de calcul automatique avec sélection de période fixe (ex: du 2 au 1er) */}
          <div className="bg-white p-5 rounded-3xl border border-[#6d28d9]/10 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm text-[#1e1b4b]">
                    Calcul & Clôture des Rémunérations Enseignants
                  </h3>
                  <Badge className="bg-[#6d28d9]/10 text-[#6d28d9] border-none text-[10px] font-bold">
                    Période personnalisable
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Décompte des heures enseignées et des pourcentages d&apos;encaissement selon la période définie.
                </p>
              </div>

              <Button
                onClick={handleGenerateProfessorPayments}
                disabled={generatingProfPayments}
                className="bg-[#6d28d9] hover:bg-[#5b21b6] text-white rounded-xl shadow-xs font-bold gap-2 shrink-0"
              >
                {generatingProfPayments ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Calculer la période ({profStartDate} au {profEndDate})
              </Button>
            </div>

            {/* Sélecteur de méthode de période */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-[#6d28d9]/10">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-muted-foreground">Type de calcul</Label>
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={profPeriodMode === "fixed_day" ? "default" : "outline"}
                    onClick={() => setProfPeriodMode("fixed_day")}
                    className={`rounded-xl h-8 text-xs font-bold ${
                      profPeriodMode === "fixed_day"
                        ? "bg-[#6d28d9] text-white"
                        : "border-[#6d28d9]/20 text-[#6d28d9]"
                    }`}
                  >
                    Période fixe (du 2 au 1er)
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={profPeriodMode === "month" ? "default" : "outline"}
                    onClick={() => setProfPeriodMode("month")}
                    className={`rounded-xl h-8 text-xs font-bold ${
                      profPeriodMode === "month"
                        ? "bg-[#6d28d9] text-white"
                        : "border-[#6d28d9]/20 text-[#6d28d9]"
                    }`}
                  >
                    Mois civil
                  </Button>
                </div>
              </div>

              {profPeriodMode === "fixed_day" ? (
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-muted-foreground">
                    Jour de début de période (Cutoff)
                  </Label>
                  <Select
                    value={String(profCutoffDay)}
                    onValueChange={(val) => setProfCutoffDay(Number(val) || 2)}
                  >
                    <SelectTrigger className="rounded-xl h-9 border-[#6d28d9]/15 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Chaque 1er du mois (01 au 31)</SelectItem>
                      <SelectItem value="2">Chaque 2 du mois (02 au 01 suivant)</SelectItem>
                      <SelectItem value="5">Chaque 5 du mois (05 au 04 suivant)</SelectItem>
                      <SelectItem value="10">Chaque 10 du mois (10 au 09 suivant)</SelectItem>
                      <SelectItem value="15">Chaque 15 du mois (15 au 14 suivant)</SelectItem>
                      <SelectItem value="25">Chaque 25 du mois (25 au 24 suivant)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-muted-foreground">Mois civil sélectionné</Label>
                  <Input
                    type="month"
                    value={selectedPeriod === "all" ? currentMonthPeriod : selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value)}
                    className="rounded-xl h-9 border-[#6d28d9]/15 text-xs"
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs font-bold text-muted-foreground">Intervalle exact appliqué</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={profStartDate}
                    onChange={(e) => setProfStartDate(e.target.value)}
                    className="rounded-xl h-9 border-[#6d28d9]/15 text-xs font-semibold"
                    title="Date de début"
                  />
                  <span className="text-xs text-muted-foreground">au</span>
                  <Input
                    type="date"
                    value={profEndDate}
                    onChange={(e) => setProfEndDate(e.target.value)}
                    className="rounded-xl h-9 border-[#6d28d9]/15 text-xs font-semibold"
                    title="Date de fin"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Table des rémunérations enseignants */}
          <div className="rounded-3xl border border-[#6d28d9]/10 bg-white shadow-xs overflow-hidden">
            {loadingProfessors ? (
              <div className="p-12 flex flex-col items-center justify-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-[#6d28d9]" />
                <p className="text-sm font-semibold text-muted-foreground">
                  Chargement des rémunérations enseignants...
                </p>
              </div>
            ) : professorPayments.length === 0 ? (
              <div className="p-10">
                <EmptyState
                  title="Aucune rémunération générée"
                  hint="Cliquez sur 'Calculer les rémunérations du mois' pour décompter les heures et pourcentages des enseignants."
                />
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-[#f8f9fc]">
                  <TableRow>
                    <TableHead className="font-bold">Enseignant</TableHead>
                    <TableHead className="font-bold">Mode de Rémunération</TableHead>
                    <TableHead className="font-bold">Taux Appliqué</TableHead>
                    <TableHead className="font-bold">Volume / Assiette</TableHead>
                    <TableHead className="font-bold">Montant Total</TableHead>
                    <TableHead className="font-bold">Statut</TableHead>
                    <TableHead className="text-right font-bold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {professorPayments.map((p) => {
                    const isHourly = p.payment_type === "hourly";
                    const volumeText = isHourly
                      ? `${p.base_calculation.totalHours || 0} h de cours`
                      : `${(p.base_calculation.totalCollected || 0).toLocaleString("fr-FR")} DA encaissés`;

                    return (
                      <TableRow key={p.id} className="hover:bg-[#6d28d9]/5 transition-colors">
                        <TableCell className="font-semibold text-[#1e1b4b]">
                          {p.professorName}
                        </TableCell>
                        <TableCell>
                          {isHourly ? (
                            <Badge className="bg-[#6d28d9]/10 text-[#6d28d9] border-[#6d28d9]/25 gap-1">
                              <Clock className="h-3 w-3" /> Taux horaire
                            </Badge>
                          ) : (
                            <Badge className="bg-purple-500/15 text-purple-700 border-purple-500/30 gap-1">
                              <Percent className="h-3 w-3" /> Pourcentage
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-medium text-xs">
                          {isHourly
                            ? `${p.rate_applied.toLocaleString("fr-FR")} DA / heure`
                            : `${p.rate_applied} %`}
                        </TableCell>
                        <TableCell className="text-xs font-semibold text-muted-foreground">
                          {volumeText}
                        </TableCell>
                        <TableCell className="font-black text-base text-[#6d28d9]">
                          {p.total_amount.toLocaleString("fr-FR")} DA
                        </TableCell>
                        <TableCell>{getProfStatusBadge(p.status)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setViewingProfPayment(p)}
                              className="rounded-lg h-8 px-2 text-xs font-bold text-[#6d28d9] hover:bg-[#6d28d9]/10"
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" />
                              Détail
                            </Button>
                            {p.status === "draft" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleUpdateProfStatus(p.id, "validated")}
                                className="rounded-lg h-8 px-2 text-xs font-bold border-[#6d28d9]/30 text-[#6d28d9] hover:bg-[#6d28d9]/10"
                              >
                                Valider
                              </Button>
                            )}
                            {p.status !== "paid" && (
                              <Button
                                size="sm"
                                onClick={() => handleUpdateProfStatus(p.id, "paid")}
                                className="rounded-lg h-8 px-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                              >
                                Payer
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      )}

      {/* ----------------- ONGLET CAISSE DU JOUR & Z DE CAISSE ----------------- */}
      {activeTab === "cash_register" && (
        <div className="space-y-6 mt-6">
          {/* Header & Actions Caisse */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-3xl bg-white border border-[#6d28d9]/15 shadow-xs">
            <div>
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-[#6d28d9]" />
                <h3 className="text-base font-black text-[#1e1b4b]">
                  Journal de Caisse & Émargement Espèces
                </h3>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Date : <span className="font-semibold text-slate-800">{todayStr}</span> • Suivi temps réel des flux réels de caisse.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrintZ}
                className="rounded-xl border-[#6d28d9]/25 text-[#6d28d9] hover:bg-[#6d28d9]/10 font-bold text-xs gap-1.5"
              >
                <Printer className="h-4 w-4" />
                Imprimer le Z de Caisse
              </Button>
              <Button
                size="sm"
                onClick={() => setNewExpenseDialogOpen(true)}
                className="rounded-xl bg-[#6d28d9] hover:bg-[#5b21b6] text-white font-bold text-xs gap-1.5 shadow-xs"
              >
                <Plus className="h-4 w-4" />
                Nouvelle Dépense Espèces
              </Button>
            </div>
          </div>

          {/* KPIs Caisse Journalière */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-white to-emerald-50/40 shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Entrées Espèces (Élèves)
                </CardTitle>
                <div className="h-8 w-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <ArrowDownRight className="h-4 w-4 text-emerald-700" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-emerald-700">
                  {todayCashIn.toLocaleString("fr-FR")} DA
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {todayCashReceipts.length} encaissement(s) aujourd&apos;hui
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border border-rose-500/20 bg-gradient-to-br from-white to-rose-50/40 shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Dépenses de Caisse (Sorties)
                </CardTitle>
                <div className="h-8 w-8 rounded-xl bg-rose-100 flex items-center justify-center">
                  <ArrowUpRight className="h-4 w-4 text-rose-700" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-rose-700">
                  {todayCashOut.toLocaleString("fr-FR")} DA
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {todayExpenses.length} sortie(s) de caisse enregistrée(s)
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border border-[#6d28d9]/25 bg-gradient-to-br from-white to-[#6d28d9]/5 shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Solde Théorique en Coffre / Tiroir
                </CardTitle>
                <div className="h-8 w-8 rounded-xl bg-[#6d28d9]/10 flex items-center justify-center">
                  <Wallet className="h-4 w-4 text-[#6d28d9]" />
                </div>
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl font-black ${
                    todayCashNet >= 0 ? "text-[#6d28d9]" : "text-rose-600"
                  }`}
                >
                  {todayCashNet.toLocaleString("fr-FR")} DA
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Espèces nettes disponibles en fin de journée
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Deux colonnes : Encaissements vs Dépenses */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Colonne 1 : Encaissements du jour */}
            <div className="rounded-3xl bg-white border border-emerald-500/20 p-5 shadow-xs flex flex-col">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <ArrowDownRight className="h-4 w-4 text-emerald-700" />
                  </div>
                  <h4 className="font-bold text-slate-800 text-sm">
                    Encaissements Espèces du Jour
                  </h4>
                </div>
                <Badge className="bg-emerald-100 text-emerald-800 border-none font-bold text-xs">
                  {todayCashIn.toLocaleString("fr-FR")} DA
                </Badge>
              </div>

              {todayCashReceipts.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  Aucun encaissement en espèces enregistré aujourd&apos;hui.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs font-bold">Élève</TableHead>
                        <TableHead className="text-xs font-bold">Mois</TableHead>
                        <TableHead className="text-xs font-bold text-right">Montant</TableHead>
                        <TableHead className="text-xs font-bold text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {todayCashReceipts.map((rcpt) => (
                        <TableRow key={rcpt.id} className="hover:bg-[#6d28d9]/5 transition-colors">
                          <TableCell className="font-semibold text-slate-800 text-xs">
                            {rcpt.studentName}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {rcpt.billing_period}
                          </TableCell>
                          <TableCell className="text-right font-black text-emerald-700 text-xs">
                            +{rcpt.amount_paid.toLocaleString("fr-FR")} DA
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setViewingStudentReceipt(rcpt)}
                              className="h-7 px-2 text-xs text-[#6d28d9] hover:bg-[#6d28d9]/10 rounded-lg font-bold"
                            >
                              <Receipt className="h-3.5 w-3.5 mr-1" />
                              Reçu
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Colonne 2 : Dépenses de caisse du jour */}
            <div className="rounded-3xl bg-white border border-rose-500/20 p-5 shadow-xs flex flex-col">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-rose-100 flex items-center justify-center">
                    <ArrowUpRight className="h-4 w-4 text-rose-700" />
                  </div>
                  <h4 className="font-bold text-slate-800 text-sm">
                    Journal des Dépenses Sortantes
                  </h4>
                </div>
                <Badge className="bg-rose-100 text-rose-800 border-none font-bold text-xs">
                  {todayCashOut.toLocaleString("fr-FR")} DA
                </Badge>
              </div>

              {todayExpenses.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  Aucune dépense de caisse pour aujourd&apos;hui.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs font-bold">Motif</TableHead>
                        <TableHead className="text-xs font-bold">Catégorie</TableHead>
                        <TableHead className="text-xs font-bold text-right">Montant</TableHead>
                        <TableHead className="text-xs font-bold text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {todayExpenses.map((exp) => (
                        <TableRow key={exp.id} className="hover:bg-[#6d28d9]/5 transition-colors">
                          <TableCell className="font-semibold text-slate-800 text-xs">
                            {exp.description}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {(EXPENSE_CATEGORIES as Record<string, string>)[exp.category] || exp.category}
                          </TableCell>
                          <TableCell className="text-right font-black text-rose-700 text-xs">
                            -{exp.amount.toLocaleString("fr-FR")} DA
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteExpense(exp.id)}
                              className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg"
                              title="Supprimer la dépense"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </div>

      {/* ----------------- DIALOG ENREGISTREMENT PAIEMENT ÉLÈVE ----------------- */}
      <Dialog open={studentDialogOpen} onOpenChange={setStudentDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-[#1e1b4b]">
              {editingStudentPayment ? "Modifier le paiement élève" : "Enregistrer un paiement élève"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Enregistrez le règlement total ou partiel (acompte) des frais de cours de soutien.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {/* Élève */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Élève *</Label>
              <Select
                value={studentForm.student_id}
                onValueChange={(val) => setStudentForm({ ...studentForm, student_id: val || "" })}
                disabled={!!editingStudentPayment}
              >
                <SelectTrigger className="rounded-xl h-10 border-[#6d28d9]/15">
                  <SelectValue placeholder="Sélectionner un élève" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {studentsList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.fullName} ({s.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Matières inscrites & Réduction Pack / Fratrie automatique */}
            {studentForm.student_id && (
              <div className="rounded-2xl p-3.5 bg-[#6d28d9]/5 border border-[#6d28d9]/15 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#1e1b4b]">
                    <Sparkles className="h-3.5 w-3.5 text-[#6d28d9]" />
                    <span>Matières suivies & Barème de Réduction</span>
                  </div>
                  {loadingStudentPricing && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#6d28d9]" />
                  )}
                </div>

                {enrolledModulesForStudent.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    Aucune matière active rattachée aux inscriptions de cet élève.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {enrolledModulesForStudent.map((m) => (
                        <Badge
                          key={m.id}
                          variant="secondary"
                          className="bg-white border border-[#6d28d9]/15 text-[11px] font-semibold py-1 px-2.5 shadow-2xs"
                        >
                          {m.name} :{" "}
                          <span className="font-bold text-[#6d28d9] ml-1">
                            {m.price.toLocaleString("fr-FR")} DA
                          </span>
                        </Badge>
                      ))}
                    </div>

                    {(() => {
                      const effectiveCount = isProrataActive ? prorataSessionsCount : 4;
                      const billing = calculateStudentBilling({
                        enrolledModules: enrolledModulesForStudent.map((m) => ({
                          id: m.id,
                          name: m.name,
                          monthlyPrice: m.price,
                        })),
                        sessionsCount: effectiveCount,
                        isSibling: isSiblingDiscount,
                      });

                      return (
                        <div className="space-y-2 pt-1 border-t border-[#6d28d9]/10 text-xs">
                          <div className="flex items-center justify-between text-muted-foreground">
                            <span>
                              Total tarif de base ({billing.itemCount} matière
                              {billing.itemCount > 1 ? "s" : ""}) :
                            </span>
                            <span className="font-semibold">
                              {billing.baseTotal.toLocaleString("fr-FR")} DA
                            </span>
                          </div>

                          {billing.packDiscountPercent > 0 && (
                            <div className="flex items-center justify-between text-emerald-700 font-medium bg-emerald-500/10 p-1.5 rounded-lg">
                              <span className="flex items-center gap-1">
                                <Tag className="h-3 w-3" />
                                Pack Multi-Matières ({billing.itemCount} cours : -
                                {billing.packDiscountPercent}%) :
                              </span>
                              <span className="font-bold">
                                -{billing.packDiscountAmount.toLocaleString("fr-FR")} DA
                              </span>
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-1">
                            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#1e1b4b]">
                              <input
                                type="checkbox"
                                checked={isSiblingDiscount}
                                onChange={(e) => setIsSiblingDiscount(e.target.checked)}
                                className="rounded text-[#6d28d9] focus:ring-[#6d28d9]"
                              />
                              <span>Réduction Fratrie (-10%)</span>
                            </label>
                            {billing.siblingDiscountAmount > 0 && (
                              <span className="text-emerald-700 font-bold">
                                -{billing.siblingDiscountAmount.toLocaleString("fr-FR")} DA
                              </span>
                            )}
                          </div>

                          {/* Option Prorata */}
                          <div className="pt-2 border-t border-[#6d28d9]/10 space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[#6d28d9]">
                                <input
                                  type="checkbox"
                                  checked={isProrataActive}
                                  onChange={(e) => {
                                    setIsProrataActive(e.target.checked);
                                    if (!e.target.checked) setProrataSessionsCount(4);
                                  }}
                                  className="rounded text-[#6d28d9] focus:ring-[#6d28d9]"
                                />
                                <span>Appliquer option Prorata (Fraction de bloc)</span>
                              </label>
                              {isProrataActive && (
                                <Badge className="bg-[#6d28d9]/10 text-[#6d28d9] border-none text-[10px] font-bold">
                                  Prorata {prorataSessionsCount}/4 séances
                                </Badge>
                              )}
                            </div>

                            {isProrataActive && (
                              <div className="flex items-center justify-between bg-white p-2 rounded-xl border border-[#6d28d9]/20">
                                <span className="text-[11px] font-semibold text-muted-foreground">
                                  Nombre de séances payées :
                                </span>
                                <Select
                                  value={String(prorataSessionsCount)}
                                  onValueChange={(val) => setProrataSessionsCount(Number(val) || 4)}
                                >
                                  <SelectTrigger className="w-44 h-8 text-xs font-bold rounded-lg border-[#6d28d9]/20">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="1">1 séance sur 4 (1/4)</SelectItem>
                                    <SelectItem value="2">2 séances sur 4 (2/4 - Demie)</SelectItem>
                                    <SelectItem value="3">3 séances sur 4 (3/4)</SelectItem>
                                    <SelectItem value="4">4 séances (Bloc complet)</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between pt-1.5 border-t border-[#6d28d9]/15 font-black text-sm">
                            <span className="text-[#1e1b4b]">Montant calculé avec remises & prorata :</span>
                            <span className="text-[#6d28d9]">
                              {billing.netAmount.toLocaleString("fr-FR")} DA
                            </span>
                          </div>

                          {studentForm.amount_due !== billing.netAmount && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setStudentForm((prev) => ({
                                  ...prev,
                                  amount_due: billing.netAmount,
                                }))
                              }
                              className="w-full h-7 rounded-xl text-[11px] font-bold border-[#6d28d9]/30 text-[#6d28d9] hover:bg-[#6d28d9]/10 mt-1"
                            >
                              Appliquer le tarif calculé ({billing.netAmount.toLocaleString("fr-FR")}{" "}
                              DA)
                            </Button>
                          )}
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {/* Période */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Mois de facturation</Label>
                <Input
                  type="month"
                  value={studentForm.billing_period}
                  onChange={(e) =>
                    setStudentForm({ ...studentForm, billing_period: e.target.value })
                  }
                  className="rounded-xl h-10 border-[#6d28d9]/15"
                />
              </div>

              {/* Date d'échéance */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Date d&apos;échéance</Label>
                <Input
                  type="date"
                  value={studentForm.due_date}
                  onChange={(e) => setStudentForm({ ...studentForm, due_date: e.target.value })}
                  className="rounded-xl h-10 border-[#6d28d9]/15"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Montant Dû */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Montant Dû (DA) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="100"
                  value={studentForm.amount_due}
                  onChange={(e) =>
                    setStudentForm({ ...studentForm, amount_due: Number(e.target.value) })
                  }
                  className="rounded-xl h-10 border-[#6d28d9]/15 font-bold"
                />
              </div>

              {/* Montant Versé */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Montant Versé (DA) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="100"
                  value={studentForm.amount_paid}
                  onChange={(e) =>
                    setStudentForm({ ...studentForm, amount_paid: Number(e.target.value) })
                  }
                  className="rounded-xl h-10 border-[#6d28d9]/15 font-bold text-emerald-700"
                />
              </div>
            </div>

            {/* Mode de paiement */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Mode de règlement</Label>
              <Select
                value={studentForm.payment_method}
                onValueChange={(val) =>
                  setStudentForm({
                    ...studentForm,
                    payment_method: (val as PaymentMethod) || "cash",
                  })
                }
              >
                <SelectTrigger className="rounded-xl h-10 border-[#6d28d9]/15">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Espèces</SelectItem>
                  <SelectItem value="transfer">Virement bancaire / postal</SelectItem>
                  <SelectItem value="check">Chèque</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Notes / Commentaire */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Commentaire / Référence</Label>
              <Input
                placeholder="Ex: Reçu #452, acompte 1re tranche..."
                value={studentForm.notes}
                onChange={(e) => setStudentForm({ ...studentForm, notes: e.target.value })}
                className="rounded-xl h-10 border-[#6d28d9]/15"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setStudentDialogOpen(false)}
              className="rounded-xl font-bold"
            >
              Annuler
            </Button>
            <Button
              onClick={handleSaveStudentPayment}
              disabled={savingStudentPayment}
              className="bg-[#6d28d9] hover:bg-[#5b21b6] text-white rounded-xl font-bold gap-2"
            >
              {savingStudentPayment && <Loader2 className="h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----------------- DIALOG DÉTAIL & FICHE DE PAIE ENSEIGNANT ----------------- */}
      <Dialog open={!!viewingProfPayment} onOpenChange={() => setViewingProfPayment(null)}>
        <DialogContent className="sm:max-w-[700px] rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
          {viewingProfPayment && (
            <div id="printable-pay-slip" className="space-y-4">
              {/* Entête Officielle Imprimable */}
              <div className="pb-3 border-b-2 border-[#6d28d9]/20">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-base font-black uppercase tracking-wider text-[#1e1b4b]">
                      Centre de Soutien Scolaire & Cours Particuliers
                    </h2>
                    <p className="text-xs text-muted-foreground font-medium">
                      Bordereau Mensuel de Rémunération & Honoraires Enseignant
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-[#6d28d9]/30 text-[#6d28d9] font-bold text-xs"
                  >
                    {viewingProfPayment.status === "paid"
                      ? "Payé"
                      : viewingProfPayment.status === "validated"
                      ? "Validé"
                      : "Brouillon"}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-3 text-xs">
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold">
                      Enseignant
                    </span>
                    <span className="font-bold text-[#1e1b4b] text-sm">
                      {viewingProfPayment.professorName}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold">
                      Période de décompte
                    </span>
                    <span className="font-bold text-[#6d28d9]">
                      {viewingProfPayment.base_calculation.periodLabel ||
                        viewingProfPayment.billing_period}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold">
                      Formule appliquée
                    </span>
                    <span className="font-bold text-[#1e1b4b]">
                      {viewingProfPayment.payment_type === "hourly"
                        ? `${viewingProfPayment.rate_applied.toLocaleString("fr-FR")} DA / heure`
                        : `${viewingProfPayment.rate_applied} % sur cotisations`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Carte résumé */}
              <div className="p-3.5 rounded-2xl bg-[#6d28d9]/5 border border-[#6d28d9]/15 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold text-muted-foreground">
                    Base de calcul constatée :
                  </div>
                  <div className="text-xs font-bold text-[#1e1b4b]">
                    {viewingProfPayment.payment_type === "hourly"
                      ? `${viewingProfPayment.base_calculation.totalHours || 0} heure(s) de cours dispensée(s)`
                      : `${(viewingProfPayment.base_calculation.totalCollected || 0).toLocaleString("fr-FR")} DA encaissés auprès des élèves`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] font-semibold text-muted-foreground">
                    Montant net à verser :
                  </div>
                  <div className="text-2xl font-black text-[#6d28d9]">
                    {viewingProfPayment.total_amount.toLocaleString("fr-FR")} DA
                  </div>
                </div>
              </div>

              {/* Détail Horaire */}
              {viewingProfPayment.payment_type === "hourly" && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Relevé des séances prises en compte (
                    {viewingProfPayment.base_calculation.totalHours || 0} h au total)
                  </h4>
                  <div className="rounded-2xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader className="bg-[#f8f9fc]">
                        <TableRow>
                          <TableHead className="text-xs">Date / Séance</TableHead>
                          <TableHead className="text-xs">Horaire</TableHead>
                          <TableHead className="text-xs">Matière / Groupe</TableHead>
                          <TableHead className="text-right text-xs">Durée</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(viewingProfPayment.base_calculation.sessions || []).map((s, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-xs font-medium">{s.date}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {s.startTime} - {s.endTime}
                            </TableCell>
                            <TableCell className="text-xs font-semibold">
                              {s.moduleName} ({s.groupName})
                            </TableCell>
                            <TableCell className="text-right text-xs font-bold text-[#6d28d9]">
                              {s.durationHours} h
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Détail Pourcentage */}
              {viewingProfPayment.payment_type === "percentage" && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Élèves cotisants sur la période (Total encaissé :{" "}
                    {(viewingProfPayment.base_calculation.totalCollected || 0).toLocaleString(
                      "fr-FR"
                    )}{" "}
                    DA)
                  </h4>
                  <div className="rounded-2xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader className="bg-[#f8f9fc]">
                        <TableRow>
                          <TableHead className="text-xs">Élève</TableHead>
                          <TableHead className="text-xs">Groupe / Classe</TableHead>
                          <TableHead className="text-right text-xs">Frais Encaissés</TableHead>
                          <TableHead className="text-right text-xs">Part Enseignant</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(viewingProfPayment.base_calculation.studentCollections || []).map(
                          (sc, idx) => {
                            const teacherShare = Math.round(
                              (sc.amountPaid * viewingProfPayment.rate_applied) / 100
                            );
                            return (
                              <TableRow key={idx}>
                                <TableCell className="text-xs font-medium">
                                  {sc.studentName}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {sc.groupName}
                                </TableCell>
                                <TableCell className="text-right text-xs font-semibold">
                                  {sc.amountPaid.toLocaleString("fr-FR")} DA
                                </TableCell>
                                <TableCell className="text-right text-xs font-bold text-[#6d28d9]">
                                  {teacherShare.toLocaleString("fr-FR")} DA
                                </TableCell>
                              </TableRow>
                            );
                          }
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Zones d'émargement & signatures (Visibles à l'impression) */}
              <div className="grid grid-cols-2 gap-6 pt-6 mt-4 border-t border-slate-200 text-xs">
                <div className="p-3 border border-slate-200 rounded-2xl min-h-[90px] bg-slate-50/50">
                  <p className="font-bold text-slate-800">Pour la Direction de l&apos;École</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Cachet & Signature autorisée</p>
                </div>
                <div className="p-3 border border-slate-200 rounded-2xl min-h-[90px] bg-slate-50/50">
                  <p className="font-bold text-slate-800">L&apos;Enseignant(e)</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Bon pour accord & Émargement
                  </p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t border-[#6d28d9]/10">
            <div className="flex items-center justify-between w-full">
              <Button
                type="button"
                variant="outline"
                onClick={handlePrintPaySlip}
                className="rounded-xl font-bold border-[#6d28d9]/30 text-[#6d28d9] hover:bg-[#6d28d9]/10 gap-2 text-xs"
              >
                <Printer className="h-4 w-4" />
                Imprimer la fiche de paie (PDF)
              </Button>
              <Button
                onClick={() => setViewingProfPayment(null)}
                className="rounded-xl font-bold bg-[#6d28d9] text-white hover:bg-[#5b21b6] text-xs"
              >
                Fermer
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----------------- DIALOG NOUVELLE DÉPENSE CAISSE ----------------- */}
      <Dialog open={newExpenseDialogOpen} onOpenChange={setNewExpenseDialogOpen}>
        <DialogContent className="sm:max-w-[420px] rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-[#1e1b4b] flex items-center gap-2">
              <ArrowUpRight className="h-5 w-5 text-rose-600" />
              Sortie de Caisse / Dépense Espèces
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Enregistrez un décaissement d&apos;espèces immédiat (fournitures, photocopies, ménage...).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Motif de la dépense *</Label>
              <Input
                placeholder="Ex: Rame de papier, cartouche d'encre..."
                value={newExpenseForm.description}
                onChange={(e) =>
                  setNewExpenseForm({ ...newExpenseForm, description: e.target.value })
                }
                className="rounded-xl h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Catégorie</Label>
              <Select
                value={newExpenseForm.category}
                onValueChange={(val) => {
                  if (val) {
                    setNewExpenseForm({
                      ...newExpenseForm,
                      category: val as "supplies" | "photocopy" | "maintenance" | "hospitality" | "other",
                    });
                  }
                }}
              >
                <SelectTrigger className="rounded-xl h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="supplies">Fournitures & Papeterie</SelectItem>
                  <SelectItem value="photocopy">Photocopies & Tirages cours</SelectItem>
                  <SelectItem value="maintenance">Maintenance & Ménage</SelectItem>
                  <SelectItem value="hospitality">Pause Café / Eau / Accueil</SelectItem>
                  <SelectItem value="other">Autre décaissement</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Montant décaissé (DA) *</Label>
              <Input
                type="number"
                min="50"
                step="50"
                value={newExpenseForm.amount || ""}
                onChange={(e) =>
                  setNewExpenseForm({ ...newExpenseForm, amount: Number(e.target.value) })
                }
                className="rounded-xl h-9 text-xs font-bold text-rose-700"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setNewExpenseDialogOpen(false)}
              className="rounded-xl font-bold text-xs"
            >
              Annuler
            </Button>
            <Button
              size="sm"
              onClick={handleAddExpense}
              className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs"
            >
              Enregistrer la dépense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----------------- DIALOG REÇU DE PAIEMENT ÉLÈVE IMPRIMABLE (1-C) ----------------- */}
      <Dialog open={!!viewingStudentReceipt} onOpenChange={(o) => !o && setViewingStudentReceipt(null)}>
        <DialogContent className="sm:max-w-[550px] rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-[#1e1b4b] flex items-center gap-2">
              <Receipt className="h-5 w-5 text-[#6d28d9]" />
              Reçu Officiel de Paiement Élève
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Format ticket / demi-A5 prêt à être remis au parent ou à l&apos;élève.
            </DialogDescription>
          </DialogHeader>

          {viewingStudentReceipt && (
            <div
              id="printable-student-receipt"
              className="p-6 rounded-2xl bg-white border border-slate-200 text-slate-800 space-y-4 my-2 text-xs"
            >
              {/* En-tête Reçu */}
              <div className="flex items-center justify-between border-b pb-4 border-slate-200">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-xl bg-[#6d28d9] flex items-center justify-center text-white font-black text-xs">
                      ITRI
                    </div>
                    <div>
                      <h4 className="font-black text-[#1e1b4b] text-sm uppercase tracking-wide">
                        ITRI Academy
                      </h4>
                      <p className="text-[10px] text-slate-500">
                        École de Langues et de Formation
                      </p>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="inline-block px-2.5 py-1 rounded-md bg-[#6d28d9]/10 text-[#6d28d9] font-black text-xs">
                    REÇU N° {viewingStudentReceipt.id.slice(0, 8).toUpperCase()}
                  </span>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Date : {viewingStudentReceipt.paid_at || todayLocal()}
                  </p>
                </div>
              </div>

              {/* Détails Élève & Période */}
              <div className="grid grid-cols-2 gap-3 py-2 bg-slate-50/80 p-3 rounded-xl border border-slate-100">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Élève :
                  </span>
                  <span className="font-bold text-slate-900 text-sm">
                    {viewingStudentReceipt.studentName}
                  </span>
                  {viewingStudentReceipt.parentName && (
                    <span className="block text-[11px] text-slate-600">
                      Parent : {viewingStudentReceipt.parentName}
                    </span>
                  )}
                  {viewingStudentReceipt.parentPhone && (
                    <span className="block text-[10px] text-slate-500">
                      Tél : {viewingStudentReceipt.parentPhone}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Mois / Période :
                  </span>
                  <span className="font-bold text-[#6d28d9] text-sm">
                    {viewingStudentReceipt.billing_period}
                  </span>
                  <span className="block text-[11px] text-slate-600 capitalize">
                    Mode : {viewingStudentReceipt.payment_method === "cash" ? "Espèces" : viewingStudentReceipt.payment_method}
                  </span>
                </div>
              </div>

              {/* Tableau Financier */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold">
                    <tr>
                      <th className="p-2.5 text-left">Désignation</th>
                      <th className="p-2.5 text-right">Montant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="p-2.5">Cotisation cours de soutien ({viewingStudentReceipt.billing_period})</td>
                      <td className="p-2.5 text-right font-medium">
                        {viewingStudentReceipt.amount_due.toLocaleString("fr-FR")} DA
                      </td>
                    </tr>
                    <tr className="bg-emerald-50/60 font-bold text-emerald-900">
                      <td className="p-2.5">Montant Réglé / Encaissé</td>
                      <td className="p-2.5 text-right text-emerald-700 font-black">
                        {viewingStudentReceipt.amount_paid.toLocaleString("fr-FR")} DA
                      </td>
                    </tr>
                    {viewingStudentReceipt.amount_due > viewingStudentReceipt.amount_paid && (
                      <tr className="bg-rose-50/60 text-rose-900 font-bold">
                        <td className="p-2.5">Reste à Régler</td>
                        <td className="p-2.5 text-right text-rose-700 font-black">
                          {(viewingStudentReceipt.amount_due - viewingStudentReceipt.amount_paid).toLocaleString("fr-FR")} DA
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Statut & Notes */}
              <div className="flex items-center justify-between text-[11px] px-1">
                <div>
                  Statut :{" "}
                  <span className="font-bold">
                    {viewingStudentReceipt.status === "paid"
                      ? "Totalement réglé"
                      : viewingStudentReceipt.status === "partial"
                      ? "Acompte partiel"
                      : "En attente"}
                  </span>
                </div>
                {viewingStudentReceipt.notes && (
                  <div className="italic text-slate-500">Note : {viewingStudentReceipt.notes}</div>
                )}
              </div>

              {/* Signature / Cachet */}
              <div className="pt-4 border-t border-dashed border-slate-300 flex justify-between items-end">
                <div className="text-[10px] text-slate-400">
                  Document officiel tenant lieu de reçu. À conserver précieusement.
                </div>
                <div className="text-center min-w-[140px] p-2 border border-slate-200 rounded-xl bg-slate-50/60">
                  <span className="text-[10px] font-bold text-slate-600 block">
                    Cachet & Signature
                  </span>
                  <div className="h-10"></div>
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
                onClick={handlePrintReceipt}
                className="rounded-xl font-bold border-[#6d28d9]/30 text-[#6d28d9] hover:bg-[#6d28d9]/10 gap-1.5 text-xs"
              >
                <Printer className="h-4 w-4" />
                Imprimer le reçu (Ticket / A5)
              </Button>
              <Button
                size="sm"
                onClick={() => setViewingStudentReceipt(null)}
                className="rounded-xl font-bold bg-[#6d28d9] text-white hover:bg-[#5b21b6] text-xs"
              >
                Fermer
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----------------- VUE IMPRIMABLE DU Z DE CAISSE (Cachée à l'écran, visible au print) ----------------- */}
      <div id="printable-cash-z" className="hidden">
        <div className="border-b-2 border-slate-900 pb-4 mb-4">
          <h2 className="text-xl font-black uppercase">SGAU École de Soutien — Clôture Z de Caisse</h2>
          <p className="text-xs text-slate-600">
            Date de clôture : {todayStr} | Heure d&apos;édition : {new Date().toLocaleTimeString("fr-FR")}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6 border p-4 rounded-lg">
          <div>
            <div className="text-xs font-bold text-slate-500">Total Encaissé Espèces</div>
            <div className="text-lg font-black text-emerald-700">+{todayCashIn.toLocaleString("fr-FR")} DA</div>
            <div className="text-[10px] text-slate-500">{todayCashReceipts.length} encaissement(s)</div>
          </div>
          <div>
            <div className="text-xs font-bold text-slate-500">Total Dépenses Espèces</div>
            <div className="text-lg font-black text-rose-700">-{todayCashOut.toLocaleString("fr-FR")} DA</div>
            <div className="text-[10px] text-slate-500">{todayExpenses.length} décaissement(s)</div>
          </div>
          <div>
            <div className="text-xs font-bold text-slate-500">Solde Net Final en Coffre</div>
            <div className="text-lg font-black text-slate-900">{todayCashNet.toLocaleString("fr-FR")} DA</div>
          </div>
        </div>

        <h3 className="font-bold text-sm mb-2 border-b pb-1">Détail des Encaissements Espèces (Élèves)</h3>
        {todayCashReceipts.length === 0 ? (
          <p className="text-xs text-slate-500 italic mb-4">Aucun versement espèces enregistré pour cette journée.</p>
        ) : (
          <table className="w-full text-xs border mb-6">
            <thead>
              <tr className="bg-slate-100 text-left">
                <th className="p-2 border">Élève</th>
                <th className="p-2 border">Mois</th>
                <th className="p-2 border">Heure / Date</th>
                <th className="p-2 border text-right">Montant Encaissé</th>
              </tr>
            </thead>
            <tbody>
              {todayCashReceipts.map((rcpt) => (
                <tr key={rcpt.id}>
                  <td className="p-2 border font-medium">{rcpt.studentName}</td>
                  <td className="p-2 border">{rcpt.billing_period}</td>
                  <td className="p-2 border">{(rcpt.paid_at || rcpt.created_at || "").split("T")[1]?.slice(0, 5) || "—"}</td>
                  <td className="p-2 border text-right font-bold text-emerald-700">+{rcpt.amount_paid.toLocaleString("fr-FR")} DA</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h3 className="font-bold text-sm mb-2 border-b pb-1">Détail des Décaissements / Dépenses</h3>
        <table className="w-full text-xs border mb-6">
          <thead>
            <tr className="bg-slate-100 text-left">
              <th className="p-2 border">Heure</th>
              <th className="p-2 border">Motif</th>
              <th className="p-2 border">Catégorie</th>
              <th className="p-2 border text-right">Montant</th>
            </tr>
          </thead>
          <tbody>
            {todayExpenses.map((exp) => (
              <tr key={exp.id}>
                <td className="p-2 border">{(exp.date || exp.created_at || "").split("T")[1]?.slice(0, 5) || "—"}</td>
                <td className="p-2 border font-medium">{exp.description}</td>
                <td className="p-2 border">{EXPENSE_CATEGORIES[exp.category as keyof typeof EXPENSE_CATEGORIES] || exp.category}</td>
                <td className="p-2 border text-right font-bold">-{exp.amount.toLocaleString("fr-FR")} DA</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="grid grid-cols-2 gap-8 pt-8 mt-6 border-t text-xs">
          <div className="p-4 border rounded-lg min-h-[90px]">
            <p className="font-bold">Visa Secrétaire / Caissier(ère)</p>
            <p className="text-[10px] text-slate-500">Signature</p>
          </div>
          <div className="p-4 border rounded-lg min-h-[90px]">
            <p className="font-bold">Contrôle Direction</p>
            <p className="text-[10px] text-slate-500">Visa & Vérification physique de coffre</p>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: auto;
            margin: 10mm;
          }
          body {
            background: #ffffff !important;
            color: #0f172a !important;
          }
          body * {
            visibility: hidden !important;
          }

          /* Mode Reçu Étudiant */
          body.print-receipt #printable-student-receipt,
          body.print-receipt #printable-student-receipt * {
            visibility: visible !important;
          }
          body.print-receipt #printable-student-receipt {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 12px !important;
            border: 1px solid #cbd5e1 !important;
          }

          /* Mode Bordereau Rémunération Enseignant */
          body.print-payslip #printable-pay-slip,
          body.print-payslip #printable-pay-slip * {
            visibility: visible !important;
          }
          body.print-payslip #printable-pay-slip {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 16px !important;
          }

          /* Mode Clôture Z de Caisse */
          body.print-z #printable-cash-z,
          body.print-z #printable-cash-z * {
            visibility: visible !important;
          }
          body.print-z #printable-cash-z {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 16px !important;
          }

          /* Reset Radix Modal Portal overlays during print */
          div[data-radix-portal] {
            position: static !important;
          }
          div[data-radix-portal] > div {
            position: static !important;
            transform: none !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            background: transparent !important;
            max-width: 100% !important;
            width: 100% !important;
          }
        }
      `}</style>
      <StudentFinancialSheet
        studentId={selectedStudentForFile}
        open={studentSheetOpen}
        onOpenChange={setStudentSheetOpen}
        onQuickPay={(studentId, defaultAmount) => {
          setEditingStudentPayment(null);
          setStudentForm({
            student_id: studentId,
            billing_period: selectedPeriod === "all" ? currentMonthPeriod : selectedPeriod,
            amount_due: defaultAmount,
            amount_paid: 0,
            due_date: todayLocal(),
            payment_method: "cash",
            notes: "",
          });
          setStudentDialogOpen(true);
        }}
        onReprintReceipt={(payment) => {
          setViewingStudentReceipt(payment);
        }}
      />
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#6d28d9]" />
          <p className="text-sm font-bold text-[#334155]">
            Chargement du module financier...
          </p>
        </div>
      }
    >
      <PaymentsPageContent />
    </Suspense>
  );
}
