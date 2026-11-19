"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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
 * Vérification serveur des conflits pour un créneau donné
 */
export async function checkScheduleConflictAction(params: {
  date: string;
  weekday: number;
  startTime: string;
  endTime: string;
  professorId: string;
  roomId: string;
  groupId: string;
  excludeMasterId?: string;
}): Promise<{ hasConflict: boolean; reason?: string }> {
  try {
    const supabase = await createClient();

    // Vérifier les conflits dans session_masters pour le même jour de semaine
    const { data: masters } = await supabase
      .from("session_masters")
      .select("id, professorid, roomid, groupid, startTime, endTime, weekday")
      .eq("weekday", params.weekday)
      .eq("status", "active");

    const filtered = (masters || []).filter(
      (m: { id: string }) => !params.excludeMasterId || m.id !== params.excludeMasterId
    );

    for (const m of filtered) {
      // Vérification de chevauchement temporel
      const overlap = !(params.endTime <= m.startTime || params.startTime >= m.endTime);
      if (overlap) {
        if (m.professorid === params.professorId) {
          return { hasConflict: true, reason: "L'enseignant a déjà une séance prévue sur ce créneau." };
        }
        if (m.roomid === params.roomId) {
          return { hasConflict: true, reason: "La salle est déjà réservée sur ce créneau." };
        }
        if (m.groupid === params.groupId) {
          return { hasConflict: true, reason: "La classe a déjà un cours sur ce créneau." };
        }
      }
    }

    return { hasConflict: false };
  } catch {
    return { hasConflict: false };
  }
}
