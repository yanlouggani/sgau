"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/browser";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  getWeekStart,
  addWeeks,
  weekdayOnOrAfter,
  occurrenceDay,
  normalizeTime,
  cellKey,
  toLocalDateStr,
  projectWeek,
  createSeries,
  editOccurrence,
  deleteOccurrence,
  editSeriesFromDate,
  deleteSeriesFromDate,
  archiveSeries,
  type SessionOccurrence,
  type SessionErrorCode,
  type SessionResult,
} from "@/lib/session-masters";
import { validateSessionAssignmentAction } from "@/lib/actions/schedule-actions";
import type { TimeSlot } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Clock,
  Users,
  GraduationCap,
  Grid3X3,
  Loader2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Phone,
  CheckCircle,
  AlertCircle,
  UserCheck,
  Search,
  Download,
  X,
  Building2,
  Trash2,
  Archive,
  CalendarX2,
  History,
  Move,
  CheckCircle2,
  Ban,
  ExternalLink,
  BookOpen,
  LayoutGrid,
  ListFilter,
} from "lucide-react";
import { toast } from "sonner";
import { MascotHeader } from "@/components/mascot/MascotHeader";
import { EmptyState } from "@/components/mascot/EmptyState";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { fr } from "date-fns/locale";
import Link from "next/link";

const DAYS = [
  { value: 0, label: "Dim" },
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Jeu" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sam" },
];

const COLORS = ["#6d28d9", "#3b82f6", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899", "#14b8a6"];

type Room = { id: string; name: string };
type GroupItem = { id: string; name: string; moduleid: string; moduleName: string };
type Professor = { id: string; name: string };

function getModuleColor(moduleid: string | undefined): string {
  const id = moduleid ?? "";
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash << 5) - hash + id.charCodeAt(i);
  return COLORS[Math.abs(hash) % COLORS.length];
}

const ERROR_TITLES: Record<SessionErrorCode, string> = {
  CONFLICT_TEACHER: "Conflit enseignant",
  CONFLICT_ROOM: "Conflit salle",
  CONFLICT_GROUP: "Conflit classe",
  SERIES_NOT_FOUND: "Série introuvable",
  OCCURRENCE_NOT_FOUND: "Occurrence introuvable",
  INVALID_SCOPE: "Demande invalide",
  PAST_OCCURRENCE_LOCKED: "Séance passée verrouillée",
  FORBIDDEN: "Accès refusé",
  UNKNOWN: "Erreur",
};

function sessionToast<T>(res: SessionResult<T>, successMessage: string) {
  if (res.ok) {
    toast.success(successMessage);
    return true;
  }
  toast.error(ERROR_TITLES[res.code] ?? "Erreur", { description: res.message });
  return false;
}

function isPast(dateStr: string, time: string) {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(dateStr + "T00:00:00");
  d.setHours(h, m, 0, 0);
  return d < new Date();
}

/* ═══════════════════ MINI CALENDAR ═══════════════════ */

function MiniCalendar({
  currentWeekStart,
  onSelectWeek,
  onClose,
}: {
  currentWeekStart: string;
  onSelectWeek: (ws: string) => void;
  onClose: () => void;
}) {
  const [viewDate, setViewDate] = useState(new Date(currentWeekStart + "T00:00:00"));
  const monthStart = startOfMonth(viewDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(endOfMonth(viewDate), { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  return (
    <div className="absolute right-0 top-full mt-2 z-50 bg-white dark:bg-slate-900 border border-[#6d28d9]/15 rounded-2xl shadow-2xl p-4 w-[320px]">
      <div className="flex items-center justify-between mb-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-lg"
          onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs font-bold capitalize text-[#1e1b4b]">
          {format(viewDate, "MMMM yyyy", { locale: fr })}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-lg"
          onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-muted-foreground mb-1">
        {DAYS.map((d) => (
          <span key={d.value}>{d.label}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const ws = getWeekStart(day);
          const isSelected = ws === currentWeekStart;
          return (
            <button
              key={day.toISOString()}
              onClick={() => {
                onSelectWeek(ws);
                onClose();
              }}
              className={`h-7 w-7 rounded-lg text-xs font-semibold flex items-center justify-center transition-all ${
                isSelected
                  ? "bg-[#6d28d9] text-white"
                  : "hover:bg-[#6d28d9]/10 text-[#1a1a2e]"
              }`}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════ CARTE DRAGGABLE (@dnd-kit) ═══════════════════ */

function DraggableOccurrenceCard({
  occurrence,
  onEdit,
  onInspect,
  onSelectForMove,
  isMoving,
}: {
  occurrence: SessionOccurrence;
  onEdit: (occ: SessionOccurrence) => void;
  onInspect?: (occ: SessionOccurrence) => void;
  onSelectForMove: (occ: SessionOccurrence) => void;
  isMoving: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: occurrence.id,
    data: { occurrence },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 999,
      }
    : undefined;

  const color = getModuleColor(occurrence.moduleId);

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onInspect?.(occurrence);
      }}
      className={`group relative rounded-2xl border p-2.5 shadow-xs transition-all cursor-pointer active:cursor-grabbing select-none ${
        isDragging ? "opacity-30 scale-95" : ""
      } ${
        isMoving
          ? "ring-2 ring-[#6d28d9] bg-[#6d28d9]/10 animate-pulse"
          : "hover:shadow-md bg-white hover:border-[#6d28d9]/30"
      }`}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-1 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: color }}
          />
          <p className="text-xs font-extrabold text-[#1a1a2e] truncate">
            {occurrence.moduleName}
          </p>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelectForMove(occurrence);
            }}
            title="Déplacer (Tap to move)"
            className="p-1 rounded-md hover:bg-[#6d28d9]/10 text-[#6d28d9]"
          >
            <Move className="h-3 w-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(occurrence);
            }}
            title="Modifier"
            className="p-1 rounded-md hover:bg-[#6d28d9]/10 text-[#6d28d9]"
          >
            <History className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="text-[11px] text-muted-foreground space-y-0.5">
        <div className="flex items-center gap-1">
          <Users className="h-3 w-3 text-[#6d28d9]/70 shrink-0" />
          <span className="truncate">{occurrence.professorName || "Enseignant non assigné"}</span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="flex items-center gap-1">
            <Building2 className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
            {occurrence.roomName}
          </span>
          <Badge
            variant="outline"
            className="text-[9px] px-1 py-0 h-4 border-[#6d28d9]/20 text-[#6d28d9]"
          >
            {occurrence.startTime.slice(0, 5)} - {occurrence.endTime.slice(0, 5)}
          </Badge>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════ CELLULE DROPPABLE (@dnd-kit) ═══════════════════ */

function DroppableGridCell({
  cellId,
  day,
  slot,
  targetDate,
  occurrences,
  isPastCell,
  draggedOcc,
  onAddSession,
  onEditOccurrence,
  onInspectOccurrence,
  onSelectForMove,
  movingOccId,
  onTargetCellTap,
}: {
  cellId: string;
  day: number;
  slot: TimeSlot;
  targetDate: string;
  occurrences: SessionOccurrence[];
  isPastCell: boolean;
  draggedOcc: SessionOccurrence | null;
  onAddSession: (day: number, slotId: string) => void;
  onEditOccurrence: (occ: SessionOccurrence) => void;
  onInspectOccurrence?: (occ: SessionOccurrence) => void;
  onSelectForMove: (occ: SessionOccurrence) => void;
  movingOccId: string | null;
  onTargetCellTap: (day: number, slot: TimeSlot, targetDate: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: cellId,
    data: { day, slot, targetDate },
    disabled: isPastCell,
  });

  // Détection de conflit temps réel pendant le drag
  const conflict = useMemo(() => {
    if (!draggedOcc || !isOver) return null;
    // Si la séance a déjà le même créneau
    if (
      draggedOcc.weekday === day &&
      draggedOcc.startTime.slice(0, 5) === slot.starttime.slice(0, 5) &&
      draggedOcc.occurrenceDate === targetDate
    ) {
      return null;
    }

    // Vérifier si la cellule a déjà une séance
    if (occurrences.length > 0) {
      return "Une séance est déjà programmée dans ce créneau pour ce groupe.";
    }

    return null;
  }, [draggedOcc, isOver, day, slot, targetDate, occurrences]);

  const hasConflict = !!conflict;

  return (
    <td
      ref={setNodeRef}
      onClick={() => {
        if (movingOccId) {
          onTargetCellTap(day, slot, targetDate);
        } else if (!occurrences.length && !isPastCell) {
          onAddSession(day, slot.id);
        }
      }}
      className={`p-2 align-top min-h-[110px] rounded-2xl transition-all border ${
        isPastCell
          ? "bg-slate-50/70 border-slate-100 cursor-not-allowed opacity-60"
          : isOver && hasConflict
          ? "bg-rose-500/20 border-rose-500 border-2"
          : isOver && !hasConflict
          ? "bg-emerald-500/15 border-emerald-500 border-2 border-dashed"
          : movingOccId
          ? "border-[#6d28d9]/30 hover:bg-[#6d28d9]/10 cursor-pointer animate-pulse"
          : "border-[#6d28d9]/5 hover:bg-[#6d28d9]/5 cursor-pointer"
      }`}
    >
      {/* Alerte visuelle de conflit au survol */}
      {isOver && hasConflict && (
        <div className="mb-1 p-1 bg-rose-600 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-sm">
          <Ban className="h-3 w-3 shrink-0" />
          <span>Conflit détecté</span>
        </div>
      )}

      {/* Contenu de la case */}
      <div className="space-y-1.5 min-h-[70px]">
        {occurrences.map((occ) => (
          <DraggableOccurrenceCard
            key={occ.id}
            occurrence={occ}
            onEdit={onEditOccurrence}
            onInspect={onInspectOccurrence}
            onSelectForMove={onSelectForMove}
            isMoving={movingOccId === occ.id}
          />
        ))}

        {!occurrences.length && !isPastCell && (
          <div className="h-full min-h-[60px] flex items-center justify-center rounded-xl border border-dashed border-[#6d28d9]/15 text-muted-foreground opacity-0 hover:opacity-100 transition-opacity">
            <Plus className="h-4 w-4 text-[#6d28d9]" />
          </div>
        )}
      </div>
    </td>
  );
}

/* ═══════════════════ COMPOSANT PRINCIPAL ═══════════════════ */

export function ScheduleManagement({
  professors,
  groups,
  rooms,
  modules = [],
}: {
  professors: Professor[];
  groups: GroupItem[];
  rooms: Room[];
  modules?: { id: string; name: string }[];
}) {
  const supabase = createClient();
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [profGroupLinks, setProfGroupLinks] = useState<Record<string, string[]>>({});
  const [holidays, setHolidays] = useState<
    { id: string; name: string; date_start: string; date_end: string; type: string }[]
  >([]);
  const [profAbsences, setProfAbsences] = useState<
    {
      id: string;
      professorid: string;
      date_start: string;
      date_end: string;
      reason: string;
      status: string;
      replacement_professorid?: string | null;
    }[]
  >([]);

  const allModules = useMemo(() => {
    if (modules && modules.length > 0) return modules;
    const map = new Map<string, string>();
    for (const g of groups) {
      if (g.moduleid && g.moduleName) {
        map.set(g.moduleid, g.moduleName);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [modules, groups]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getWeekStart(new Date()));
  const [occurrences, setOccurrences] = useState<SessionOccurrence[]>([]);
  const [loading, setLoading] = useState(true);

  const [groupSearch, setGroupSearch] = useState("");
  const [groupSearchOpen, setGroupSearchOpen] = useState(false);
  const [miniCalOpen, setMiniCalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"group" | "professor" | "room">("group");
  const [displayMode, setDisplayMode] = useState<"grid" | "list">("grid");
  const [selectedProfessorId, setSelectedProfessorId] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");

  // État Drag & Drop (@dnd-kit)
  const [activeDragOcc, setActiveDragOcc] = useState<SessionOccurrence | null>(null);
  const [movingOcc, setMovingOcc] = useState<SessionOccurrence | null>(null);

  // Dialog Formulaire de séance
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [scope, setScope] = useState<"occurrence" | "series">("occurrence");
  const [target, setTarget] = useState<SessionOccurrence | null>(null);
  const [form, setForm] = useState({
    day: 0,
    overrideDate: "",
    professorid: "",
    roomid: "",
    timeslotid: "",
  });
  const [saving, setSaving] = useState(false);

  // Dialog Confirmation
  const [confirm, setConfirm] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    run: () => Promise<void>;
  }>({
    open: false,
    title: "",
    message: "",
    confirmLabel: "",
    run: async () => {},
  });
  const [confirmLoading, setConfirmLoading] = useState(false);

  // État Inspection Séance & Liste des Élèves
  const [inspectOcc, setInspectOcc] = useState<SessionOccurrence | null>(null);
  const [inspectStudents, setInspectStudents] = useState<
    Array<{
      id: string;
      fullName: string;
      email: string;
      parentName?: string | null;
      parentPhone?: string | null;
      paymentStatus: "paid" | "partial" | "unpaid" | "late" | "none";
      amountDue?: number;
      amountPaid?: number;
    }>
  >([]);
  const [inspectLoading, setInspectLoading] = useState(false);

  const handleInspectOccurrence = useCallback(
    async (occ: SessionOccurrence) => {
      setInspectOcc(occ);
      setInspectLoading(true);
      try {
        // Inscriptions actives dans ce groupe
        const { data: enrollments, error: enrollError } = await supabase
          .from("enrollments")
          .select("studentid")
          .eq("groupid", occ.groupId)
          .eq("status", "active");

        if (enrollError || !enrollments || enrollments.length === 0) {
          setInspectStudents([]);
          setInspectLoading(false);
          return;
        }

        const studentIds = enrollments.map((e) => e.studentid);

        // Profils élèves
        const { data: students } = await supabase
          .from("users")
          .select("id, firstname, lastname, email, parent_name, parent_phone")
          .in("id", studentIds);

        // Suivi des paiements pour le mois de la séance
        const currentMonth = occ.occurrenceDate
          ? occ.occurrenceDate.slice(0, 7)
          : new Date().toISOString().slice(0, 7);
        const { data: payments } = await supabase
          .from("student_payments")
          .select("student_id, amount_due, amount_paid, status")
          .in("student_id", studentIds)
          .eq("billing_period", currentMonth);

        const paymentMap = new Map<string, { status: string; due: number; paid: number }>();
        if (payments) {
          for (const p of payments) {
            paymentMap.set(p.student_id, {
              status: p.status,
              due: Number(p.amount_due) || 0,
              paid: Number(p.amount_paid) || 0,
            });
          }
        }

        const list = (students || []).map((s) => {
          const pm = paymentMap.get(s.id);
          return {
            id: s.id,
            fullName: `${s.firstname || ""} ${s.lastname || ""}`.trim() || s.email,
            email: s.email,
            parentName: s.parent_name,
            parentPhone: s.parent_phone,
            paymentStatus: (pm ? pm.status : "none") as
              | "paid"
              | "partial"
              | "unpaid"
              | "late"
              | "none",
            amountDue: pm?.due,
            amountPaid: pm?.paid,
          };
        });

        setInspectStudents(list);
      } catch (e) {
        console.error("Erreur inspection élèves:", e);
      } finally {
        setInspectLoading(false);
      }
    },
    [supabase]
  );

  const gridRef = useRef<HTMLDivElement>(null);
  const groupSearchRef = useRef<HTMLDivElement>(null);

  // Config des capteurs DnD avec contrainte de distance pour autoriser les clics simples
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Chargement des projections
  const loadProjection = useCallback(
    async (ws: string) => {
      setLoading(true);
      const res = await projectWeek(supabase, ws, null);
      if (res.ok) {
        const resolved = res.data.map((o) => ({
          ...o,
          moduleName:
            o.moduleName ||
            allModules.find((m) => m.id === o.moduleId)?.name ||
            groups.find((g) => g.id === o.groupId)?.moduleName ||
            "Matière",
          groupName: o.groupName || groups.find((g) => g.id === o.groupId)?.name || "Classe",
          roomName: o.roomName || rooms.find((r) => r.id === o.roomId)?.name || "Salle",
          professorName:
            o.professorName ||
            professors.find((p) => p.id === o.professorId)?.name ||
            (o.professorId ? "Enseignant" : "Sans enseignant"),
        }));
        setOccurrences(resolved);
      } else {
        toast.error(ERROR_TITLES[res.code] ?? "Erreur", { description: res.message });
      }
      setLoading(false);
    },
    [supabase, allModules, groups, rooms, professors]
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      const [{ data: slots }, { data: hol }, { data: abs }, { data: pgData }] =
        await Promise.all([
          supabase.from("time_slots").select("*").order("orderindex"),
          supabase.from("holidays").select("*").eq("isactive", true),
          supabase.from("professor_absences").select("*").eq("status", "approved"),
          supabase.from("professor_groups").select("professorid, groupid"),
        ]);
      if (!active) return;
      if (slots) setTimeSlots(slots as TimeSlot[]);
      if (hol) setHolidays(hol);
      if (abs) setProfAbsences(abs);
      if (pgData) {
        const map: Record<string, string[]> = {};
        for (const r of pgData as Record<string, unknown>[]) {
          const pid = r.professorid as string;
          const gid = r.groupid as string;
          if (!map[gid]) map[gid] = [];
          map[gid].push(pid);
        }
        setProfGroupLinks(map);
      }
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    let active = true;
    void (async () => {
      await loadProjection(currentWeekStart);
      if (!active) return;
    })();
    return () => {
      active = false;
    };
  }, [loadProjection, currentWeekStart]);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  const filteredGroups = useMemo(() => {
    if (!groupSearch) return groups;
    const q = groupSearch.toLowerCase();
    return groups.filter(
      (g) => g.name.toLowerCase().includes(q) || g.moduleName.toLowerCase().includes(q)
    );
  }, [groups, groupSearch]);

  const visibleOccurrences = useMemo(() => {
    if (viewMode === "professor")
      return occurrences.filter((o) => o.professorId === selectedProfessorId);
    if (viewMode === "room") return occurrences.filter((o) => o.roomId === selectedRoomId);
    return occurrences.filter((o) => o.groupId === selectedGroupId);
  }, [viewMode, occurrences, selectedProfessorId, selectedRoomId, selectedGroupId]);

  const cellMap = useMemo(() => {
    const m: Record<string, SessionOccurrence[]> = {};
    for (const o of visibleOccurrences) {
      const key = cellKey(occurrenceDay(o), o.startTime);
      if (!m[key]) m[key] = [];
      m[key].push(o);
    }
    return m;
  }, [visibleOccurrences]);

  const sortedSlots = useMemo(() => {
    const seen = new Set<string>();
    const slots: TimeSlot[] = [];
    for (const ts of timeSlots) {
      if (!seen.has(ts.starttime)) {
        seen.add(ts.starttime);
        slots.push(ts);
      }
    }
    return slots.sort((a, b) => a.orderindex - b.orderindex);
  }, [timeSlots]);

  const weekLabel = useMemo(() => {
    const s = new Date(currentWeekStart + "T00:00:00");
    const e = new Date(s);
    e.setDate(e.getDate() + 6);
    const sameYear = s.getFullYear() === e.getFullYear();
    const startFmt = format(s, "EEEE d MMMM" + (sameYear ? "" : " yyyy"), { locale: fr });
    const endFmt = format(e, "EEEE d MMMM yyyy", { locale: fr });
    return `du ${startFmt} au ${endFmt}`;
  }, [currentWeekStart]);

  const todayDow = new Date().getDay();

  const weekDates = useMemo(
    () =>
      DAYS.map((day) => {
        const idx = day.value;
        const d = new Date(currentWeekStart + "T00:00:00");
        d.setDate(d.getDate() + idx);
        return toLocalDateStr(d);
      }),
    [currentWeekStart]
  );

  const isCurrentWeek = () => getWeekStart(new Date()) === currentWeekStart;

  const getSlot = (startTime: string) =>
    timeSlots.find((ts) => ts.starttime.slice(0, 5) === normalizeTime(startTime));

  // Enseignants assignés à un groupe
  const availableProfessorsFor = useCallback(
    (groupId: string, include?: string | null) => {
      const pids = profGroupLinks[groupId] ?? [];
      const set = new Set(pids);
      if (include) set.add(include);
      return professors.filter((p) => set.has(p.id));
    },
    [profGroupLinks, professors]
  );

  // Salles disponibles sur un créneau donné
  const availableRoomsForSlot = useCallback(
    (weekday: number, startTime: string) => {
      const occupiedRoomIds = new Set(
        occurrences
          .filter(
            (o) =>
              o.weekday === weekday &&
              o.startTime.slice(0, 5) === startTime.slice(0, 5)
          )
          .map((o) => o.roomId)
      );

      return rooms.map((r) => ({
        ...r,
        isOccupied: occupiedRoomIds.has(r.id),
      }));
    },
    [occurrences, rooms]
  );

  /* ----------------- PRÉ-REMPLISSAGE INTELLIGENT DU FORMULAIRE ----------------- */
  const openAdd = async (day: number, slotId: string) => {
    if (viewMode !== "group" || !selectedGroupId) {
      toast.info("Sélectionnez une classe pour ajouter un cours.");
      return;
    }
    if (currentWeekStart < getWeekStart(new Date())) {
      toast.error("Semaine passée verrouillée : impossible d'ajouter un cours.");
      return;
    }

    // Vérification informative (n'empêche pas l'ajout d'une séance sans enseignant)
    if (selectedGroup) {
      const validation = await validateSessionAssignmentAction(selectedGroup.moduleid);
      if (!validation.valid && validation.assignedProfessorCount === 0) {
        toast.info("Information", {
          description: "Cette matière n'a pas encore d'enseignant assigné. Vous pouvez créer la séance sans enseignant.",
        });
      }
    }

    const slot = timeSlots.find((ts) => ts.id === slotId);
    const assignedProfs = availableProfessorsFor(selectedGroupId);

    // Pré-remplissage intelligent : si 1 seul enseignant assigné, le choisir automatiquement
    const autoProfId = assignedProfs.length === 1 ? assignedProfs[0].id : "";

    // Salles : suggérer la première salle libre
    let autoRoomId = "";
    if (slot) {
      const roomsWithStatus = availableRoomsForSlot(day, slot.starttime);
      const firstFree = roomsWithStatus.find((r) => !r.isOccupied);
      if (firstFree) autoRoomId = firstFree.id;
    }

    setMode("create");
    setTarget(null);
    setForm({
      day,
      overrideDate: "",
      professorid: autoProfId,
      roomid: autoRoomId,
      timeslotid: slotId,
    });
    setDialogOpen(true);
  };

  const openEdit = (occ: SessionOccurrence) => {
    const slot = getSlot(occ.startTime);
    setMode("edit");
    setScope("occurrence");
    setTarget(occ);
    setForm({
      day: occ.weekday,
      overrideDate: occ.occurrenceDate,
      professorid: occ.professorId || "",
      roomid: occ.roomId,
      timeslotid: slot?.id ?? "",
    });
    setDialogOpen(true);
  };

  /* ----------------- GESTION DE LA SUPPRESSION ----------------- */
  const handleDeleteOccurrence = (occ: SessionOccurrence) => {
    setConfirm({
      open: true,
      title: "Supprimer cette séance ?",
      message: `Cette action supprimera uniquement la séance du ${occ.occurrenceDate}. Les autres séances de la série resteront programmées.`,
      confirmLabel: "Supprimer la séance",
      run: async () => {
        const res = await deleteOccurrence(supabase, {
          masterId: occ.masterId,
          occurrenceDate: occ.occurrenceDate,
        });
        if (sessionToast(res, "Séance supprimée")) {
          setDialogOpen(false);
          setConfirm((prev) => ({ ...prev, open: false }));
          await loadProjection(currentWeekStart);
        }
      },
    });
  };

  const handleDeleteSeriesFromDate = (occ: SessionOccurrence) => {
    setConfirm({
      open: true,
      title: `Supprimer la série à partir du ${occ.occurrenceDate} ?`,
      message: `Toutes les séances de cette série prévues à partir du ${occ.occurrenceDate} seront supprimées. TOUTES les séances antérieures à cette date resteront strictement conservées dans l'historique.`,
      confirmLabel: "Supprimer à partir de cette date",
      run: async () => {
        const res = await deleteSeriesFromDate(supabase, {
          masterId: occ.masterId,
          fromDate: occ.originalDate || occ.occurrenceDate,
        });
        if (sessionToast(res, "Série supprimée à partir de cette date")) {
          setDialogOpen(false);
          setConfirm((prev) => ({ ...prev, open: false }));
          await loadProjection(currentWeekStart);
        }
      },
    });
  };

  const handleArchiveSeries = (occ: SessionOccurrence) => {
    setConfirm({
      open: true,
      title: "Archiver toute la série ?",
      message: `Cette action supprimera définitivement toutes les occurrences futures de cette série de cours.`,
      confirmLabel: "Archiver toute la série",
      run: async () => {
        const res = await archiveSeries(supabase, {
          masterId: occ.masterId,
        });
        if (sessionToast(res, "Série archivée")) {
          setDialogOpen(false);
          setConfirm((prev) => ({ ...prev, open: false }));
          await loadProjection(currentWeekStart);
        }
      },
    });
  };

  /* ----------------- GESTION DU DRAG & DROP (@dnd-kit) ----------------- */
  const handleDragStart = (e: DragStartEvent) => {
    const occ = e.active.data.current?.occurrence as SessionOccurrence | undefined;
    if (occ) {
      setActiveDragOcc(occ);
    }
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveDragOcc(null);
    const { active, over } = e;
    if (!over) return;

    const occ = active.data.current?.occurrence as SessionOccurrence | undefined;
    const targetData = over.data.current as
      | { day: number; slot: TimeSlot; targetDate: string }
      | undefined;

    if (!occ || !targetData) return;

    const { day, slot, targetDate } = targetData;

    // Ne pas déplacer sur une date passée
    if (isPast(targetDate, slot.starttime)) {
      toast.error("Impossible de déplacer une séance vers un créneau passé.");
      return;
    }

    // Même emplacement
    if (
      occ.weekday === day &&
      getSlot(occ.startTime)?.id === slot.id &&
      occ.occurrenceDate === targetDate
    ) {
      return;
    }

    // Mise à jour optimiste immédiate
    const previousOccurrences = [...occurrences];
    setOccurrences((prev) =>
      prev.map((o) =>
        o.id === occ.id
          ? {
              ...o,
              weekday: day,
              occurrenceDate: targetDate,
              startTime: slot.starttime,
              endTime: slot.endtime,
            }
          : o
      )
    );

    try {
      const res = await editOccurrence(supabase, {
        masterId: occ.masterId,
        occurrenceDate: occ.occurrenceDate,
        overrideDate: targetDate,
        startTime: slot.starttime,
        endTime: slot.endtime,
        professorId: occ.professorId,
        roomId: occ.roomId,
      });

      if (!res.ok) {
        // Rollback
        setOccurrences(previousOccurrences);
        sessionToast(res, "Déplacement impossible");
      } else {
        toast.success("Séance déplacée avec succès !");
        await loadProjection(currentWeekStart);
      }
    } catch {
      setOccurrences(previousOccurrences);
      toast.error("Erreur de connexion lors du déplacement.");
    }
  };

  // Mode Tap-to-move pour mobile / tablette
  const handleSelectForMove = (occ: SessionOccurrence) => {
    if (movingOcc?.id === occ.id) {
      setMovingOcc(null);
    } else {
      setMovingOcc(occ);
      toast.info("Touchez maintenant le créneau cible pour déplacer cette séance.");
    }
  };

  const handleTargetCellTap = async (day: number, slot: TimeSlot, targetDate: string) => {
    if (!movingOcc) return;
    const occ = movingOcc;
    setMovingOcc(null);

    if (isPast(targetDate, slot.starttime)) {
      toast.error("Impossible de déplacer vers un créneau passé.");
      return;
    }

    const previousOccurrences = [...occurrences];
    setOccurrences((prev) =>
      prev.map((o) =>
        o.id === occ.id
          ? {
              ...o,
              weekday: day,
              occurrenceDate: targetDate,
              startTime: slot.starttime,
              endTime: slot.endtime,
            }
          : o
      )
    );

    const res = await editOccurrence(supabase, {
      masterId: occ.masterId,
      occurrenceDate: occ.occurrenceDate,
      overrideDate: targetDate,
      startTime: slot.starttime,
      endTime: slot.endtime,
      professorId: occ.professorId,
      roomId: occ.roomId,
    });

    if (!res.ok) {
      setOccurrences(previousOccurrences);
      sessionToast(res, "Déplacement impossible");
    } else {
      toast.success("Séance déplacée avec succès !");
      await loadProjection(currentWeekStart);
    }
  };

  /* ----------------- ENREGISTREMENT MODAL CLASSIQUE ----------------- */
  const handleSave = async () => {
    if (!selectedGroup && mode === "create") {
      toast.error("Aucune classe sélectionnée");
      return;
    }
    const slot = timeSlots.find((ts) => ts.id === form.timeslotid);
    if (!slot) {
      toast.error("Sélectionnez un créneau");
      return;
    }
    if (!form.roomid) {
      toast.error("Sélectionnez une salle");
      return;
    }

    const effectiveProfId = form.professorid && form.professorid !== "none" ? form.professorid : null;

    // Si un enseignant est sélectionné, valider son affectation
    if (mode === "create" && selectedGroup && effectiveProfId) {
      const val = await validateSessionAssignmentAction(selectedGroup.moduleid, effectiveProfId);
      if (!val.valid) {
        toast.error("Affectation refusée", { description: val.error });
        return;
      }
    }

    setSaving(true);
    try {
      if (mode === "create" && selectedGroup) {
        const startDate = weekdayOnOrAfter(currentWeekStart, form.day);
        const res = await createSeries(supabase, {
          moduleId: selectedGroup.moduleid,
          professorId: effectiveProfId,
          groupId: selectedGroupId,
          roomId: form.roomid,
          weekday: form.day,
          startTime: slot.starttime,
          endTime: slot.endtime,
          effectiveStartDate: startDate,
        });
        if (sessionToast(res, "Série de cours créée")) {
          setDialogOpen(false);
          await loadProjection(currentWeekStart);
        }
        return;
      }

      if (mode === "edit" && target) {
        if (scope === "occurrence") {
          const res = await editOccurrence(supabase, {
            masterId: target.masterId,
            occurrenceDate: target.occurrenceDate,
            overrideDate: form.overrideDate || null,
            startTime: slot.starttime,
            endTime: slot.endtime,
            professorId: effectiveProfId,
            roomId: form.roomid,
          });
          if (sessionToast(res, "Occurrence mise à jour")) {
            setDialogOpen(false);
            await loadProjection(currentWeekStart);
          }
          return;
        }

        const res = await editSeriesFromDate(supabase, {
          masterId: target.masterId,
          fromDate: target.originalDate,
          professorId: effectiveProfId,
          roomId: form.roomid,
          weekday: form.day,
          startTime: slot.starttime,
          endTime: slot.endtime,
        });
        if (sessionToast(res, "Série mise à jour à partir de cette date")) {
          setDialogOpen(false);
          await loadProjection(currentWeekStart);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleExportPDF = async () => {
    const html2canvas = (await import("html2canvas")).default;
    const { default: jsPDF } = await import("jspdf");
    if (!gridRef.current) return;
    toast.info("Génération du PDF...");
    try {
      const canvas = await html2canvas(gridRef.current, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, "PNG", 0, 10, pdfWidth, pdfHeight);
      pdf.setFontSize(14);
      pdf.text(
        `Emploi du temps - ${selectedGroup?.name ?? "Centre"} - ${weekLabel}`,
        10,
        8
      );
      pdf.save(`edt-${currentWeekStart}.pdf`);
      toast.success("PDF exporté");
    } catch (err) {
      toast.error("Erreur PDF", { description: String(err) });
    }
  };

  const dialogSlot = timeSlots.find((ts) => ts.id === form.timeslotid);
  const roomsForDialog = useMemo(() => {
    if (!dialogSlot) return rooms;
    return availableRoomsForSlot(form.day, dialogSlot.starttime);
  }, [dialogSlot, form.day, availableRoomsForSlot, rooms]);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-6 pb-10">
        <MascotHeader
          title="Emploi du Temps des Cours de Soutien"
          description="Planifiez et réorganisez les séances par glisser-déposer (@dnd-kit). Les conflits d'enseignants et de salles sont détectés visuellement en temps réel."
          pose="eureka"
          mascotMessage={
            selectedGroup
              ? `Planning de ${selectedGroup.name} (${visibleOccurrences.length} séance(s) cette semaine)`
              : "Sélectionnez une classe de soutien pour commencer !"
          }
          badge="Planning & Séances"
        />

        {/* Barre d'outils et navigation semaine */}
        <div className="flex flex-col gap-4 rounded-3xl border border-[#6d28d9]/10 bg-white p-5 shadow-xs md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            {/* Recherche de classe */}
            <div className="relative" ref={groupSearchRef}>
              <div className="relative flex items-center">
                <Search className="absolute left-3.5 h-4 w-4 text-[#6d28d9]" />
                <Input
                  placeholder="Rechercher une classe / matière…"
                  value={
                    selectedGroupId
                      ? `${groups.find((g) => g.id === selectedGroupId)?.name ?? ""} — ${groups.find((g) => g.id === selectedGroupId)?.moduleName ?? ""}`
                      : groupSearch
                  }
                  onChange={(e) => {
                    setGroupSearch(e.target.value);
                    setGroupSearchOpen(true);
                    if (selectedGroupId) setSelectedGroupId("");
                  }}
                  onFocus={() => setGroupSearchOpen(true)}
                  className="h-11 w-[290px] rounded-2xl border-[#6d28d9]/15 bg-[#f8f9fc] pl-10 pr-9 text-xs font-semibold text-[#1a1a2e] focus:border-[#6d28d9] focus:bg-white"
                />
                {selectedGroupId && (
                  <button
                    onClick={() => {
                      setSelectedGroupId("");
                      setGroupSearch("");
                      setGroupSearchOpen(true);
                    }}
                    className="absolute right-3 text-[#64748b] hover:text-[#1a1a2e]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {groupSearchOpen && (
                <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[320px] overflow-auto rounded-2xl border border-[#6d28d9]/10 bg-white p-2 shadow-xl">
                  {filteredGroups.length === 0 ? (
                    <div className="p-4 text-center text-xs font-medium text-[#64748b]">
                      Aucune classe trouvée
                    </div>
                  ) : (
                    filteredGroups.map((g) => (
                      <button
                        key={g.id}
                        className={`w-full rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition-all ${
                          g.id === selectedGroupId
                            ? "bg-[#6d28d9] text-white shadow-xs"
                            : "text-[#1a1a2e] hover:bg-[#6d28d9]/5"
                        }`}
                        onClick={() => {
                          setSelectedGroupId(g.id);
                          setGroupSearch("");
                          setGroupSearchOpen(false);
                        }}
                      >
                        <span>{g.name}</span>
                        <span
                          className={
                            g.id === selectedGroupId ? "text-white/80" : "text-[#64748b]"
                          }
                        >
                          {" "}
                          — {g.moduleName}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Bascule Grille Drag & Drop / Liste classique */}
            <div className="inline-flex rounded-2xl border border-[#6d28d9]/10 bg-[#f8f9fc] p-1">
              <button
                onClick={() => setDisplayMode("grid")}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                  displayMode === "grid"
                    ? "bg-white text-[#6d28d9] shadow-xs"
                    : "text-[#64748b] hover:text-[#1a1a2e]"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Grille Drag & Drop
              </button>
              <button
                onClick={() => setDisplayMode("list")}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                  displayMode === "list"
                    ? "bg-white text-[#6d28d9] shadow-xs"
                    : "text-[#64748b] hover:text-[#1a1a2e]"
                }`}
              >
                <ListFilter className="h-3.5 w-3.5" />
                Mode Liste
              </button>
            </div>
          </div>

          {/* Navigation Semaine */}
          <div className="flex flex-wrap items-center gap-2">
            {selectedGroupId && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPDF}
                className="h-10 rounded-2xl border-[#6d28d9]/15 text-xs font-bold text-[#6d28d9] hover:bg-[#6d28d9]/5"
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                <span>PDF</span>
              </Button>
            )}

            <div className="flex items-center rounded-2xl border border-[#6d28d9]/10 bg-[#f8f9fc] p-1 relative">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-xl text-[#6d28d9]"
                onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[180px] px-2 text-center text-xs font-extrabold text-[#1a1a2e]">
                {weekLabel}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-xl text-[#6d28d9]"
                onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              {miniCalOpen && (
                <MiniCalendar
                  currentWeekStart={currentWeekStart}
                  onSelectWeek={setCurrentWeekStart}
                  onClose={() => setMiniCalOpen(false)}
                />
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setMiniCalOpen((v) => !v)}
              className="h-10 rounded-2xl border-[#6d28d9]/15 text-xs font-bold text-[#6d28d9] hover:bg-[#6d28d9]/5"
            >
              <Calendar className="mr-1.5 h-3.5 w-3.5" />
              Calendrier
            </Button>
          </div>
        </div>

        {/* ALERTE DE SURVEILLANCE DES CONFLITS */}
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-purple-200 bg-purple-50/60 px-4 py-3 text-xs text-purple-900">
          <div className="flex items-center gap-2 font-medium">
            <Move className="h-4 w-4 text-[#6d28d9] shrink-0" />
            <span>
              <strong>Glisser-déposer actif :</strong> déplacez une séance sur une case libre. Si
              un conflit survient (enseignant ou salle occupée), la case s&apos;illumine en{" "}
              <strong className="text-rose-600">rouge</strong>.
            </span>
          </div>
          {movingOcc && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setMovingOcc(null)}
              className="h-7 text-xs text-rose-600 font-bold"
            >
              Annuler le déplacement
            </Button>
          )}
        </div>

        {/* CONTENU PRINCIPAL : Grille + Panneau Matières */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          {/* GRILLE (3/4) */}
          <div className="lg:col-span-3 space-y-4">
            {!selectedGroupId ? (
              <EmptyState
                pose="reflexion"
                title="Aucune classe sélectionnée"
                hint="Sélectionnez une classe dans le menu déroulant ou la barre de recherche pour afficher son emploi du temps."
              />
            ) : displayMode === "grid" ? (
              <div
                className="overflow-x-auto rounded-3xl border border-[#6d28d9]/10 bg-white p-4 shadow-sm"
                ref={gridRef}
              >
                <div className="min-w-[850px]">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className="sticky left-0 z-10 w-[110px] bg-white p-3 text-left text-xs font-extrabold uppercase tracking-wider text-[#6d28d9]">
                          Horaire
                        </th>
                        {DAYS.map((day, i) => {
                          const dateStr = weekDates[i];
                          const dateDisplay = new Date(dateStr + "T00:00:00").toLocaleDateString(
                            "fr-FR",
                            { day: "numeric" }
                          );
                          const isTodayDay = day.value === todayDow && isCurrentWeek();
                          return (
                            <th
                              key={day.value}
                              className="p-3 text-center text-xs font-extrabold text-[#1a1a2e]"
                            >
                              <div
                                className={`inline-flex rounded-xl px-4 py-1.5 border ${
                                  isTodayDay
                                    ? "bg-[#6d28d9]/10 border-[#6d28d9]/20 text-[#6d28d9]"
                                    : "bg-[#f8f9fc] border-[#6d28d9]/5 text-[#6d28d9]"
                                }`}
                              >
                                <span>{day.label}</span>
                                <span className="ml-1.5 text-[#64748b]">{dateDisplay}</span>
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>

                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={8} className="p-10 text-center">
                            <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#6d28d9]" />
                          </td>
                        </tr>
                      ) : sortedSlots.length === 0 ? (
                        <tr>
                          <td
                            colSpan={8}
                            className="p-10 text-center text-xs text-muted-foreground"
                          >
                            Aucun créneau horaire configuré.
                          </td>
                        </tr>
                      ) : (
                        sortedSlots.map((slotItem) => (
                          <tr key={slotItem.id} className="border-t border-[#6d28d9]/5">
                            <td className="sticky left-0 z-10 bg-white p-3 text-xs font-bold text-[#64748b]">
                              <div className="inline-flex items-center gap-1.5 rounded-xl bg-[#f3f0ff] px-2.5 py-1 text-[#6d28d9]">
                                <Clock className="h-3.5 w-3.5 shrink-0" />
                                <span>{slotItem.label}</span>
                              </div>
                            </td>

                            {DAYS.map((d, i) => {
                              const cell = cellMap[cellKey(d.value, slotItem.starttime)] ?? [];
                              const targetDate = weekDates[i];
                              const isPastCell = isPast(targetDate, slotItem.starttime);
                              const cellId = `${d.value}-${slotItem.id}`;

                              return (
                                <DroppableGridCell
                                  key={cellId}
                                  cellId={cellId}
                                  day={d.value}
                                  slot={slotItem}
                                  targetDate={targetDate}
                                  occurrences={cell}
                                  isPastCell={isPastCell}
                                  draggedOcc={activeDragOcc}
                                  onAddSession={openAdd}
                                  onEditOccurrence={openEdit}
                                  onInspectOccurrence={handleInspectOccurrence}
                                  onSelectForMove={handleSelectForMove}
                                  movingOccId={movingOcc?.id || null}
                                  onTargetCellTap={handleTargetCellTap}
                                />
                              );
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* MODE LISTE SECOURS */
              <div className="rounded-3xl border border-[#6d28d9]/10 bg-white p-5 shadow-xs space-y-3">
                <h3 className="font-bold text-sm text-[#1e1b4b]">Séances de la semaine</h3>
                {visibleOccurrences.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4">
                    Aucune séance programmée pour cette semaine.
                  </p>
                ) : (
                  visibleOccurrences.map((occ) => (
                    <div
                      key={occ.id}
                      className="flex items-center justify-between p-3 rounded-2xl border border-[#6d28d9]/10 hover:bg-[#f8f9fc] transition-colors"
                    >
                      <div>
                        <div className="font-bold text-xs text-[#1e1b4b]">
                          {occ.moduleName} ({occ.groupName})
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {occ.occurrenceDate} • {occ.startTime} - {occ.endTime} • Salle :{" "}
                          {occ.roomName} • Prof : {occ.professorName}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleInspectOccurrence(occ)}
                          className="rounded-xl h-8 text-xs font-bold border-[#6d28d9]/20 text-[#6d28d9] hover:bg-[#6d28d9]/10"
                        >
                          <Users className="h-3.5 w-3.5 mr-1" />
                          Élèves
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(occ)}
                          className="rounded-xl h-8 text-xs font-bold border-[#6d28d9]/20"
                        >
                          Modifier
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* PANNEAU LATÉRAL DES MATIÈRES & CONTRAINTES (1/4) */}
          <div className="space-y-4">
            <div className="rounded-3xl border border-[#6d28d9]/10 bg-white p-5 shadow-xs space-y-3">
              <h3 className="font-black text-sm text-[#1e1b4b] flex items-center gap-1.5">
                <BookOpen className="h-4 w-4 text-[#6d28d9]" />
                Matières Disponibles
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Règle métier : une matière sans enseignant assigné ne peut pas être planifiée.
              </p>

              <div className="space-y-2 pt-2">
                {allModules.map((m) => {
                  // Vérifier si cette matière a au moins un groupe et un enseignant rattaché
                  const matchingGroups = groups.filter((g) => g.moduleid === m.id);
                  let assignedProfCount = 0;
                  matchingGroups.forEach((g) => {
                    const profs = profGroupLinks[g.id] || [];
                    assignedProfCount += profs.length;
                  });

                  const hasProfessors = assignedProfCount > 0;

                  return (
                    <div
                      key={m.id}
                      className={`p-3 rounded-2xl border transition-all ${
                        hasProfessors
                          ? "bg-white border-[#6d28d9]/15 hover:border-[#6d28d9] shadow-xs"
                          : "bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-bold text-xs text-[#1e1b4b]">{m.name}</div>
                        {hasProfessors ? (
                          <Badge className="bg-emerald-500/15 text-emerald-700 border-none text-[10px] shrink-0">
                            {assignedProfCount} prof(s)
                          </Badge>
                        ) : (
                          <Badge className="bg-rose-500/15 text-rose-700 border-none text-[10px] shrink-0">
                            Sans enseignant
                          </Badge>
                        )}
                      </div>

                      {!hasProfessors ? (
                        <div className="mt-2 text-[10px] text-rose-600 space-y-1">
                          <p>Assignez un enseignant avant de planifier des séances.</p>
                          <Link
                            href="/professors"
                            className="inline-flex items-center gap-1 font-bold text-[#6d28d9] hover:underline"
                          >
                            Assigner un enseignant <ExternalLink className="h-2.5 w-2.5" />
                          </Link>
                        </div>
                      ) : (
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          Prête pour la planification hebdomadaire.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ---------------- OVERLAY DRAG FLOTTANT (@dnd-kit) ---------------- */}
        <DragOverlay>
          {activeDragOcc ? (
            <div className="p-3 rounded-2xl bg-white border-2 border-[#6d28d9] shadow-2xl w-48 opacity-95">
              <div className="text-xs font-black text-[#1e1b4b] truncate">
                {activeDragOcc.moduleName}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {activeDragOcc.professorName}
              </div>
              <Badge className="mt-1 bg-[#6d28d9] text-white text-[9px]">
                En déplacement...
              </Badge>
            </div>
          ) : null}
        </DragOverlay>

        {/* ---------------- DIALOG DE CRÉATION / ÉDITION INTELLIGENT ---------------- */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-[500px] rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-xl font-black text-[#1e1b4b]">
                {mode === "create" ? "Planifier une séance" : "Modifier la séance"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {mode === "create"
                  ? "Les champs ont été pré-remplis automatiquement selon le créneau cliqué."
                  : "Ajustez les détails de la séance."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              {/* Jour & Créneau */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Jour</Label>
                  <Select
                    value={String(form.day)}
                    onValueChange={(val) => setForm({ ...form, day: Number(val || 0) })}
                  >
                    <SelectTrigger className="rounded-xl h-10 border-[#6d28d9]/15">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS.map((d) => (
                        <SelectItem key={d.value} value={String(d.value)}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Créneau horaire</Label>
                  <Select
                    value={form.timeslotid}
                    onValueChange={(val) => setForm({ ...form, timeslotid: val || "" })}
                  >
                    <SelectTrigger className="rounded-xl h-10 border-[#6d28d9]/15">
                      <SelectValue placeholder="Sélectionner un créneau">
                        {sortedSlots.find((ts) => ts.id === form.timeslotid)?.label ||
                          (dialogSlot ? `${dialogSlot.starttime.slice(0, 5)} - ${dialogSlot.endtime.slice(0, 5)}` : undefined)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {sortedSlots.map((ts) => (
                        <SelectItem key={ts.id} value={ts.id}>
                          {ts.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Enseignant (optionnel, avec libellé clair "Aucun enseignant") */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold">Enseignant</Label>
                  {selectedGroupId && (
                    <span className="text-[10px] text-muted-foreground">
                      {availableProfessorsFor(selectedGroupId, form.professorid).length} assigné(s)
                    </span>
                  )}
                </div>
                <Select
                  value={form.professorid || "none"}
                  onValueChange={(val) =>
                    setForm({ ...form, professorid: val === "none" ? "" : (val || "") })
                  }
                >
                  <SelectTrigger className="rounded-xl h-10 border-[#6d28d9]/15">
                    <SelectValue placeholder="Sélectionner un enseignant (Optionnel)">
                      {!form.professorid || form.professorid === "none"
                        ? "Aucun enseignant (Optionnel)"
                        : professors.find((p) => p.id === form.professorid)?.name || "Sans enseignant"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun enseignant (Optionnel)</SelectItem>
                    {(selectedGroupId ? availableProfessorsFor(selectedGroupId, form.professorid) : professors).map(
                      (p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Salle (Salles libres triées en premier avec indicateur) */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Salle de cours *</Label>
                <Select
                  value={form.roomid}
                  onValueChange={(val) => setForm({ ...form, roomid: val || "" })}
                >
                  <SelectTrigger className="rounded-xl h-10 border-[#6d28d9]/15">
                    <SelectValue placeholder="Sélectionner une salle">
                      {rooms.find((r) => r.id === form.roomid)?.name || "Sélectionner une salle"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {roomsForDialog.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}{" "}
                        {("isOccupied" in r && r.isOccupied)
                          ? "(Occupée sur ce créneau)"
                          : "(Disponible)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Actions de suppression dans le modal d'édition */}
              {mode === "edit" && target && (
                <div className="pt-3 border-t border-[#6d28d9]/10 space-y-2">
                  <Label className="text-xs font-bold text-rose-700">Actions de suppression</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteOccurrence(target)}
                      className="rounded-xl h-8 text-xs font-bold border-rose-200 text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Cette séance uniquement
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteSeriesFromDate(target)}
                      className="rounded-xl h-8 text-xs font-bold border-amber-300 text-amber-700 hover:bg-amber-50"
                    >
                      <CalendarX2 className="h-3.5 w-3.5 mr-1" />
                      À partir du {target.occurrenceDate}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleArchiveSeries(target)}
                      className="rounded-xl h-8 text-xs font-bold text-muted-foreground hover:text-rose-600"
                    >
                      <Archive className="h-3.5 w-3.5 mr-1" />
                      Toute la série
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                className="rounded-xl font-bold"
              >
                Annuler
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-[#6d28d9] hover:bg-[#5b21b6] text-white rounded-xl font-bold gap-2"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === "create" ? "Planifier la séance" : "Enregistrer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog de confirmation de suppression */}
        <Dialog
          open={confirm.open}
          onOpenChange={(open) => setConfirm((prev) => ({ ...prev, open }))}
        >
          <DialogContent className="sm:max-w-[460px] rounded-3xl p-6">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2.5 rounded-2xl bg-rose-50 text-rose-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-black text-[#1e1b4b]">
                    {confirm.title}
                  </DialogTitle>
                </div>
              </div>
              <DialogDescription className="text-xs text-muted-foreground pt-1 leading-relaxed">
                {confirm.message}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0 mt-4">
              <Button
                variant="outline"
                onClick={() => setConfirm((prev) => ({ ...prev, open: false }))}
                className="rounded-xl font-bold"
                disabled={confirmLoading}
              >
                Annuler
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  setConfirmLoading(true);
                  try {
                    await confirm.run();
                  } finally {
                    setConfirmLoading(false);
                  }
                }}
                disabled={confirmLoading}
                className="rounded-xl font-bold gap-2 bg-rose-600 hover:bg-rose-700 text-white"
              >
                {confirmLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {confirm.confirmLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal d'inspection détaillée de la séance & liste des élèves */}
        <Dialog open={!!inspectOcc} onOpenChange={(open) => !open && setInspectOcc(null)}>
          <DialogContent className="sm:max-w-[620px] rounded-3xl p-6 max-h-[90vh] flex flex-col overflow-hidden">
            {inspectOcc && (
              <>
                <DialogHeader className="space-y-2 pb-3 border-b border-[#6d28d9]/10">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-3.5 w-3.5 rounded-full shrink-0"
                        style={{ backgroundColor: getModuleColor(inspectOcc.moduleId) }}
                      />
                      <div>
                        <DialogTitle className="text-lg font-black text-[#1e1b4b] truncate">
                          {inspectOcc.moduleName} • {inspectOcc.groupName}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground flex items-center gap-3 pt-0.5">
                          <span className="flex items-center gap-1 font-semibold text-[#6d28d9]">
                            <Calendar className="h-3.5 w-3.5" />
                            {inspectOcc.occurrenceDate}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {inspectOcc.startTime.slice(0, 5)} - {inspectOcc.endTime.slice(0, 5)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5" />
                            {inspectOcc.roomName}
                          </span>
                        </DialogDescription>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs bg-[#f8f9fc] rounded-2xl p-2.5 px-3 border border-[#6d28d9]/5">
                    <div className="flex items-center gap-2">
                      <UserCheck className="h-4 w-4 text-[#6d28d9]" />
                      <span className="font-semibold text-muted-foreground">Enseignant :</span>
                      <span className="font-bold text-[#1e1b4b]">
                        {inspectOcc.professorName || "Non assigné"}
                      </span>
                    </div>
                    <Badge variant="outline" className="border-[#6d28d9]/20 text-[#6d28d9] font-bold">
                      {inspectStudents.length} élève{inspectStudents.length > 1 ? "s" : ""} inscrit{inspectStudents.length > 1 ? "s" : ""}
                    </Badge>
                  </div>
                </DialogHeader>

                {/* Corps de la liste des élèves */}
                <div className="flex-1 overflow-y-auto py-3 space-y-2 pr-1">
                  {inspectLoading ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-7 w-7 animate-spin text-[#6d28d9]" />
                      <span className="text-xs font-semibold">Chargement de la liste des élèves et des cotisations...</span>
                    </div>
                  ) : inspectStudents.length === 0 ? (
                    <div className="py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-4">
                      <Users className="h-8 w-8 mx-auto text-slate-400 mb-2" />
                      <p className="text-xs font-bold text-slate-700">Aucun élève inscrit dans cette classe</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Vous pouvez inscrire des élèves depuis la rubrique &quot;Inscriptions&quot;.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between px-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                        <span>Élève & Coordonnées</span>
                        <span>Cotisation du mois</span>
                      </div>
                      {inspectStudents.map((st) => {
                        const initials =
                          st.fullName
                            .split(" ")
                            .map((n) => n[0])
                            .filter(Boolean)
                            .slice(0, 2)
                            .join("")
                            .toUpperCase() || "EL";

                        return (
                          <div
                            key={st.id}
                            className="flex items-center justify-between gap-3 p-2.5 rounded-2xl border border-[#6d28d9]/5 hover:bg-[#6d28d9]/5 transition-colors bg-white shadow-2xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="h-8 w-8 rounded-xl bg-[#6d28d9]/10 text-[#6d28d9] flex items-center justify-center text-xs font-black shrink-0">
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-[#1e1b4b] truncate">
                                  {st.fullName}
                                </p>
                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground truncate">
                                  {st.parentPhone ? (
                                    <a
                                      href={`tel:${st.parentPhone}`}
                                      className="flex items-center gap-0.5 text-[#6d28d9] hover:underline"
                                      title="Appeler le parent"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Phone className="h-2.5 w-2.5" />
                                      <span>{st.parentPhone}</span>
                                    </a>
                                  ) : (
                                    <span>{st.email}</span>
                                  )}
                                  {st.parentName && (
                                    <span className="text-[10px] text-slate-400">
                                      (Parent : {st.parentName})
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              {st.paymentStatus === "paid" && (
                                <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 text-[10px] font-bold gap-1">
                                  <CheckCircle className="h-2.5 w-2.5" /> À jour
                                </Badge>
                              )}
                              {st.paymentStatus === "partial" && (
                                <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30 text-[10px] font-bold gap-1">
                                  <AlertCircle className="h-2.5 w-2.5" /> Partiel (
                                  {Math.max(0, (st.amountDue || 0) - (st.amountPaid || 0))} DA)
                                </Badge>
                              )}
                              {(st.paymentStatus === "unpaid" || st.paymentStatus === "late") && (
                                <Badge className="bg-rose-500/15 text-rose-700 border-rose-500/30 text-[10px] font-bold gap-1">
                                  <AlertCircle className="h-2.5 w-2.5" /> Impayé
                                </Badge>
                              )}
                              {st.paymentStatus === "none" && (
                                <Badge variant="outline" className="text-slate-500 text-[10px]">
                                  Non facturé
                                </Badge>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <DialogFooter className="gap-2 sm:gap-2 pt-3 border-t border-[#6d28d9]/10">
                  <Link
                    href={`/secretary/dashboard?date=${inspectOcc.occurrenceDate}`}
                    className="inline-flex"
                  >
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl font-bold border-[#6d28d9]/20 text-[#6d28d9] hover:bg-[#6d28d9]/10 text-xs gap-1.5"
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      Faire l&apos;appel / Présences
                    </Button>
                  </Link>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const occ = inspectOcc;
                      setInspectOcc(null);
                      openEdit(occ);
                    }}
                    className="rounded-xl font-bold text-xs gap-1.5"
                  >
                    <History className="h-3.5 w-3.5" />
                    Modifier la séance
                  </Button>

                  <Button
                    type="button"
                    onClick={() => setInspectOcc(null)}
                    className="bg-[#6d28d9] hover:bg-[#5b21b6] text-white rounded-xl font-bold text-xs"
                  >
                    Fermer
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DndContext>
  );
}
