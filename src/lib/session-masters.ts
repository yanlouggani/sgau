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

export function fromDateOnly(dateOnly: string): Date {
  if (!dateOnly) return new Date();
  const clean = dateOnly.includes("T") ? dateOnly.split("T")[0] : dateOnly.slice(0, 10);
  const parts = clean.split("-").map(Number);
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
  }
  const fallback = new Date(dateOnly);
  return isNaN(fallback.getTime()) ? new Date() : fallback;
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
  if (!error && data) {
    return { ok: true, data: (data as SessionOccurrence[]) ?? [] };
  }

  // Fallback si RPC inexistant ou non implémenté
  try {
    let mastersQuery = supabase
      .from("session_masters")
      .select("*")
      .eq("status", "active");

    if (groupId) {
      mastersQuery = mastersQuery.eq("groupid", groupId);
    }

    const weekEnd = getWeekEnd(weekStart);

    const [{ data: masters }, { data: exceptions }] = await Promise.all([
      mastersQuery,
      supabase
        .from("session_exceptions")
        .select("*")
        .gte("occurrencedate", weekStart)
        .lte("occurrencedate", weekEnd),
    ]);

    if (masters && masters.length >= 0) {
      const expanded = expandSessionMasters(masters, {
        weekStart,
        exceptions: exceptions ?? [],
        groupId,
      });
      return { ok: true, data: expanded };
    }
  } catch (fallbackErr) {
    console.warn("projectWeek fallback failed:", fallbackErr);
  }

  if (error) return mapSessionError(error.message);
  return { ok: true, data: [] };
}

/* ---------- Détection de conflits & Expansion en mémoire ---------- */

export type ConflictCandidate = {
  id?: string;
  masterId?: string;
  occurrenceDate?: string;
  weekday?: number;
  startTime: string;
  endTime: string;
  professorId?: string | null;
  roomId?: string | null;
  groupId: string;
};

export type ConflictCheckResult = {
  hasConflict: boolean;
  type?: "professor" | "room" | "group";
  reason?: string;
  conflictingItem?: any;
};

export function detectScheduleConflict(
  candidate: ConflictCandidate,
  existingList: (SessionOccurrence | SessionMaster | Record<string, any>)[],
  options?: {
    excludeId?: string;
    excludeMasterId?: string;
  }
): ConflictCheckResult {
  const candStart = normalizeTime(candidate.startTime);
  const candEnd = normalizeTime(candidate.endTime);

  if (!candStart || !candEnd || candStart >= candEnd) {
    return {
      hasConflict: true,
      reason: "L'heure de début doit être strictement antérieure à l'heure de fin.",
    };
  }

  for (const item of existingList) {
    const it = item as any;
    const itemId = it.id;
    const itemMasterId = it.masterId || it.masterid;

    // Exclusion explicite de la séance ou du master en cours d'édition
    if (options?.excludeId && itemId === options.excludeId) continue;
    if (options?.excludeMasterId && (itemId === options.excludeMasterId || itemMasterId === options.excludeMasterId)) continue;
    if (candidate.id && itemId === candidate.id) continue;
    if (candidate.masterId && (itemId === candidate.masterId || itemMasterId === candidate.masterId)) continue;

    // Ignorer les éléments archivés ou annulés
    const itemStatus = String(it.status ?? "").toLowerCase();
    if (itemStatus === "archived" || itemStatus === "cancelled") continue;

    // Correspondance de jour ou de date
    const itemDate = it.occurrenceDate || it.occurrencedate || it.sessiondate || it.date;
    const itemWeekday = typeof it.weekday === "number" ? it.weekday : (itemDate ? fromDateOnly(itemDate).getDay() : undefined);
    const candWeekday = typeof candidate.weekday === "number" ? candidate.weekday : (candidate.occurrenceDate ? fromDateOnly(candidate.occurrenceDate).getDay() : undefined);

    if (candidate.occurrenceDate && itemDate) {
      if (candidate.occurrenceDate !== itemDate) continue;
    } else if (candWeekday !== undefined && itemWeekday !== undefined) {
      if (candWeekday !== itemWeekday) continue;
    }

    // Vérifier les bornes effectives du master s'il s'agit d'un master récurrent
    if (candidate.occurrenceDate) {
      const effStart = it.effectiveStartDate || it.effectivestartdate || it.effective_start_date;
      const effEnd = it.effectiveEndDate || it.effectiveenddate || it.effective_end_date;
      if (effStart && candidate.occurrenceDate < effStart) continue;
      if (effEnd && candidate.occurrenceDate > effEnd) continue;
    }

    // Chevauchement horaire
    const itemStart = normalizeTime(it.startTime || it.starttime);
    const itemEnd = normalizeTime(it.endTime || it.endtime);

    if (!itemStart || !itemEnd) continue;

    const overlap = !(candEnd <= itemStart || candStart >= itemEnd);
    if (!overlap) continue;

    // Vérification des 3 ressources
    const itemProfId = it.professorId ?? it.professorid;
    const candProfId = candidate.professorId && candidate.professorId !== "none" ? candidate.professorId : null;
    if (candProfId && itemProfId && itemProfId !== "none" && candProfId === itemProfId) {
      return {
        hasConflict: true,
        type: "professor",
        reason: "Conflit d'enseignant : cet enseignant est déjà engagé sur un autre cours sur ce créneau.",
        conflictingItem: it,
      };
    }

    const itemRoomId = it.roomId ?? it.roomid;
    const candRoomId = candidate.roomId && candidate.roomId !== "none" ? candidate.roomId : null;
    if (candRoomId && itemRoomId && itemRoomId !== "none" && candRoomId === itemRoomId) {
      return {
        hasConflict: true,
        type: "room",
        reason: "Conflit de salle : cette salle est déjà occupée par un autre cours sur ce créneau.",
        conflictingItem: it,
      };
    }

    const itemGroupId = it.groupId ?? it.groupid;
    if (candidate.groupId && itemGroupId && candidate.groupId === itemGroupId) {
      return {
        hasConflict: true,
        type: "group",
        reason: "Conflit de classe : cette classe a déjà un cours programmé sur ce créneau.",
        conflictingItem: it,
      };
    }
  }

  return { hasConflict: false };
}

export type ExpandOptions = {
  weekStart: string;
  daysCount?: number;
  exceptions?: (SessionException | Record<string, any>)[];
  groupId?: string | null;
  professorId?: string | null;
  roomId?: string | null;
  modules?: { id: string; name: string }[];
  groups?: { id: string; name: string; moduleid?: string; moduleName?: string }[];
  rooms?: { id: string; name: string; capacity?: number }[];
  professors?: { id: string; name: string }[];
};

export function expandSessionMasters(
  masters: (SessionMaster | Record<string, any>)[],
  options: ExpandOptions
): SessionOccurrence[] {
  const weekStart = getWeekStart(options.weekStart);
  const daysCount = options.daysCount ?? 7;
  const exceptions = options.exceptions ?? [];
  const results: SessionOccurrence[] = [];

  const moduleMap = new Map((options.modules ?? []).map((m) => [m.id, m.name]));
  const groupMap = new Map((options.groups ?? []).map((g) => [g.id, g.name]));
  const roomMap = new Map((options.rooms ?? []).map((r) => [r.id, { name: r.name, capacity: r.capacity ?? 30 }]));
  const profMap = new Map((options.professors ?? []).map((p) => [p.id, p.name]));

  // Indexer les exceptions par masterId + date d'origine
  const excByOriginal = new Map<string, any>();

  for (const excAny of exceptions) {
    const exc = excAny as any;
    const mId = exc.masterId || exc.masterid;
    const origDate = exc.originalDate || exc.originaldate || exc.occurrenceDate || exc.occurrencedate;
    if (mId && origDate) {
      excByOriginal.set(`${mId}_${origDate}`, exc);
    }
  }

  // Ensemble des dates de la période projetée
  const targetDates: string[] = [];
  for (let i = 0; i < daysCount; i++) {
    targetDates.push(addDays(weekStart, i));
  }
  const targetDateSet = new Set(targetDates);

  for (const dateStr of targetDates) {
    const dow = fromDateOnly(dateStr).getDay();

    for (const rawMasterAny of masters) {
      const rawMaster = rawMasterAny as any;
      const master = {
        id: rawMaster.id,
        seriesKey: rawMaster.seriesKey || rawMaster.serieskey || `series_${rawMaster.id?.slice(0, 8)}`,
        parentMasterId: rawMaster.parentMasterId || rawMaster.parentmasterid || null,
        moduleId: rawMaster.moduleId || rawMaster.moduleid || "",
        professorId: rawMaster.professorId || rawMaster.professorid || "",
        groupId: rawMaster.groupId || rawMaster.groupid || "",
        roomId: rawMaster.roomId || rawMaster.roomid || "",
        weekday: typeof rawMaster.weekday === "number" ? rawMaster.weekday : dow,
        startTime: normalizeTime(rawMaster.startTime || rawMaster.starttime),
        endTime: normalizeTime(rawMaster.endTime || rawMaster.endtime),
        effectiveStartDate: rawMaster.effectiveStartDate || rawMaster.effectivestartdate || rawMaster.effective_start_date || "",
        effectiveEndDate: rawMaster.effectiveEndDate || rawMaster.effectiveenddate || rawMaster.effective_end_date || null,
        status: rawMaster.status || "active",
        moduleName: rawMaster.moduleName || rawMaster.modulename || "",
        professorName: rawMaster.professorName || rawMaster.professorname || "",
        groupName: rawMaster.groupName || rawMaster.groupname || "",
        roomName: rawMaster.roomName || rawMaster.roomname || "",
      };

      if (master.status === "archived") continue;
      if (master.weekday !== dow) continue;

      // Filtre groupe si demandé
      if (options.groupId && master.groupId !== options.groupId) continue;
      if (options.professorId && master.professorId !== options.professorId) continue;
      if (options.roomId && master.roomId !== options.roomId) continue;

      // Bornes effectives
      if (master.effectiveStartDate && dateStr < master.effectiveStartDate) continue;
      if (master.effectiveEndDate && dateStr > master.effectiveEndDate) continue;

      // Vérifier les exceptions sur cette occurrence
      const excKey = `${master.id}_${dateStr}`;
      const exc = excByOriginal.get(excKey);

      if (exc) {
        if (exc.type === "deleted") {
          // Occurrence supprimée
          continue;
        }

        if (exc.type === "modified") {
          const occDate = exc.overrideDate || exc.overridedate || dateStr;
          // Si l'occurrence est déplacée à une autre date en dehors de cette semaine, elle n'apparaît pas ici
          if (occDate !== dateStr) continue;

          const sTime = normalizeTime(exc.overrideStartTime || exc.overridestarttime || master.startTime);
          const eTime = normalizeTime(exc.overrideEndTime || exc.overrideendtime || master.endTime);
          const mId = exc.overrideModuleId || exc.overridemoduleid || master.moduleId;
          const pId = exc.overrideProfessorId !== undefined ? (exc.overrideProfessorId || "") : (exc.overrideprofessorid !== undefined ? (exc.overrideprofessorid || "") : master.professorId);
          const gId = exc.overrideGroupId || exc.overridegroupid || master.groupId;
          const rId = exc.overrideRoomId || exc.overrideroomid || master.roomId;

          const rInfo = roomMap.get(rId);
          const modName = (mId !== master.moduleId ? moduleMap.get(mId) : (master.moduleName || moduleMap.get(mId))) || "Matière";
          const profName = (pId !== master.professorId ? profMap.get(pId) : (master.professorName || profMap.get(pId))) || (pId ? "Enseignant" : "Sans enseignant");
          const grpName = (gId !== master.groupId ? groupMap.get(gId) : (master.groupName || groupMap.get(gId))) || "Classe";
          const rmName = (rId !== master.roomId ? rInfo?.name : (master.roomName || rInfo?.name)) || "Salle";

          results.push({
            id: `exc_${exc.id || `${master.id}_${dateStr}`}`,
            masterId: master.id,
            seriesKey: master.seriesKey,
            occurrenceDate: occDate,
            originalDate: dateStr,
            originalStartTime: master.startTime,
            originalEndTime: master.endTime,
            startTime: sTime,
            endTime: eTime,
            moduleId: mId,
            professorId: pId,
            groupId: gId,
            roomId: rId,
            weekday: fromDateOnly(occDate).getDay(),
            status: "scheduled",
            sourceType: "exception",
            exceptionId: exc.id ?? null,
            moduleName: modName,
            professorName: profName,
            groupName: grpName,
            roomName: rmName,
            capacity: rInfo?.capacity ?? 30,
          });
          continue;
        }
      }

      // Occurrence normale basée sur le master
      const rInfo = roomMap.get(master.roomId);
      results.push({
        id: `occ_${master.id}_${dateStr}`,
        masterId: master.id,
        seriesKey: master.seriesKey,
        occurrenceDate: dateStr,
        originalDate: dateStr,
        originalStartTime: master.startTime,
        originalEndTime: master.endTime,
        startTime: master.startTime,
        endTime: master.endTime,
        moduleId: master.moduleId,
        professorId: master.professorId,
        groupId: master.groupId,
        roomId: master.roomId,
        weekday: master.weekday,
        status: "scheduled",
        sourceType: "master",
        exceptionId: null,
        moduleName: master.moduleName || moduleMap.get(master.moduleId) || "Matière",
        professorName: master.professorName || profMap.get(master.professorId) || (master.professorId ? "Enseignant" : "Sans enseignant"),
        groupName: master.groupName || groupMap.get(master.groupId) || "Classe",
        roomName: master.roomName || rInfo?.name || "Salle",
        capacity: rInfo?.capacity ?? 30,
      });
    }
  }

  // Traiter les exceptions "modified" déplacées depuis une date hors de la période vers l'une des dates de la période
  for (const excAny of exceptions) {
    const exc = excAny as any;
    if (exc.type !== "modified") continue;
    const ovDate = exc.overrideDate || exc.overridedate;
    const origDate = exc.originalDate || exc.originaldate;
    if (!ovDate || !targetDateSet.has(ovDate) || origDate === ovDate) continue;

    // Vérifier si cette occurrence n'a pas déjà été ajoutée
    const excId = `exc_${exc.id || `${exc.masterId}_${origDate}`}`;
    if (results.some((r) => r.id === excId)) continue;

    const masterAny = masters.find((m: any) => m.id === (exc.masterId || exc.masterid));
    if (!masterAny || masterAny.status === "archived") continue;
    const master = masterAny as any;

    const sTime = normalizeTime(exc.overrideStartTime || exc.overridestarttime || master.startTime || master.starttime);
    const eTime = normalizeTime(exc.overrideEndTime || exc.overrideendtime || master.endTime || master.endtime);
    const mId = exc.overrideModuleId || exc.overridemoduleid || master.moduleId || master.moduleid;
    const pId = exc.overrideProfessorId !== undefined ? (exc.overrideProfessorId || "") : (exc.overrideprofessorid !== undefined ? (exc.overrideprofessorid || "") : (master.professorId || master.professorid || ""));
    const gId = exc.overrideGroupId || exc.overridegroupid || master.groupId || master.groupid;
    const rId = exc.overrideRoomId || exc.overrideroomid || master.roomId || master.roomid;

    if (options.groupId && gId !== options.groupId) continue;
    if (options.professorId && pId !== options.professorId) continue;
    if (options.roomId && rId !== options.roomId) continue;

    const rInfo = roomMap.get(rId);
    const modName = (mId !== (master.moduleId || master.moduleid) ? moduleMap.get(mId) : (master.moduleName || moduleMap.get(mId))) || "Matière";
    const profName = (pId !== (master.professorId || master.professorid) ? profMap.get(pId) : (master.professorName || profMap.get(pId))) || (pId ? "Enseignant" : "Sans enseignant");
    const grpName = (gId !== (master.groupId || master.groupid) ? groupMap.get(gId) : (master.groupName || groupMap.get(gId))) || "Classe";
    const rmName = (rId !== (master.roomId || master.roomid) ? rInfo?.name : (master.roomName || rInfo?.name)) || "Salle";

    results.push({
      id: excId,
      masterId: master.id,
      seriesKey: master.seriesKey || master.serieskey || "",
      occurrenceDate: ovDate,
      originalDate: origDate,
      originalStartTime: normalizeTime(master.startTime || master.starttime),
      originalEndTime: normalizeTime(master.endTime || master.endtime),
      startTime: sTime,
      endTime: eTime,
      moduleId: mId,
      professorId: pId,
      groupId: gId,
      roomId: rId,
      weekday: fromDateOnly(ovDate).getDay(),
      status: "scheduled",
      sourceType: "exception",
      exceptionId: exc.id ?? null,
      moduleName: modName,
      professorName: profName,
      groupName: grpName,
      roomName: rmName,
      capacity: rInfo?.capacity ?? 30,
    });
  }

  // Tri chronologique : date d'occurrence, puis heure de début
  return results.sort((a, b) => {
    if (a.occurrenceDate !== b.occurrenceDate) {
      return a.occurrenceDate.localeCompare(b.occurrenceDate);
    }
    return a.startTime.localeCompare(b.startTime);
  });
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
    const prevDateStr = addDays(input.fromDate, -1);

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
