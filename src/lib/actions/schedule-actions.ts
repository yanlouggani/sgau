"use server";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth-helpers";
import { normalizeTime, detectScheduleConflict } from "@/lib/session-masters";

export type ValidateSessionAssignmentResult = {
  valid: boolean;
  error?: string;
  hasAssignedProfessors?: boolean;
  assignedProfessorCount?: number;
};

/**
 * Valide côté serveur qu'un module/matière possède au moins un enseignant rattaché
 * et que l'enseignant sélectionné est valide.
 */
export async function validateSessionAssignmentAction(
  moduleId: string,
  professorId?: string,
  groupId?: string
): Promise<ValidateSessionAssignmentResult> {
  try {
    if (!moduleId) {
      return { valid: false, error: "Identifiant de la matière manquant" };
    }

    const supabase = await createClient();

    let groupIds: string[] = [];
    if (groupId) {
      groupIds = [groupId];
    } else {
      // 1. Trouver les groupes/classes associées à ce module
      const { data: groups, error: groupsErr } = await supabase
        .from("groups")
        .select("id")
        .eq("moduleid", moduleId);

      if (groupsErr) {
        return { valid: false, error: "Erreur lors de la vérification de la matière" };
      }

      groupIds = (groups || []).map((g: { id: string }) => g.id);
    }

    // 2. Trouver les enseignants assignés à ces groupes
    let assignedProfIds: string[] = [];
    if (groupIds.length > 0) {
      const { data: assignments } = await supabase
        .from("professor_groups")
        .select("professorid")
        .in("groupid", groupIds);

      assignedProfIds = Array.from(
        new Set((assignments || []).map((a: { professorid: string }) => a.professorid))
      );
    }

    // Si aucun enseignant n'est spécifié, l'ajout d'une séance sans enseignant est expressément autorisé
    if (!professorId || professorId === "none" || professorId === "") {
      return {
        valid: true,
        hasAssignedProfessors: assignedProfIds.length > 0,
        assignedProfessorCount: assignedProfIds.length,
      };
    }

    // Si un enseignant spécifique a été fourni, vérifier son affectation
    if (assignedProfIds.length > 0 && !assignedProfIds.includes(professorId)) {
      return {
        valid: false,
        hasAssignedProfessors: true,
        assignedProfessorCount: assignedProfIds.length,
        error: "L'enseignant sélectionné n'est pas habilité à dispenser cette matière pour cette classe.",
      };
    }

    return {
      valid: true,
      hasAssignedProfessors: assignedProfIds.length > 0,
      assignedProfessorCount: assignedProfIds.length,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inattendue";
    return { valid: false, error: message };
  }
}

/**
 * Vérification serveur stricte des conflits pour un créneau donné
 * Empêche les doubles réservations pour l'enseignant, la salle et la classe.
 */
export async function checkScheduleConflictAction(params: {
  date?: string;
  weekday: number;
  startTime: string;
  endTime: string;
  professorId?: string;
  roomId?: string;
  groupId: string;
  excludeMasterId?: string;
  excludeSessionId?: string;
}): Promise<{ hasConflict: boolean; reason?: string }> {
  try {
    // Vérification de sécurité
    await requireRole("admin", "secretary");

    const supabase = await createClient();
    const candStart = normalizeTime(params.startTime);
    const candEnd = normalizeTime(params.endTime);

    if (!candStart || !candEnd || candStart >= candEnd) {
      return {
        hasConflict: true,
        reason: "L'heure de début doit être strictement antérieure à l'heure de fin.",
      };
    }

    // 1. Vérification dans les modèles d'emploi du temps (session_masters) pour le même jour de semaine
    const { data: masters, error: mastersErr } = await supabase
      .from("session_masters")
      .select("id, professorid, roomid, groupid, starttime, endtime, weekday, effectivestartdate, effectiveenddate, effective_start_date, effective_end_date")
      .eq("weekday", params.weekday)
      .eq("status", "active");

    if (mastersErr) {
      console.error("Erreur lecture session_masters:", mastersErr);
      return {
        hasConflict: true,
        reason: "Erreur lors de la vérification des conflits dans le planning récurrent.",
      };
    }

    // Si une date exacte est fournie, récupérer les exceptions éventuelles pour cette date
    let exceptionsMap = new Map<string, any>();
    if (params.date) {
      const { data: exceptions } = await supabase
        .from("session_exceptions")
        .select("*")
        .eq("occurrencedate", params.date);

      if (exceptions) {
        for (const exc of exceptions) {
          const mId = exc.masterId || exc.masterid;
          if (mId) exceptionsMap.set(mId, exc);
        }
      }
    }

    const filteredMasters = (masters || []).filter(
      (m: { id: string }) => !params.excludeMasterId || m.id !== params.excludeMasterId
    );

    for (const m of filteredMasters) {
      // Vérifier les bornes de dates effectives si date fournie
      if (params.date) {
        const effStart = (m as any).effectivestartdate || (m as any).effective_start_date;
        const effEnd = (m as any).effectiveenddate || (m as any).effective_end_date;
        if (effStart && params.date < effStart) continue;
        if (effEnd && params.date > effEnd) continue;

        // Vérifier si cette occurrence a été supprimée ou modifiée par une exception
        const exc = exceptionsMap.get(m.id);
        if (exc) {
          if (exc.type === "deleted") {
            // Occurrence supprimée à cette date -> pas de conflit
            continue;
          }
          if (exc.type === "modified") {
            // Si modifiée, appliquer les nouvelles valeurs
            const excStart = normalizeTime(exc.overridestarttime || exc.overrideStartTime);
            const excEnd = normalizeTime(exc.overrideendtime || exc.overrideEndTime);
            const excProf = exc.overrideprofessorid !== undefined ? exc.overrideprofessorid : exc.overrideProfessorId;
            const excRoom = exc.overrideroomid !== undefined ? exc.overrideroomid : exc.overrideRoomId;

            if (excStart && excEnd) {
              const overlap = !(candEnd <= excStart || candStart >= excEnd);
              if (overlap) {
                const candProf = params.professorId && params.professorId !== "none" ? params.professorId : null;
                const activeProf = excProf ?? m.professorid;
                if (candProf && activeProf && activeProf !== "none" && candProf === activeProf) {
                  return {
                    hasConflict: true,
                    reason: "Conflit d'emploi du temps : cet enseignant a déjà un cours prévu sur ce créneau.",
                  };
                }
                const candRoom = params.roomId && params.roomId !== "none" ? params.roomId : null;
                const activeRoom = excRoom ?? m.roomid;
                if (candRoom && activeRoom && activeRoom !== "none" && candRoom === activeRoom) {
                  return {
                    hasConflict: true,
                    reason: "Conflit d'emploi du temps : cette salle est déjà occupée sur ce créneau.",
                  };
                }
                if (m.groupid === params.groupId) {
                  return {
                    hasConflict: true,
                    reason: "Conflit d'emploi du temps : cette classe a déjà un cours programmé sur ce créneau.",
                  };
                }
              }
            }
            continue;
          }
        }
      }

      const mStart = normalizeTime((m as any).starttime || (m as any).startTime);
      const mEnd = normalizeTime((m as any).endtime || (m as any).endTime);

      if (!mStart || !mEnd) continue;

      const overlap = !(candEnd <= mStart || candStart >= mEnd);
      if (overlap) {
        if (params.professorId && params.professorId !== "none" && m.professorid === params.professorId) {
          return {
            hasConflict: true,
            reason: "Conflit d'emploi du temps : cet enseignant a déjà un cours prévu sur ce créneau.",
          };
        }
        if (params.roomId && params.roomId !== "none" && m.roomid === params.roomId) {
          return {
            hasConflict: true,
            reason: "Conflit d'emploi du temps : cette salle est déjà occupée sur ce créneau.",
          };
        }
        if (m.groupid === params.groupId) {
          return {
            hasConflict: true,
            reason: "Conflit d'emploi du temps : cette classe a déjà un cours programmé sur ce créneau.",
          };
        }
      }
    }

    // 2. Si une date exacte est fournie, vérifier aussi les séances ponctuelles (sessions réelles)
    if (params.date) {
      const { data: realSessions, error: sessionsErr } = await supabase
        .from("sessions")
        .select("id, professorid, roomid, groupid, starttime, endtime, status")
        .eq("sessiondate", params.date);

      if (sessionsErr) {
        console.error("Erreur lecture sessions:", sessionsErr);
        return {
          hasConflict: true,
          reason: "Erreur lors de la vérification des séances ponctuelles.",
        };
      }

      const filteredSessions = (realSessions || []).filter(
        (s: { id: string; status?: string }) => {
          if (params.excludeSessionId && s.id === params.excludeSessionId) return false;
          const status = String(s.status || "").toLowerCase();
          return status !== "cancelled";
        }
      );

      for (const s of filteredSessions) {
        const sStart = normalizeTime(s.starttime);
        const sEnd = normalizeTime(s.endtime);

        if (!sStart || !sEnd) continue;

        const overlap = !(candEnd <= sStart || candStart >= sEnd);
        if (overlap) {
          if (params.professorId && params.professorId !== "none" && s.professorid === params.professorId) {
            return {
              hasConflict: true,
              reason: "Conflit de séance : l'enseignant dispense déjà une séance réelle à cette date et heure.",
            };
          }
          if (params.roomId && params.roomId !== "none" && s.roomid === params.roomId) {
            return {
              hasConflict: true,
              reason: "Conflit de séance : la salle est déjà réservée pour une séance à cette date et heure.",
            };
          }
          if (s.groupid === params.groupId) {
            return {
              hasConflict: true,
              reason: "Conflit de séance : cette classe a déjà une séance prévue à cette date et heure.",
            };
          }
        }
      }
    }

    return { hasConflict: false };
  } catch (err) {
    console.error("Exception checkScheduleConflictAction:", err);
    // Refus sécurisé (fail-closed)
    return {
      hasConflict: true,
      reason: "Impossible de valider les conflits en raison d'une erreur serveur. Opération refusée par sécurité.",
    };
  }
}
