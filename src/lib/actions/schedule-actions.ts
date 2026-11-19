"use server";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth-helpers";

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
  professorId?: string
): Promise<ValidateSessionAssignmentResult> {
  try {
    const supabase = await createClient();

    // 1. Trouver les groupes/classes associées à ce module
    const { data: groups, error: groupsErr } = await supabase
      .from("groups")
      .select("id")
      .eq("moduleid", moduleId);

    if (groupsErr) {
      return { valid: false, error: "Erreur lors de la vérification de la matière" };
    }

    const groupIds = (groups || []).map((g: { id: string }) => g.id);

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

    // 1. Vérification dans les modèles d'emploi du temps (session_masters) pour le même jour de semaine
    const { data: masters, error: mastersErr } = await supabase
      .from("session_masters")
      .select("id, professorid, roomid, groupid, startTime, endTime, weekday")
      .eq("weekday", params.weekday)
      .eq("status", "active");

    if (mastersErr) {
      console.error("Erreur lecture session_masters:", mastersErr);
      return {
        hasConflict: true,
        reason: "Erreur lors de la vérification des conflits dans le planning récurrent.",
      };
    }

    const filteredMasters = (masters || []).filter(
      (m: { id: string }) => !params.excludeMasterId || m.id !== params.excludeMasterId
    );

    for (const m of filteredMasters) {
      const overlap = !(params.endTime <= m.startTime || params.startTime >= m.endTime);
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
        .eq("sessiondate", params.date)
        .neq("status", "CANCELLED");

      if (sessionsErr) {
        console.error("Erreur lecture sessions:", sessionsErr);
        return {
          hasConflict: true,
          reason: "Erreur lors de la vérification des séances ponctuelles.",
        };
      }

      const filteredSessions = (realSessions || []).filter(
        (s: { id: string }) => !params.excludeSessionId || s.id !== params.excludeSessionId
      );

      for (const s of filteredSessions) {
        const overlap = !(params.endTime <= s.starttime || params.startTime >= s.endtime);
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
