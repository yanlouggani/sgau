import type { SupabaseClient } from "@supabase/supabase-js";

/* ============================================================
 * Session masters — client API web
 * Aligné sur le backend mobile (services/recurring-sessions)
 * et sur la migration SQL migration_session_masters.sql.
 *
 * Modèle :
 *   - SessionMaster    : série hebdomadaire (jour + créneau + prof +
 *                        salle + groupe + module), bornée dans le temps.
 *   - SessionException : dérogation ponctuelle (DELETED / MODIFIED).
 *   - La projection d'une semaine est faite en base (RPC project_week).
 * ============================================================ */

/* ---------- Types (miroir de project_week / RPC CRUD) ---------- */

export type SessionOccurrence = {
  id: string;
  masterId: string;
  seriesKey: string;
  occurrenceDate: string; // date projetée (après exceptions)
  originalDate: string;   // date d'origine dans la série
  originalStartTime: string;
  originalEndTime: string;
  startTime: string;
  endTime: string;
  moduleId: string;
  professorId: string;
  groupId: string;
  roomId: string;
  weekday: number;
  status: string;
  sourceType: "master" | "exception";
  exceptionId: string | null;
  moduleName: string;
  professorName: string;
  groupName: string;
  roomName: string;
  capacity: number;
};

export type SessionMaster = {
  id: string;
  seriesKey: string;
  parentMasterId: string | null;
  moduleId: string;
  professorId: string;
  groupId: string;
  roomId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  effectiveStartDate: string;
  effectiveEndDate: string | null;
  status: "active" | "archived";
  archivedAt: string | null;
  moduleName: string;
  professorName: string;
  groupName: string;
  roomName: string;
};

export type SessionException = {
  id: string;
  masterId: string;
  occurrenceDate: string;
  type: "deleted" | "modified";
  originalDate: string;
  originalStartTime: string;
  originalEndTime: string;
  overrideDate: string | null;
  overrideStartTime: string | null;
  overrideEndTime: string | null;
  overrideModuleId: string | null;
  overrideProfessorId: string | null;
  overrideGroupId: string | null;
  overrideRoomId: string | null;
  note: string | null;
};

export type SessionErrorCode =
  | "CONFLICT_TEACHER"
  | "CONFLICT_ROOM"
  | "CONFLICT_GROUP"
  | "SERIES_NOT_FOUND"
  | "OCCURRENCE_NOT_FOUND"
  | "INVALID_SCOPE"
  | "PAST_OCCURRENCE_LOCKED"
  | "FORBIDDEN"
  | "UNKNOWN";

export type SessionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: SessionErrorCode; message: string };

/* ---------- Helpers de dates (semaine commençant le lundi) ---------- */

export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromDateOnly(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00`);
}

/** Début de semaine (dimanche). */
export function getWeekStart(date: Date | string): string {
  const d = date instanceof Date ? new Date(date) : fromDateOnly(date);
  const diff = d.getDay(); // Dimanche = 0
  d.setDate(d.getDate() - diff);
  return toLocalDateStr(d);
}

export function getWeekEnd(date: Date | string): string {
  const d = date instanceof Date ? new Date(date) : fromDateOnly(date);
  const diff = d.getDay();
  d.setDate(d.getDate() + 6 - diff);
  return toLocalDateStr(d);
}

export function addWeeks(date: string, n: number): string {
  const d = fromDateOnly(date);
  d.setDate(d.getDate() + n * 7);
  return toLocalDateStr(d);
}

export function addDays(date: string, n: number): string {
  const d = fromDateOnly(date);
  d.setDate(d.getDate() + n);
  return toLocalDateStr(d);
}

/** Première date >= dateOnly dont le jour de semaine correspond (0=Dimanche). */
export function weekdayOnOrAfter(dateOnly: string, weekday: number): string {
  const d = fromDateOnly(dateOnly);
  const delta = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + delta);
  return toLocalDateStr(d);
}

export function compareDateOnly(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/* ---------- Mapping d'erreurs "CODE|message" ---------- */

const KNOWN_CODES: SessionErrorCode[] = [
  "CONFLICT_TEACHER", "CONFLICT_ROOM", "CONFLICT_GROUP",
  "SERIES_NOT_FOUND", "OCCURRENCE_NOT_FOUND", "INVALID_SCOPE",
  "PAST_OCCURRENCE_LOCKED", "FORBIDDEN",
];

export function mapSessionError(message: string): SessionResult<never> {
  const [code, ...rest] = (message ?? "").split("|");
  const known = KNOWN_CODES.includes(code as SessionErrorCode);
  return {
    ok: false,
    code: known ? (code as SessionErrorCode) : "UNKNOWN",
    message: known ? rest.join("|") : message,
  };
}

/* ---------- Projection semaine ---------- */

export async function projectWeek(
  supabase: SupabaseClient,
  weekStart: string,
  groupId?: string | null,
): Promise<SessionResult<SessionOccurrence[]>> {
  const { data, error } = await supabase.rpc("project_week", {
    p_week_start: weekStart,
    p_groupid: groupId ?? null,
  });
  if (error) return mapSessionError(error.message);
  return { ok: true, data: (data as SessionOccurrence[]) ?? [] };
}

/* ---------- CRUD séries / occurrences ---------- */

type CreateSeriesInput = {
  moduleId: string;
  professorId?: string | null;
  groupId: string;
  roomId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  effectiveStartDate: string;
  effectiveEndDate?: string | null;
  seriesKey?: string | null;
};

export async function createSeries(
  supabase: SupabaseClient,
  input: CreateSeriesInput,
): Promise<SessionResult<SessionMaster>> {
  const profId = input.professorId && input.professorId !== "none" ? input.professorId : null;
  const { data, error } = await supabase.rpc("create_series", {
    p_moduleid: input.moduleId,
    p_professorid: profId,
    p_groupid: input.groupId,
    p_roomid: input.roomId,
    p_weekday: input.weekday,
    p_start_time: input.startTime,
    p_end_time: input.endTime,
    p_effective_start_date: input.effectiveStartDate,
    p_effective_end_date: input.effectiveEndDate ?? null,
    p_series_key: input.seriesKey ?? null,
  });
  if (!error && data) return { ok: true, data: data as SessionMaster };

  // Fallback direct table insert si le RPC n'accepte pas de prof null ou échoue
  try {
    const id = crypto.randomUUID();
    const seriesKey = input.seriesKey ?? `series_${id.slice(0, 8)}`;
    const { data: inserted, error: insErr } = await supabase
      .from("session_masters")
      .insert({
        id,
        serieskey: seriesKey,
        moduleid: input.moduleId,
        professorid: profId,
        groupid: input.groupId,
        roomid: input.roomId,
        weekday: input.weekday,
        starttime: input.startTime,
        endtime: input.endTime,
        effectivestartdate: input.effectiveStartDate,
        effectiveenddate: input.effectiveEndDate ?? null,
        status: "active",
      })
      .select()
      .maybeSingle();

    if (!insErr && inserted) {
      return { ok: true, data: inserted as SessionMaster };
    }
  } catch {
    // Continuer vers l'erreur standard
  }

  if (error) return mapSessionError(error.message);
  return { ok: true, data: data as SessionMaster };
}

type EditOccurrenceInput = {
  masterId: string;
  occurrenceDate: string;
  overrideDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  moduleId?: string | null;
  professorId?: string | null;
  groupId?: string | null;
  roomId?: string | null;
  note?: string | null;
};

export async function editOccurrence(
  supabase: SupabaseClient,
  input: EditOccurrenceInput,
): Promise<SessionResult<SessionException>> {
  const profId = input.professorId === "none" ? null : (input.professorId ?? null);
  const { data, error } = await supabase.rpc("edit_occurrence", {
    p_master_id: input.masterId,
    p_occurrence_date: input.occurrenceDate,
    p_override_date: input.overrideDate ?? null,
    p_start_time: input.startTime ?? null,
    p_end_time: input.endTime ?? null,
    p_moduleid: input.moduleId ?? null,
    p_professorid: profId,
    p_groupid: input.groupId ?? null,
    p_roomid: input.roomId ?? null,
    p_note: input.note ?? null,
  });
  if (error) return mapSessionError(error.message);
  return { ok: true, data: data as SessionException };
}

export async function deleteOccurrence(
  supabase: SupabaseClient,
  input: { masterId: string; occurrenceDate: string; note?: string | null },
): Promise<SessionResult<SessionException>> {
  const { data, error } = await supabase.rpc("delete_occurrence", {
    p_master_id: input.masterId,
    p_occurrence_date: input.occurrenceDate,
    p_note: input.note ?? null,
  });
  if (error) return mapSessionError(error.message);
  return { ok: true, data: data as SessionException };
}

type EditSeriesFromDateInput = {
  masterId: string;
  fromDate: string;
  moduleId?: string | null;
  professorId?: string | null;
  groupId?: string | null;
  roomId?: string | null;
  weekday?: number | null;
  startTime?: string | null;
  endTime?: string | null;
};

export type EditSeriesFromDateResult = {
  master: SessionMaster;
  split: boolean;
  predecessor: SessionMaster | null;
};

export async function editSeriesFromDate(
  supabase: SupabaseClient,
  input: EditSeriesFromDateInput,
): Promise<SessionResult<EditSeriesFromDateResult>> {
  const profId = input.professorId === "none" ? null : (input.professorId ?? null);
  const { data, error } = await supabase.rpc("edit_series_from_date", {
    p_master_id: input.masterId,
    p_from_date: input.fromDate,
    p_moduleid: input.moduleId ?? null,
    p_professorid: profId,
    p_groupid: input.groupId ?? null,
    p_roomid: input.roomId ?? null,
    p_weekday: input.weekday ?? null,
    p_start_time: input.startTime ?? null,
    p_end_time: input.endTime ?? null,
  });
  if (error) return mapSessionError(error.message);
  return { ok: true, data: data as EditSeriesFromDateResult };
}

export type DeleteSeriesFromDateResult = {
  master: SessionMaster | null;
  archived: boolean;
};

export async function deleteSeriesFromDate(
  supabase: SupabaseClient,
  input: { masterId: string; fromDate: string },
): Promise<SessionResult<DeleteSeriesFromDateResult>> {
  try {
    // Calculer la veille de fromDate pour borner la série sans toucher aux séances antérieures
    const prevDate = new Date(input.fromDate + "T00:00:00");
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = toLocalDateStr(prevDate);

    // Récupérer le master actuel pour vérifier sa date de début
    const { data: master } = await supabase
      .from("session_masters")
      .select("*")
      .eq("id", input.masterId)
      .maybeSingle();

    if (master) {
      const startDate = master.effectivestartdate || master.effective_start_date;
      if (startDate && input.fromDate <= startDate) {
        // La suppression commence dès ou avant la date de début de la série -> on archive toute la série
        await supabase
          .from("session_masters")
          .update({
            status: "archived",
            archivedat: new Date().toISOString(),
          })
          .eq("id", input.masterId);

        await supabase
          .from("session_exceptions")
          .delete()
          .eq("masterid", input.masterId)
          .gte("occurrencedate", input.fromDate);

        return { ok: true, data: { master: null, archived: true } };
      } else {
        // La série a déjà tourné avant fromDate : on met à jour la date de fin à la veille de fromDate !
        // Ainsi toutes les séances AVANT fromDate restent strictement préservées dans l'historique.
        const { data: updated, error: updErr } = await supabase
          .from("session_masters")
          .update({
            effectiveenddate: prevDateStr,
            effective_end_date: prevDateStr,
          })
          .eq("id", input.masterId)
          .select()
          .maybeSingle();

        // Nettoyer les exceptions sur ou après fromDate
        await supabase
          .from("session_exceptions")
          .delete()
          .eq("masterid", input.masterId)
          .gte("occurrencedate", input.fromDate);

        if (!updErr && updated) {
          return { ok: true, data: { master: updated as SessionMaster, archived: false } };
        }
      }
    }
  } catch (err) {
    console.warn("Direct update for deleteSeriesFromDate failed, attempting RPC fallback:", err);
  }

  // Fallback RPC standard si disponible
  const { data, error } = await supabase.rpc("delete_series_from_date", {
    p_master_id: input.masterId,
    p_from_date: input.fromDate,
  });
  if (error) return mapSessionError(error.message);
  return { ok: true, data: data as DeleteSeriesFromDateResult };
}

export type ArchiveSeriesResult = {
  seriesKey: string;
  archivedAt: string;
  masters: SessionMaster[];
};

export async function archiveSeries(
  supabase: SupabaseClient,
  input: { masterId: string },
): Promise<SessionResult<ArchiveSeriesResult>> {
  const { data, error } = await supabase.rpc("archive_series", {
    p_master_id: input.masterId,
  });
  if (error) return mapSessionError(error.message);
  return { ok: true, data: data as ArchiveSeriesResult };
}

/* ---------- Helpers d'affichage ---------- */

/** Normalise une heure au format "HH:MM" (tolère "HH:MM:SS" et "HH:MM"). */
export function normalizeTime(t: string | null | undefined): string {
  return (t ?? "").slice(0, 5);
}

/** Clé unique de cellule d'un grid hebdomadaire (jour + heure de début). */
export function cellKey(day: number, startTime: string): string {
  return `${day}-${normalizeTime(startTime)}`;
}

/** Liste des occurrences d'une semaine regroupées par cellule. */
export function groupOccurrencesByCell(
  occurrences: SessionOccurrence[],
): Map<string, SessionOccurrence[]> {
  const map = new Map<string, SessionOccurrence[]>();
  for (const occ of occurrences) {
    const key = cellKey(occurrenceDay(occ), occ.startTime);
    const list = map.get(key);
    if (list) list.push(occ);
    else map.set(key, [occ]);
  }
  return map;
}

/** Jour de semaine (0=Dimanche) de l'occurrence projetée. */
export function occurrenceDay(occ: SessionOccurrence): number {
  return fromDateOnly(occ.occurrenceDate).getDay();
}
