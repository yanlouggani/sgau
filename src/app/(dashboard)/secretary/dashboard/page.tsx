"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import { MascotHeader } from "@/components/mascot/MascotHeader";
import { EmptyState } from "@/components/mascot/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CalendarDays,
  Clock,
  MapPin,
  Users,
  PlayCircle,
  Square,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  GraduationCap,
  CalendarCheck,
  CreditCard,
  Building2,
  UserCheck,
  QrCode,
  MessageCircle,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { getWeekStart, projectWeek } from "@/lib/session-masters";
import { uuid } from "@/lib/uuid";
import { todayLocal } from "@/lib/dates";
import { verifyQRToken, isQRTokenFormat } from "@/lib/qr-token";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import Link from "next/link";

type CombinedSession = {
  id: string; // ID de session ou occurrence
  sessionId?: string; // ID réel dans la table sessions si instanciée
  occurrenceDate: string;
  startTime: string;
  endTime: string;
  moduleName: string;
  groupName: string;
  groupId: string;
  roomName: string;
  roomId: string;
  professorName: string;
  professorId?: string;
  status: "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  presentCount: number;
  absentCount: number;
  lateCount: number;
  totalStudents: number;
};

export default function SecretaryDashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [selectedDate, setSelectedDate] = useState<string>(() => todayLocal());
  const [sessions, setSessions] = useState<CombinedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  // Alertes impayés
  const [latePaymentsCount, setLatePaymentsCount] = useState<number>(0);
  const [lateStudents, setLateStudents] = useState<{ id: string; name: string; amountDue: number }[]>([]);

  // État Scanner Rapide Check-in (1-A)
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanQuery, setScanQuery] = useState("");
  const [checkingIn, setCheckingIn] = useState(false);
  const [candidateStudents, setCandidateStudents] = useState<
    Array<{
      id: string;
      firstname?: string | null;
      lastname?: string | null;
      email?: string | null;
      parent_name?: string | null;
      parent_phone?: string | null;
    }>
  >([]);
  const [lastScanResult, setLastScanResult] = useState<{
    success: boolean;
    studentName: string;
    sessionTitle: string;
    hasLatePayment: boolean;
    amountDue?: number;
    parentName?: string;
    parentPhone?: string;
    message: string;
  } | null>(null);

  // Chargement des données de la journée
  const loadDaySessions = useCallback(async () => {
    setLoading(true);
    try {
      const weekStart = getWeekStart(new Date(selectedDate + "T00:00:00"));

      // 1. Projections de la semaine
      const [projRes, dbSessionsRes, latePayRes] = await Promise.all([
        projectWeek(supabase, weekStart, null),
        supabase
          .from("sessions")
          .select("*, modules(name), groups(name), rooms(name), users!sessions_professorid_fkey(firstname, lastname)")
          .eq("sessiondate", selectedDate),
        supabase
          .from("student_payments")
          .select("student_id, amount_due, amount_paid, users!student_payments_student_id_fkey(firstname, lastname)")
          .in("status", ["late", "unpaid"]),
      ]);

      // Calcul des impayés
      if (latePayRes.data) {
        const uniqueStudents = new Map<string, { id: string; name: string; amountDue: number }>();
        latePayRes.data.forEach((lp: Record<string, unknown>) => {
          const sid = lp.student_id as string;
          const u = lp.users as Record<string, unknown> | null;
          const name = u ? `${u.firstname ?? ""} ${u.lastname ?? ""}`.trim() : "Élève";
          const remaining = ((lp.amount_due as number) || 0) - ((lp.amount_paid as number) || 0);
          if (!uniqueStudents.has(sid)) {
            uniqueStudents.set(sid, { id: sid, name, amountDue: remaining });
          } else {
            const existing = uniqueStudents.get(sid)!;
            existing.amountDue += remaining;
          }
        });
        setLatePaymentsCount(uniqueStudents.size);
        setLateStudents(Array.from(uniqueStudents.values()));
      }

      // Map des sessions existantes en base pour ce jour
      const dbMap = new Map<string, Record<string, unknown>>();
      if (dbSessionsRes.data) {
        dbSessionsRes.data.forEach((s: Record<string, unknown>) => {
          const key = `${s.groupid}-${(s.starttime as string).slice(0, 5)}`;
          dbMap.set(key, s);
        });
      }

      // Occurrences projetées pour ce jour
      const dayOccurrences = (projRes.ok ? projRes.data : []).filter(
        (o) => o.occurrenceDate === selectedDate
      );

      // Combiner
      const combined: CombinedSession[] = [];
      const handledDbIds = new Set<string>();

      dayOccurrences.forEach((occ) => {
        const key = `${occ.groupId}-${occ.startTime.slice(0, 5)}`;
        const dbSess = dbMap.get(key);

        if (dbSess) {
          handledDbIds.add(dbSess.id as string);
          combined.push({
            id: dbSess.id as string,
            sessionId: dbSess.id as string,
            occurrenceDate: selectedDate,
            startTime: (dbSess.starttime as string).slice(0, 5),
            endTime: (dbSess.endtime as string).slice(0, 5),
            moduleName: ((dbSess.modules as Record<string, unknown>)?.name as string) || occ.moduleName,
            groupName: ((dbSess.groups as Record<string, unknown>)?.name as string) || occ.groupName,
            groupId: occ.groupId,
            roomName: ((dbSess.rooms as Record<string, unknown>)?.name as string) || occ.roomName,
            roomId: occ.roomId,
            professorName: occ.professorName || "Sans enseignant",
            professorId: occ.professorId,
            status: (dbSess.status as CombinedSession["status"]) || "PLANNED",
            presentCount: (dbSess.presentcount as number) || 0,
            absentCount: (dbSess.absentcount as number) || 0,
            lateCount: (dbSess.latecount as number) || 0,
            totalStudents: (dbSess.totalstudents as number) || 0,
          });
        } else {
          combined.push({
            id: occ.id,
            occurrenceDate: selectedDate,
            startTime: occ.startTime.slice(0, 5),
            endTime: occ.endTime.slice(0, 5),
            moduleName: occ.moduleName,
            groupName: occ.groupName,
            groupId: occ.groupId,
            roomName: occ.roomName,
            roomId: occ.roomId,
            professorName: occ.professorName || "Sans enseignant",
            professorId: occ.professorId,
            status: "PLANNED",
            presentCount: 0,
            absentCount: 0,
            lateCount: 0,
            totalStudents: 0,
          });
        }
      });

      // Ajouter d'éventuelles sessions DB créées manuellement non projetées
      if (dbSessionsRes.data) {
        dbSessionsRes.data.forEach((s: Record<string, unknown>) => {
          if (!handledDbIds.has(s.id as string)) {
            const m = s.modules as Record<string, unknown> | null;
            const g = s.groups as Record<string, unknown> | null;
            const r = s.rooms as Record<string, unknown> | null;
            const u = s.users as Record<string, unknown> | null;
            combined.push({
              id: s.id as string,
              sessionId: s.id as string,
              occurrenceDate: selectedDate,
              startTime: (s.starttime as string).slice(0, 5),
              endTime: (s.endtime as string).slice(0, 5),
              moduleName: (m?.name as string) || "Matière",
              groupName: (g?.name as string) || "Classe",
              groupId: s.groupid as string,
              roomName: (r?.name as string) || "Salle",
              roomId: s.roomid as string,
              professorName: u ? `${u.firstname ?? ""} ${u.lastname ?? ""}`.trim() : "Sans enseignant",
              professorId: s.professorid as string,
              status: (s.status as CombinedSession["status"]) || "PLANNED",
              presentCount: (s.presentcount as number) || 0,
              absentCount: (s.absentcount as number) || 0,
              lateCount: (s.latecount as number) || 0,
              totalStudents: (s.totalstudents as number) || 0,
            });
          }
        });
      }

      // Trier par heure de début
      combined.sort((a, b) => a.startTime.localeCompare(b.startTime));
      setSessions(combined);
    } catch (err) {
      toast.error("Erreur de chargement des séances du jour", {
        description: String(err),
      });
    } finally {
      setLoading(false);
    }
  }, [selectedDate, supabase]);

  useEffect(() => {
    loadDaySessions();
  }, [loadDaySessions]);

  // KPIs du jour
  const metrics = useMemo(() => {
    const total = sessions.length;
    let active = 0;
    let completed = 0;
    let totalPresent = 0;
    let totalTarget = 0;

    sessions.forEach((s) => {
      if (s.status === "ACTIVE") active++;
      if (s.status === "COMPLETED") completed++;
      totalPresent += s.presentCount;
      totalTarget += s.totalStudents;
    });

    const rate = totalTarget > 0 ? Math.round((totalPresent / totalTarget) * 100) : 0;
    return { total, active, completed, rate };
  }, [sessions]);

  // Action Démarrer & Faire l'appel
  const handleOpenAttendance = async (sessionItem: CombinedSession) => {
    setActingId(sessionItem.id);
    try {
      let targetSessionId = sessionItem.sessionId;

      if (!targetSessionId) {
        // La séance n'a pas encore été créée dans la table `sessions` : l'instancier
        const { count: enrollCount } = await supabase
          .from("enrollments")
          .select("id", { count: "exact", head: true })
          .eq("groupid", sessionItem.groupId)
          .eq("status", "active");

        const newId = uuid();
        const { data: newSession, error: createErr } = await supabase
          .from("sessions")
          .insert({
            id: newId,
            groupid: sessionItem.groupId,
            professorid: sessionItem.professorId || null,
            roomid: sessionItem.roomId,
            sessiondate: selectedDate,
            starttime: sessionItem.startTime,
            endtime: sessionItem.endTime,
            status: "ACTIVE",
            totalstudents: enrollCount ?? 0,
          })
          .select("id")
          .single();

        if (createErr) throw createErr;
        targetSessionId = newSession.id;

        // Pré-peupler les présences
        await supabase.rpc("populate_session_attendance", { p_session_id: targetSessionId });
      }

      router.push(`/secretary/sessions/${targetSessionId}`);
    } catch (err) {
      toast.error("Impossible d'ouvrir la séance", { description: String(err) });
    } finally {
      setActingId(null);
    }
  };

  // Exécution du pointage pour un élève identifié
  const processStudentCheckIn = async (student: {
    id: string;
    firstname?: string | null;
    lastname?: string | null;
    email?: string | null;
    parent_name?: string | null;
    parent_phone?: string | null;
  }) => {
    setCheckingIn(true);
    setCandidateStudents([]);
    try {
      const studentName = `${student.firstname || ""} ${student.lastname || ""}`.trim() || student.email || "Élève";

      // Vérifier les inscriptions de l'élève
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("groupid")
        .eq("studentid", student.id)
        .eq("status", "active");

      const enrolledGroupIds = new Set((enrollments || []).map((e: { groupid: string }) => e.groupid));
      const matchingSession = sessions.find((s) => enrolledGroupIds.has(s.groupId));

      let sessionTitle = "Aucun cours prévu aujourd'hui au planning";
      if (matchingSession) {
        sessionTitle = `${matchingSession.moduleName} (${matchingSession.groupName}) • ${matchingSession.startTime}`;
        let targetSessionId = matchingSession.sessionId;

        // Instancier la séance si ce n'est pas encore fait
        if (!targetSessionId) {
          const { count: enrollCount } = await supabase
            .from("enrollments")
            .select("id", { count: "exact", head: true })
            .eq("groupid", matchingSession.groupId)
            .eq("status", "active");

          const newId = uuid();
          const { data: newSession, error: createErr } = await supabase
            .from("sessions")
            .insert({
              id: newId,
              groupid: matchingSession.groupId,
              professorid: matchingSession.professorId || null,
              roomid: matchingSession.roomId,
              sessiondate: selectedDate,
              starttime: matchingSession.startTime,
              endtime: matchingSession.endTime,
              status: "ACTIVE",
              totalstudents: enrollCount ?? 0,
            })
            .select("id")
            .single();

          if (!createErr && newSession) {
            targetSessionId = newSession.id;
            await supabase.rpc("populate_session_attendance", { p_session_id: targetSessionId });
          }
        }

        // Marquer la présence immédiate
        if (targetSessionId) {
          await supabase.from("attendance").upsert({
            sessionid: targetSessionId,
            studentid: student.id,
            status: "present",
            scanmethod: "qr",
            markedby: "secretary",
            markedat: new Date().toISOString(),
          });
        }
      }

      // Vérifier la situation financière
      const { data: latePayments } = await supabase
        .from("student_payments")
        .select("amount_due, amount_paid, billing_period")
        .eq("student_id", student.id)
        .in("status", ["late", "unpaid"]);

      let hasLatePayment = false;
      let totalRemaining = 0;
      if (latePayments && latePayments.length > 0) {
        hasLatePayment = true;
        totalRemaining = latePayments.reduce(
          (acc: number, p: { amount_due: number; amount_paid: number }) =>
            acc + (p.amount_due - p.amount_paid),
          0
        );
      }

      setLastScanResult({
        success: true,
        studentName,
        sessionTitle,
        hasLatePayment,
        amountDue: totalRemaining,
        parentName: student.parent_name ?? undefined,
        parentPhone: student.parent_phone ?? undefined,
        message: hasLatePayment
          ? `Présence validée — ATTENTION : Solde impayé de ${totalRemaining.toLocaleString("fr-FR")} DA !`
          : "Présence validée avec succès. Situation financière en règle.",
      });

      // Rafraîchir les compteurs du jour
      loadDaySessions();
    } catch (err) {
      toast.error("Erreur lors du check-in", { description: String(err) });
    } finally {
      setCheckingIn(false);
      setScanQuery("");
    }
  };

  // Traitement du bip / scan badge rapide sécurisé
  const handleQuickCheckIn = async (rawQuery: string) => {
    const q = rawQuery.trim();
    if (!q) return;

    setCheckingIn(true);
    setCandidateStudents([]);
    try {
      // 1. Détection jeton QR signé sécurisé (validité 24h)
      if (isQRTokenFormat(q)) {
        const tokenRes = verifyQRToken(q);
        if (!tokenRes.valid || !tokenRes.studentId) {
          setLastScanResult({
            success: false,
            studentName: "Badge QR sécurisé",
            sessionTitle: "",
            hasLatePayment: false,
            message: tokenRes.error || "Jeton de badge invalide ou expiré.",
          });
          return;
        }

        const { data: st } = await supabase
          .from("users")
          .select("id, firstname, lastname, email, parent_name, parent_phone")
          .eq("id", tokenRes.studentId)
          .maybeSingle();

        if (!st) {
          setLastScanResult({
            success: false,
            studentName: "Élève introuvable",
            sessionTitle: "",
            hasLatePayment: false,
            message: "L'identifiant contenu dans le QR code ne correspond à aucun élève.",
          });
          return;
        }

        await processStudentCheckIn(st);
        return;
      }

      // 2. Détection d'un UUID brut (support douchette et anciens badges)
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
      if (isUUID) {
        const { data: st } = await supabase
          .from("users")
          .select("id, firstname, lastname, email, parent_name, parent_phone")
          .eq("id", q)
          .maybeSingle();

        if (st) {
          await processStudentCheckIn(st);
          return;
        }
      }

      // 3. Recherche textuelle (Nom, Prénom, Email) avec échappement de sécurité
      const safeQ = q.replace(/[,()]/g, " ").trim();
      const { data: stList } = await supabase
        .from("users")
        .select("id, firstname, lastname, email, parent_name, parent_phone")
        .eq("role", "student")
        .or(`email.ilike.%${safeQ}%,firstname.ilike.%${safeQ}%,lastname.ilike.%${safeQ}%`)
        .limit(5);

      if (!stList || stList.length === 0) {
        setLastScanResult({
          success: false,
          studentName: q,
          sessionTitle: "",
          hasLatePayment: false,
          message: "Aucun élève trouvé avec ce nom, email ou badge.",
        });
        return;
      }

      if (stList.length === 1) {
        await processStudentCheckIn(stList[0]);
      } else {
        // Plusieurs correspondances : afficher la liste de choix pour confirmation
        setCandidateStudents(stList);
        setLastScanResult(null);
      }
    } catch (err) {
      toast.error("Erreur lors du check-in", { description: String(err) });
    } finally {
      setCheckingIn(false);
    }
  };

  const sendWhatsAppReminderFromScan = (res: {
    studentName: string;
    parentPhone?: string;
    amountDue?: number;
  }) => {
    const raw = (res.parentPhone || "").replace(/[^0-9]/g, "");
    let cleanPhone = raw;
    if (cleanPhone.startsWith("0")) cleanPhone = "213" + cleanPhone.slice(1);
    const msg = `Bonjour,\nCentre de soutien scolaire SGAU.\nVotre enfant ${res.studentName} vient d'arriver au centre.\nNous vous rappelons aimablement qu'un solde de ${res.amountDue?.toLocaleString("fr-FR")} DA reste à régulariser sur son dossier.\nMerci de vous rapprocher du secrétariat.\nBien cordialement.`;
    if (!cleanPhone) {
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
    } else {
      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");
    }
  };

  const formattedDate = useMemo(() => {
    try {
      const d = new Date(selectedDate + "T00:00:00");
      return format(d, "EEEE d MMMM yyyy", { locale: fr });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  const isToday = selectedDate === todayLocal();

  const changeDate = (days: number) => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  return (
    <div className="space-y-6 pb-12">
      <MascotHeader
        title="Secrétariat — Pointage & Séances du Jour"
        description="Gestion complète des présences des élèves, suivi du déroulement des cours et rappels d'impayés."
        pose="eureka"
        badge="Espace Secrétariat"
      />

      {/* Alerte Impayés Banner */}
      {latePaymentsCount > 0 && (
        <div className="rounded-3xl border border-rose-500/20 bg-gradient-to-r from-rose-500/10 via-amber-500/10 to-transparent p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-2xl bg-rose-500/15 text-rose-600 shrink-0">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <div className="font-extrabold text-sm text-[#1e1b4b]">
                {latePaymentsCount} élève(s) ont des impayés ou retards de paiement
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Un avertissement visuel apparaîtra lors du pointage de leur présence pour vous aider à effectuer la relance.
              </p>
            </div>
          </div>
          <Link href="/payments">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-rose-500/30 text-rose-700 hover:bg-rose-50 font-bold shrink-0 gap-1.5"
            >
              <CreditCard className="h-4 w-4" />
              Consulter les paiements
              <ExternalLink className="h-3 w-3 ml-0.5" />
            </Button>
          </Link>
        </div>
      )}

      {/* Barre de sélection de date */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-3xl border border-[#6d28d9]/10 shadow-xs">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => changeDate(-1)}
            className="h-9 w-9 rounded-xl border-[#6d28d9]/15 text-[#6d28d9]"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 px-2">
            <CalendarDays className="h-4 w-4 text-[#6d28d9]" />
            <span className="text-sm font-black capitalize text-[#1e1b4b]">
              {formattedDate}
            </span>
            {isToday && (
              <Badge className="bg-[#6d28d9]/10 text-[#6d28d9] border-none text-[10px] font-bold">
                Aujourd&apos;hui
              </Badge>
            )}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => changeDate(1)}
            className="h-9 w-9 rounded-xl border-[#6d28d9]/15 text-[#6d28d9]"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-40 rounded-xl h-9 text-xs border-[#6d28d9]/15"
          />
          {!isToday && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedDate(todayLocal())}
              className="rounded-xl h-9 text-xs font-bold text-[#6d28d9]"
            >
              Revenir à aujourd&apos;hui
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => setScannerOpen(true)}
            className="rounded-xl h-9 text-xs font-bold bg-[#6d28d9] hover:bg-[#5b21b6] text-white shadow-xs gap-1.5"
          >
            <QrCode className="h-4 w-4" />
            Scanner Rapide (Bip Badge)
          </Button>
        </div>
      </div>

      {/* KPIs du jour */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-3xl border border-[#6d28d9]/15 shadow-xs bg-gradient-to-br from-white to-[#6d28d9]/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">
              Séances au planning
            </CardTitle>
            <CalendarCheck className="h-4 w-4 text-[#6d28d9]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-[#1e1b4b]">{metrics.total}</div>
            <p className="text-xs text-muted-foreground mt-1">Sur la journée sélectionnée</p>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-[#6d28d9]/25 shadow-xs bg-gradient-to-br from-white to-[#6d28d9]/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">
              Séances en cours
            </CardTitle>
            <PlayCircle className="h-4 w-4 text-[#6d28d9]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-[#6d28d9]">{metrics.active}</div>
            <p className="text-xs text-[#6d28d9] font-medium mt-1">Appel en cours</p>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-emerald-500/20 shadow-xs bg-gradient-to-br from-white to-emerald-500/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">
              Séances clôturées
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-emerald-700">{metrics.completed}</div>
            <p className="text-xs text-muted-foreground mt-1">Pointage finalisé</p>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-purple-500/20 shadow-xs bg-gradient-to-br from-white to-purple-500/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">
              Taux d&apos;assiduité
            </CardTitle>
            <GraduationCap className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-purple-700">
              {metrics.rate} %
            </div>
            <p className="text-xs text-muted-foreground mt-1">Présents / Inscrits</p>
          </CardContent>
        </Card>
      </div>

      {/* Liste des séances du jour */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-lg text-[#1e1b4b] flex items-center gap-2">
            <Clock className="h-5 w-5 text-[#6d28d9]" />
            Planning des cours de la journée ({sessions.length})
          </h3>
          <Link href="/schedule">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-[#6d28d9]/20 text-[#6d28d9] font-bold text-xs"
            >
              Voir la grille complète
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3 bg-white rounded-3xl border border-[#6d28d9]/10">
            <Loader2 className="h-8 w-8 animate-spin text-[#6d28d9]" />
            <p className="text-xs font-semibold text-muted-foreground">
              Chargement des séances...
            </p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-12 bg-white rounded-3xl border border-[#6d28d9]/10">
            <EmptyState
              title="Aucune séance programmée"
              hint="Aucun cours de soutien n'est prévu pour cette date."
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessions.map((sess) => {
              const isOngoing = sess.status === "ACTIVE";
              const isDone = sess.status === "COMPLETED";

              return (
                <Card
                  key={sess.id}
                  className={`rounded-3xl border transition-all shadow-xs overflow-hidden ${
                    isOngoing
                      ? "border-[#6d28d9]/40 bg-gradient-to-br from-purple-50/40 to-white ring-2 ring-[#6d28d9]/20"
                      : isDone
                      ? "border-emerald-500/30 bg-white"
                      : "border-[#6d28d9]/10 bg-white hover:border-[#6d28d9]/30"
                  }`}
                >
                  <CardHeader className="pb-3 border-b border-[#6d28d9]/5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono border-[#6d28d9]/20 text-[#6d28d9] mb-1"
                        >
                          <Clock className="h-2.5 w-2.5 mr-1" />
                          {sess.startTime} — {sess.endTime}
                        </Badge>
                        <CardTitle className="text-base font-black text-[#1e1b4b] truncate">
                          {sess.moduleName}
                        </CardTitle>
                        <p className="text-xs font-semibold text-[#6d28d9] mt-0.5">
                          {sess.groupName}
                        </p>
                      </div>

                      {isOngoing ? (
                        <Badge className="bg-[#6d28d9]/15 text-[#6d28d9] border-[#6d28d9]/30 animate-pulse text-[10px]">
                          En cours
                        </Badge>
                      ) : isDone ? (
                        <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 text-[10px]">
                          Terminée
                        </Badge>
                      ) : (
                        <Badge className="bg-[#6d28d9]/10 text-[#6d28d9] border-[#6d28d9]/20 text-[10px]">
                          Prévue
                        </Badge>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="pt-3 space-y-3">
                    <div className="space-y-1.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-[#6d28d9]/70 shrink-0" />
                        <span className="font-medium text-[#1e1b4b]">{sess.roomName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <UserCheck className="h-3.5 w-3.5 text-[#6d28d9]/70 shrink-0" />
                        <span className="truncate">{sess.professorName}</span>
                      </div>
                      {sess.totalStudents > 0 && (
                        <div className="flex items-center gap-2">
                          <Users className="h-3.5 w-3.5 text-[#6d28d9]/70 shrink-0" />
                          <span>
                            {sess.presentCount} présent(s) / {sess.totalStudents} élève(s)
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="pt-2">
                      <Button
                        onClick={() => handleOpenAttendance(sess)}
                        disabled={actingId === sess.id}
                        className={`w-full rounded-2xl font-bold text-xs gap-2 ${
                          isOngoing
                            ? "bg-[#6d28d9] hover:bg-[#5b21b6] text-white"
                            : isDone
                            ? "bg-[#6d28d9]/10 hover:bg-[#6d28d9]/15 text-[#1e1b4b]"
                            : "bg-[#6d28d9] hover:bg-[#5b21b6] text-white"
                        }`}
                      >
                        {actingId === sess.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : isOngoing ? (
                          <PlayCircle className="h-4 w-4" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        {isOngoing
                          ? "Reprendre l'appel"
                          : isDone
                          ? "Revoir le pointage"
                          : "Faire l'appel"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ----------------- MODAL SCANNER RAPIDE D'ENTRÉE & CHECK-IN (1-A) ----------------- */}
      <Dialog open={scannerOpen} onOpenChange={setScannerOpen}>
        <DialogContent className="sm:max-w-[520px] rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-[#1e1b4b] flex items-center gap-2">
              <QrCode className="h-5 w-5 text-[#6d28d9]" />
              Scanner Rapide d&apos;Entrée & Pointage
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Bipez le badge élève au lecteur code-barre USB / QR code ou tapez son nom.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Formulaire de saisie / réception scan */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (scanQuery.trim()) {
                  handleQuickCheckIn(scanQuery);
                }
              }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder="Bip douchette ou saisie (ID, Nom, Email)..."
                  value={scanQuery}
                  onChange={(e) => setScanQuery(e.target.value)}
                  className="pl-9 rounded-xl h-10 text-xs font-mono"
                  disabled={checkingIn}
                />
              </div>
              <Button
                type="submit"
                disabled={checkingIn || !scanQuery.trim()}
                className="rounded-xl h-10 px-4 bg-[#6d28d9] hover:bg-[#5b21b6] text-white font-bold text-xs"
              >
                {checkingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : "Pointer"}
              </Button>
            </form>

            {/* Liste de choix si recherche textuelle multiple */}
            {candidateStudents.length > 0 && (
              <div className="space-y-2 pt-2 animate-in fade-in duration-200">
                <p className="text-xs font-bold text-slate-700">
                  {candidateStudents.length} élèves trouvés. Sélectionnez le bon élève :
                </p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {candidateStudents.map((cs) => (
                    <div
                      key={cs.id}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-[#6d28d9]/15 bg-white hover:bg-[#6d28d9]/5 transition-all text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <span className="font-bold text-[#1a1a2e] block truncate">
                          {cs.firstname} {cs.lastname}
                        </span>
                        <span className="text-[10px] text-muted-foreground block font-mono truncate">
                          {cs.email}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => processStudentCheckIn(cs)}
                        disabled={checkingIn}
                        className="h-8 rounded-lg bg-[#6d28d9] hover:bg-[#5b21b6] text-white text-[11px] font-bold px-3 shrink-0"
                      >
                        {checkingIn ? <Loader2 className="h-3 w-3 animate-spin" /> : "Pointer"}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Résultat visuel instantané du scan */}
            {lastScanResult && (
              <div className="space-y-3 pt-2">
                {lastScanResult.success ? (
                  lastScanResult.hasLatePayment ? (
                    /* ALERTE ROUGE / ORANGE : IMPAYÉ DÉTECTÉ */
                    <div className="rounded-2xl border-2 border-rose-500 bg-rose-50/80 p-4 space-y-3 text-rose-950 animate-in fade-in zoom-in-95 duration-200">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-xl bg-rose-600 text-white flex items-center justify-center font-black">
                            <AlertTriangle className="h-5 w-5" />
                          </div>
                          <div>
                            <Badge className="bg-rose-600 text-white border-none font-bold text-[10px] uppercase">
                              Alerte Impayé
                            </Badge>
                            <h4 className="font-black text-sm text-rose-950 mt-0.5">
                              {lastScanResult.studentName}
                            </h4>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-rose-700 block font-bold uppercase">
                            Reste dû
                          </span>
                          <span className="text-lg font-black text-rose-700">
                            {lastScanResult.amountDue?.toLocaleString("fr-FR")} DA
                          </span>
                        </div>
                      </div>

                      <div className="text-xs bg-white/70 p-2.5 rounded-xl border border-rose-200 space-y-1">
                        <div className="font-semibold text-slate-800">
                          {lastScanResult.sessionTitle}
                        </div>
                        <p className="text-[11px] text-slate-600">
                          {lastScanResult.message}
                        </p>
                      </div>

                      <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          onClick={() => sendWhatsAppReminderFromScan(lastScanResult)}
                          className="w-full sm:flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          Relancer Parent WhatsApp
                        </Button>
                        <Link href="/payments" className="w-full sm:w-auto">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full rounded-xl border-rose-300 text-rose-800 hover:bg-rose-100 font-bold text-xs"
                          >
                            Régulariser
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ) : (
                    /* SUCCÈS VERT ÉMERAUDE : SITUATION EN RÈGLE */
                    <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50/80 p-4 space-y-2 text-emerald-950 animate-in fade-in zoom-in-95 duration-200">
                      <div className="flex items-center gap-2.5">
                        <div className="h-9 w-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black">
                          <CheckCircle2 className="h-5 w-5" />
                        </div>
                        <div>
                          <Badge className="bg-emerald-600 text-white border-none font-bold text-[10px] uppercase">
                            Accès Autorisé
                          </Badge>
                          <h4 className="font-black text-sm text-emerald-950 mt-0.5">
                            {lastScanResult.studentName}
                          </h4>
                        </div>
                      </div>

                      <div className="text-xs bg-white/80 p-2.5 rounded-xl border border-emerald-200">
                        <div className="font-bold text-emerald-900">
                          {lastScanResult.sessionTitle}
                        </div>
                        <p className="text-[11px] text-emerald-700 mt-0.5">
                          {lastScanResult.message}
                        </p>
                      </div>
                    </div>
                  )
                ) : (
                  /* ERREUR : INTROUVABLE */
                  <div className="rounded-2xl border border-slate-300 bg-slate-50 p-4 text-center space-y-1">
                    <XCircle className="h-6 w-6 text-rose-500 mx-auto" />
                    <p className="font-bold text-xs text-slate-800">
                      {lastScanResult.message}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      Query: {lastScanResult.studentName}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="text-[11px] text-muted-foreground bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center gap-2">
              <QrCode className="h-4 w-4 text-[#6d28d9] shrink-0" />
              <span>
                Astuce : Scannez le QR Code de la carte scolaire de l&apos;élève. La présence est pointée automatiquement et le statut de paiement est vérifié en direct.
              </span>
            </div>
          </div>

          <DialogFooter className="pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setScannerOpen(false);
                setLastScanResult(null);
              }}
              className="rounded-xl font-bold text-xs"
            >
              Fermer le scanner
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
