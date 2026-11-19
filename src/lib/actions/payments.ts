"use server";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth-helpers";
import { todayLocal } from "@/lib/dates";
import { revalidatePath } from "next/cache";
import type {
  StudentPayment,
  ProfessorPayment,
  PaymentStatus,
  PaymentMethod,
  PaymentType,
  ProfessorPaymentBreakdown,
  StudentFinancialFile,
} from "@/types/database";

/* ------------------------------------------------------------------
 * Helpers de calcul de statut
 * ------------------------------------------------------------------ */

function computeStatus(
  amountDue: number,
  amountPaid: number,
  dueDate: string
): PaymentStatus {
  const due = Number(amountDue) || 0;
  const paid = Number(amountPaid) || 0;

  if (paid >= due && due > 0) {
    return "paid";
  }

  const today = todayLocal();
  const isOverdue = dueDate ? today > dueDate : false;

  if (paid > 0 && paid < due) {
    return isOverdue ? "late" : "partial";
  }

  return isOverdue ? "late" : "unpaid";
}

function extractUser(
  val: unknown
): {
  firstname?: string;
  lastname?: string;
  email?: string;
  parent_name?: string;
  parent_phone?: string;
} | null {
  if (!val) return null;
  if (Array.isArray(val)) {
    return val[0]
      ? (val[0] as {
          firstname?: string;
          lastname?: string;
          email?: string;
          parent_name?: string;
          parent_phone?: string;
        })
      : null;
  }
  return val as {
    firstname?: string;
    lastname?: string;
    email?: string;
    parent_name?: string;
    parent_phone?: string;
  };
}

export async function calculatePaymentStatus(
  amountDue: number,
  amountPaid: number,
  dueDate: string
): Promise<PaymentStatus> {
  return computeStatus(amountDue, amountPaid, dueDate);
}

/* ------------------------------------------------------------------
 * Actions : Paiements Élèves
 * ------------------------------------------------------------------ */

export async function getStudentPaymentsAction(filters?: {
  billingPeriod?: string;
  status?: string;
  search?: string;
}): Promise<{ ok: boolean; data?: StudentPayment[]; error?: string }> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from("student_payments")
      .select(`
        id,
        student_id,
        billing_period,
        amount_due,
        amount_paid,
        due_date,
        paid_at,
        payment_method,
        status,
        notes,
        created_at,
        updated_at,
        users:student_id (
          id,
          firstname,
          lastname,
          email,
          parent_name,
          parent_phone
        )
      `)
      .order("created_at", { ascending: false });

    if (filters?.billingPeriod && filters.billingPeriod !== "all") {
      query = query.eq("billing_period", filters.billingPeriod);
    }
    if (filters?.status && filters.status !== "all") {
      query = query.eq("status", filters.status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching student payments:", error);
      return { ok: false, error: error.message };
    }

    const payments: StudentPayment[] = (data || []).map((row: Record<string, unknown>) => {
      const user = extractUser(row.users);
      const status = computeStatus(
        Number(row.amount_due),
        Number(row.amount_paid),
        String(row.due_date)
      );

      return {
        id: String(row.id),
        student_id: String(row.student_id),
        studentName: user ? `${user.firstname || ""} ${user.lastname || ""}`.trim() : "Élève inconnu",
        studentEmail: user?.email || "",
        parentName: user?.parent_name,
        parentPhone: user?.parent_phone,
        billing_period: String(row.billing_period),
        amount_due: Number(row.amount_due),
        amount_paid: Number(row.amount_paid),
        due_date: String(row.due_date),
        paid_at: row.paid_at ? String(row.paid_at) : null,
        payment_method: (row.payment_method as PaymentMethod) || "cash",
        status,
        notes: row.notes ? String(row.notes) : null,
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
      };
    });

    if (filters?.search) {
      const q = filters.search.toLowerCase();
      return {
        ok: true,
        data: payments.filter(
          (p) =>
            p.studentName?.toLowerCase().includes(q) ||
            p.studentEmail?.toLowerCase().includes(q)
        ),
      };
    }

    return { ok: true, data: payments };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inattendue";
    return { ok: false, error: message };
  }
}

export async function recordStudentPaymentAction(payload: {
  id?: string;
  student_id: string;
  billing_period: string;
  amount_due: number;
  amount_paid: number;
  due_date: string;
  payment_method: PaymentMethod;
  notes?: string;
}): Promise<{ ok: boolean; data?: StudentPayment; error?: string }> {
  try {
    const supabase = await createClient();

    await requireRole("admin", "secretary");

    const status = computeStatus(
      payload.amount_due,
      payload.amount_paid,
      payload.due_date
    );

    const paid_at = payload.amount_paid > 0 ? new Date().toISOString() : null;

    const rowData = {
      student_id: payload.student_id,
      billing_period: payload.billing_period,
      amount_due: payload.amount_due,
      amount_paid: payload.amount_paid,
      due_date: payload.due_date,
      payment_method: payload.payment_method,
      status,
      paid_at,
      notes: payload.notes || null,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (payload.id) {
      result = await supabase
        .from("student_payments")
        .update(rowData)
        .eq("id", payload.id)
        .select()
        .single();
    } else {
      // Vérifier si un enregistrement existe déjà pour cet élève et cette période
      const { data: existing } = await supabase
        .from("student_payments")
        .select("id, amount_paid")
        .eq("student_id", payload.student_id)
        .eq("billing_period", payload.billing_period)
        .maybeSingle();

      if (existing?.id) {
        const newAmountPaid = (existing.amount_paid || 0) + payload.amount_paid;
        const newStatus = computeStatus(payload.amount_due, newAmountPaid, payload.due_date);
        result = await supabase
          .from("student_payments")
          .update({
            ...rowData,
            amount_paid: newAmountPaid,
            status: newStatus,
          })
          .eq("id", existing.id)
          .select()
          .single();
      } else {
        result = await supabase
          .from("student_payments")
          .insert({
            ...rowData,
            created_at: new Date().toISOString(),
          })
          .select()
          .single();
      }
    }

    if (result.error) {
      return { ok: false, error: result.error.message };
    }

    revalidatePath("/payments");
    return { ok: true, data: result.data as StudentPayment };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inattendue";
    return { ok: false, error: message };
  }
}

/**
 * Récupère le dossier financier complet et le suivi de séances d'un élève :
 * Coordonnées parents, classes inscrites, présences / bloc de 4 séances, bilan dû/payé, historique.
 */
export async function getStudentFinancialFileAction(studentId: string): Promise<{
  ok: boolean;
  data?: StudentFinancialFile;
  error?: string;
}> {
  try {
    const supabase = await createClient();

    // 1. Informations de l'élève
    const { data: user, error: userErr } = await supabase
      .from("users")
      .select("id, firstname, lastname, email, parent_name, parent_phone, billing_notes, isactive")
      .eq("id", studentId)
      .maybeSingle();

    if (userErr || !user) {
      return { ok: false, error: "Élève introuvable." };
    }

    // 2. Inscriptions actives
    const { data: enrollmentsData } = await supabase
      .from("enrollments")
      .select(`
        id,
        status,
        groupid,
        groups (
          id,
          name,
          moduleid,
          modules (id, name, monthly_price, price_per_session)
        )
      `)
      .eq("studentid", studentId);

    const groupIds = (enrollmentsData || [])
      .map((e: { groupid: string }) => e.groupid)
      .filter(Boolean);

    const profMap: Record<string, string> = {};
    if (groupIds.length > 0) {
      const { data: masters } = await supabase
        .from("session_masters")
        .select("groupid, professorid, users:professorid (firstname, lastname)")
        .in("groupid", groupIds);

      for (const m of (masters || []) as any[]) {
        const prof = extractUser(m.users);
        if (prof) {
          profMap[m.groupid] = `${prof.firstname || ""} ${prof.lastname || ""}`.trim();
        }
      }
    }

    const enrollments = (enrollmentsData || []).map((e: any) => {
      const g = e.groups;
      const m = g?.modules;
      return {
        id: e.id,
        status: e.status,
        groupid: e.groupid,
        groupName: g?.name || "Classe",
        moduleName: m?.name || "Matière",
        monthlyPrice: Number(m?.monthly_price) || 3000,
        sessionPrice: Number(m?.price_per_session) || 800,
        professorName: profMap[e.groupid] || "Non assigné",
      };
    });

    // 3. Suivi des présences & séances
    const { data: attendancesData } = await supabase
      .from("attendance")
      .select(`
        id,
        status,
        marked_at,
        sessions (
          id,
          sessiondate,
          starttime,
          endtime,
          groupid,
          groups (
            name,
            modules (name)
          )
        )
      `)
      .eq("studentid", studentId)
      .order("marked_at", { ascending: false })
      .limit(60);

    let presentCount = 0;
    let absentCount = 0;
    let lateCount = 0;
    let justifiedCount = 0;
    const recentSessions: any[] = [];

    for (const att of (attendancesData || []) as any[]) {
      const st = att.status;
      if (st === "present") presentCount++;
      else if (st === "absent") absentCount++;
      else if (st === "late") lateCount++;
      else if (st === "justified") justifiedCount++;

      const sess = att.sessions;
      const grp = sess?.groups;
      if (sess && recentSessions.length < 10) {
        recentSessions.push({
          id: sess.id,
          sessiondate: sess.sessiondate,
          starttime: sess.starttime,
          groupName: grp?.name || "",
          moduleName: grp?.modules?.name || "",
          status: st,
        });
      }
    }

    const totalSessions = presentCount + absentCount + lateCount + justifiedCount;
    // Cycle de 4 séances (standard soutien scolaire ITRI)
    const rawCycleMod = totalSessions % 4;
    const sessionsInCurrentCycle = totalSessions === 0 ? 0 : rawCycleMod === 0 ? 4 : rawCycleMod;
    const cycleCompleted = totalSessions > 0 && rawCycleMod === 0;

    // 4. Historique des versements
    const { data: paymentsData } = await supabase
      .from("student_payments")
      .select("*")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false });

    let totalBilled = 0;
    let totalPaid = 0;
    const paymentsList: StudentPayment[] = (paymentsData || []).map((p: any) => {
      const due = Number(p.amount_due) || 0;
      const paid = Number(p.amount_paid) || 0;
      totalBilled += due;
      totalPaid += paid;
      return {
        id: p.id,
        student_id: p.student_id,
        studentName: `${user.firstname || ""} ${user.lastname || ""}`.trim(),
        studentEmail: user.email || "",
        parentName: user.parent_name || "",
        parentPhone: user.parent_phone || "",
        billing_period: p.billing_period,
        amount_due: due,
        amount_paid: paid,
        due_date: p.due_date,
        paid_at: p.paid_at,
        payment_method: p.payment_method,
        status: p.status,
        notes: p.notes,
        created_at: p.created_at,
        updated_at: p.updated_at,
      };
    });

    const remainingBalance = Math.max(0, totalBilled - totalPaid);
    const overallStatus: PaymentStatus =
      totalPaid >= totalBilled && totalBilled > 0
        ? "paid"
        : totalPaid > 0
        ? "partial"
        : totalBilled > 0
        ? "unpaid"
        : "paid";

    return {
      ok: true,
      data: {
        student: {
          id: user.id,
          firstname: user.firstname || "",
          lastname: user.lastname || "",
          email: user.email || "",
          fullName: `${user.firstname || ""} ${user.lastname || ""}`.trim(),
          initials: `${(user.firstname?.[0] || "").toUpperCase()}${(user.lastname?.[0] || "").toUpperCase()}`,
          parent_name: user.parent_name,
          parent_phone: user.parent_phone,
          billing_notes: user.billing_notes,
          isactive: user.isactive ?? true,
        },
        enrollments,
        attendanceStats: {
          totalSessions,
          presentCount,
          absentCount,
          lateCount,
          justifiedCount,
          recentSessions,
        },
        cycleTracking: {
          sessionsInCurrentCycle,
          currentCycleTotal: 4,
          cycleCompleted,
          needsRenewal: cycleCompleted || remainingBalance > 0,
        },
        billingSummary: {
          totalBilled,
          totalPaid,
          remainingBalance,
          overallStatus,
        },
        paymentsHistory: paymentsList,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inattendue";
    return { ok: false, error: message };
  }
}

/* ------------------------------------------------------------------
 * Actions : Rémunérations Enseignants
 * ------------------------------------------------------------------ */

export async function getProfessorPaymentsAction(filters?: {
  billingPeriod?: string;
  status?: string;
}): Promise<{ ok: boolean; data?: ProfessorPayment[]; error?: string }> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from("professor_payments")
      .select(`
        id,
        professor_id,
        billing_period,
        payment_type,
        rate_applied,
        base_calculation,
        total_amount,
        status,
        paid_at,
        notes,
        created_at,
        updated_at,
        users:professor_id (
          id,
          firstname,
          lastname,
          email
        )
      `)
      .order("created_at", { ascending: false });

    if (filters?.billingPeriod && filters.billingPeriod !== "all") {
      query = query.eq("billing_period", filters.billingPeriod);
    }
    if (filters?.status && filters.status !== "all") {
      query = query.eq("status", filters.status);
    }

    const { data, error } = await query;

    if (error) {
      return { ok: false, error: error.message };
    }

    const list: ProfessorPayment[] = (data || []).map((row: Record<string, unknown>) => {
      const user = extractUser(row.users);
      return {
        id: String(row.id),
        professor_id: String(row.professor_id),
        professorName: user ? `${user.firstname || ""} ${user.lastname || ""}`.trim() : "Enseignant inconnu",
        billing_period: String(row.billing_period),
        payment_type: (row.payment_type as PaymentType) || "hourly",
        rate_applied: Number(row.rate_applied) || 0,
        base_calculation: (row.base_calculation as ProfessorPaymentBreakdown) || {},
        total_amount: Number(row.total_amount) || 0,
        status: (row.status as "draft" | "validated" | "paid") || "draft",
        paid_at: row.paid_at ? String(row.paid_at) : null,
        notes: row.notes ? String(row.notes) : null,
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
      };
    });

    return { ok: true, data: list };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inattendue";
    return { ok: false, error: message };
  }
}

/**
 * Calcule et génère automatiquement les rémunérations de tous les enseignants
 * pour une période mensuelle donnée (ex: "2026-09").
 */
export async function generateMonthlyProfessorPaymentsAction(
  options:
    | string
    | {
        billingPeriod: string;
        startDate?: string;
        endDate?: string;
      }
): Promise<{ ok: boolean; count?: number; error?: string }> {
  try {
    const supabase = await createClient();

    await requireRole("admin", "secretary");

    const billingPeriod = typeof options === "string" ? options : options.billingPeriod;
    const startDate = typeof options === "object" ? options.startDate : undefined;
    const endDate = typeof options === "object" ? options.endDate : undefined;
    const periodLabel =
      startDate && endDate ? `Du ${startDate} au ${endDate}` : billingPeriod;

    // 1. Récupérer tous les enseignants
    const { data: professors, error: profError } = await supabase
      .from("users")
      .select("id, firstname, lastname, payment_type, hourly_rate, percentage_rate")
      .eq("role", "professor")
      .eq("isactive", true);

    if (profError || !professors) {
      return { ok: false, error: profError?.message || "Impossible de charger les enseignants" };
    }

    let generatedCount = 0;

    for (const prof of professors) {
      const paymentType: PaymentType = prof.payment_type === "percentage" ? "percentage" : "hourly";
      let rateApplied = 0;
      let totalAmount = 0;
      const breakdown: ProfessorPaymentBreakdown = {
        periodLabel,
        startDate,
        endDate,
      };

      if (paymentType === "hourly") {
        rateApplied = Number(prof.hourly_rate) || 0;

        // Décompte des heures d'après les séances réelles ou planifiées
        // Chercher d'abord dans sessions
        const { data: sessionsData } = await supabase
          .from("sessions")
          .select("id, sessionDate, startTime, endTime, moduleName, groupName")
          .eq("professorId", prof.id);

        const periodSessions = (sessionsData || []).filter(
          (s: { sessionDate?: string }) => {
            if (!s.sessionDate) return false;
            if (startDate && endDate) {
              return s.sessionDate >= startDate && s.sessionDate <= endDate;
            }
            return s.sessionDate.startsWith(billingPeriod);
          }
        );

        let totalHours = 0;
        const sessionsList = periodSessions.map(
          (s: {
            sessionDate: string;
            startTime: string;
            endTime: string;
            moduleName?: string;
            groupName?: string;
          }) => {
            const [sh, sm] = (s.startTime || "00:00").split(":").map(Number);
            const [eh, em] = (s.endTime || "01:30").split(":").map(Number);
            const duration = Math.max(0.5, (eh * 60 + em - (sh * 60 + sm)) / 60);
            totalHours += duration;
            return {
              date: s.sessionDate,
              startTime: s.startTime,
              endTime: s.endTime,
              moduleName: s.moduleName || "Matière",
              groupName: s.groupName || "Classe",
              durationHours: duration,
            };
          }
        );

        // Si aucune séance enregistrée dans `sessions`, estimer à partir de `session_masters`
        if (sessionsList.length === 0) {
          const { data: masters } = await supabase
            .from("session_masters")
            .select("id, startTime, endTime, weekday, moduleid, groupid")
            .eq("professorid", prof.id)
            .eq("status", "active");

          if (masters && masters.length > 0) {
            for (const m of masters) {
              const [sh, sm] = (m.startTime || "00:00").split(":").map(Number);
              const [eh, em] = (m.endTime || "01:30").split(":").map(Number);
              const duration = Math.max(0.5, (eh * 60 + em - (sh * 60 + sm)) / 60);

              let occurrencesCount = 4;
              if (startDate && endDate) {
                occurrencesCount = 0;
                const cur = new Date(startDate + "T00:00:00");
                const end = new Date(endDate + "T23:59:59");
                while (cur <= end) {
                  if (cur.getDay() === m.weekday) occurrencesCount++;
                  cur.setDate(cur.getDate() + 1);
                }
                occurrencesCount = Math.max(1, occurrencesCount);
              }

              const monthHours = duration * occurrencesCount;
              totalHours += monthHours;
              sessionsList.push({
                date: startDate && endDate ? `Du ${startDate} au ${endDate} (${occurrencesCount} séances)` : `${billingPeriod} (Régulier)`,
                startTime: m.startTime,
                endTime: m.endTime,
                moduleName: "Séance hebdomadaire",
                groupName: "Groupe assigné",
                durationHours: monthHours,
              });
            }
          }
        }

        breakdown.sessions = sessionsList;
        breakdown.totalHours = totalHours;
        totalAmount = Math.round(totalHours * rateApplied);
      } else {
        // Mode pourcentage
        rateApplied = Number(prof.percentage_rate) || 0;

        // 1. Groupes rattachés au professeur
        const { data: profGroups } = await supabase
          .from("professor_groups")
          .select("groupid")
          .eq("professorid", prof.id);

        const groupIds = (profGroups || []).map((pg: Record<string, string>) => pg.groupid);

        let totalCollected = 0;
        const studentCollections: {
          studentId: string;
          studentName: string;
          groupName: string;
          amountPaid: number;
        }[] = [];

        if (groupIds.length > 0) {
          // 2. Élèves inscrits dans ces groupes
          const { data: enrollments } = await supabase
            .from("enrollments")
            .select("studentid, groupid, groups:groupid(name)")
            .in("groupid", groupIds)
            .eq("status", "active");

          const studentIds = Array.from(
            new Set((enrollments || []).map((e: { studentid: string }) => String(e.studentid)))
          );

          if (studentIds.length > 0) {
            // 3. Paiements encaissés auprès de ces élèves pour cette période
            let paymentsQuery = supabase
              .from("student_payments")
              .select(`
                student_id,
                amount_paid,
                users:student_id(firstname, lastname)
              `)
              .in("student_id", studentIds);

            if (startDate && endDate) {
              paymentsQuery = paymentsQuery
                .gte("due_date", startDate)
                .lte("due_date", endDate);
            } else {
              paymentsQuery = paymentsQuery.eq("billing_period", billingPeriod);
            }

            const { data: payments } = await paymentsQuery;

            for (const sp of payments || []) {
              const u = extractUser(sp.users);
              const paid = Number(sp.amount_paid) || 0;
              totalCollected += paid;
              studentCollections.push({
                studentId: sp.student_id,
                studentName: u ? `${u.firstname || ""} ${u.lastname || ""}`.trim() : "Élève",
                groupName: "Classe de soutien",
                amountPaid: paid,
              });
            }
          }
        }

        breakdown.studentCollections = studentCollections;
        breakdown.totalCollected = totalCollected;
        totalAmount = Math.round((totalCollected * rateApplied) / 100);
      }

      // Upsert du décompte
      const { data: existing } = await supabase
        .from("professor_payments")
        .select("id, status")
        .eq("professor_id", prof.id)
        .eq("billing_period", billingPeriod)
        .maybeSingle();

      // Ne pas écraser si déjà validé ou payé
      if (existing?.status === "paid") {
        continue;
      }

      const row = {
        professor_id: prof.id,
        billing_period: billingPeriod,
        payment_type: paymentType,
        rate_applied: rateApplied,
        base_calculation: breakdown,
        total_amount: totalAmount,
        status: existing?.status || "draft",
        updated_at: new Date().toISOString(),
      };

      if (existing?.id) {
        await supabase.from("professor_payments").update(row).eq("id", existing.id);
      } else {
        await supabase.from("professor_payments").insert({
          ...row,
          created_at: new Date().toISOString(),
        });
      }

      generatedCount++;
    }

    revalidatePath("/payments");
    return { ok: true, count: generatedCount };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inattendue";
    return { ok: false, error: message };
  }
}

export async function updateProfessorPaymentStatusAction(
  paymentId: string,
  status: "draft" | "validated" | "paid",
  notes?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    await requireRole("admin", "secretary");

    const updatePayload: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (notes !== undefined) {
      updatePayload.notes = notes;
    }

    if (status === "paid") {
      updatePayload.paid_at = new Date().toISOString();
    } else {
      updatePayload.paid_at = null;
    }

    const { error } = await supabase
      .from("professor_payments")
      .update(updatePayload)
      .eq("id", paymentId);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/payments");
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inattendue";
    return { ok: false, error: message };
  }
}
