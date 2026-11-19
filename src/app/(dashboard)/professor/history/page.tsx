"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Clock, MapPin, Users, CalendarDays, Search, ChevronRight, GraduationCap, History,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { PageHeader } from "@/components/page-header";
import { EmptyState, LoadingState } from "@/components/mascot/EmptyState";

type Session = {
  id: string; moduleName: string; groupName: string; roomName: string;
  starttime: string; endtime: string; sessiondate: string;
  status: string; sessiontype: string;
  presentcount: number; totalstudents: number;
};

export default function ProfessorHistoryPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  const PAGE_SIZE = 50;

  const fetchPage = async (pageIndex: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data } = await supabase
      .from("sessions")
      .select("*, modules(name), groups(name), rooms(name)")
      .eq("professorid", user.id)
      .order("sessiondate", { ascending: false })
      .order("starttime", { ascending: false })
      .range(from, to);
    return data;
  };

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPage(0);
      if (data) {
        const mapped = (data as Record<string, unknown>[]).map((s) => ({
          id: s.id as string,
          moduleName: ((s.modules as Record<string, unknown> | null)?.name as string) ?? "",
          groupName: ((s.groups as Record<string, unknown> | null)?.name as string) ?? "",
          roomName: ((s.rooms as Record<string, unknown> | null)?.name as string) ?? "",
          starttime: s.starttime as string,
          endtime: s.endtime as string,
          sessiondate: s.sessiondate as string,
          status: s.status as string,
          sessiontype: s.sessiontype as string,
          presentcount: (s.presentcount as number) ?? 0,
          totalstudents: (s.totalstudents as number) ?? 0,
        }));
        setSessions(mapped);
        setPage(0);
        setHasMore(data.length === PAGE_SIZE);
      }
    } catch (err) {
      console.error("Erreur chargement historique", err);
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const next = page + 1;
      const data = await fetchPage(next);
      if (data) {
        const mapped = (data as Record<string, unknown>[]).map((s) => ({
          id: s.id as string,
          moduleName: ((s.modules as Record<string, unknown> | null)?.name as string) ?? "",
          groupName: ((s.groups as Record<string, unknown> | null)?.name as string) ?? "",
          roomName: ((s.rooms as Record<string, unknown> | null)?.name as string) ?? "",
          starttime: s.starttime as string,
          endtime: s.endtime as string,
          sessiondate: s.sessiondate as string,
          status: s.status as string,
          sessiontype: s.sessiontype as string,
          presentcount: (s.presentcount as number) ?? 0,
          totalstudents: (s.totalstudents as number) ?? 0,
        }));
        setSessions(prev => [...prev, ...mapped]);
        setPage(next);
        setHasMore(data.length === PAGE_SIZE);
      }
    } catch (err) {
      console.error(err);
    }
    setLoadingMore(false);
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!active) return;
      await loadInitial();
    })();
    return () => {
      active = false;
    };
  }, [loadInitial]);

  const filtered = sessions.filter((s) => {
    if (search) {
      const q = search.toLowerCase();
      if (!s.moduleName.toLowerCase().includes(q) && !s.groupName.toLowerCase().includes(q)) return false;
    }
    if (statusFilter && s.status?.toLowerCase() !== statusFilter) return false;
    return true;
  });

  const grouped: Record<string, Session[]> = {};
  for (const s of filtered) {
    const key = s.sessiondate;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  }

  if (loading) return <LoadingState label="Chargement de l&apos;historique..." />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Historique"
        subtitle={`${filtered.length} séance${filtered.length > 1 ? "s" : ""}`}
        icon={<History className="h-5 w-5" />}
      />

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#475569]" />
          <Input placeholder="Rechercher par module, groupe..." value={search}
            onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-sm border-[#6d28d9]/10" />
        </div>
        {["", "completed", "active", "scheduled", "cancelled"].map((s) => (
          <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" className="h-7 text-xs rounded-lg"
            onClick={() => setStatusFilter(s)}>
            {s === "" ? "Tous" : s === "active" ? "En cours" : s === "completed" ? "Terminé" : s === "scheduled" ? "Planifié" : "Annulé"}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          pose="reflexion"
          title="Aucune séance trouvée"
          hint={sessions.length === 0 ? "Commencez par planifier des séances" : "Essayez de modifier vos filtres"}
        />
      ) : (
        Object.entries(grouped).map(([date, daySessions]) => (
          <section key={date}>
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg bg-[#6d28d9]/10 p-1.5">
                <CalendarDays className="h-4 w-4 text-[#6d28d9]" />
              </div>
              <h2 className="text-sm font-bold text-[#1a1a2e]">
                {format(new Date(date + "T00:00:00"), "EEEE d MMMM yyyy", { locale: fr })}
              </h2>
              <Badge variant="secondary" className="text-[10px] font-mono bg-[#6d28d9]/10 text-[#6d28d9] border-none">{daySessions.length}</Badge>
            </div>
            <div className="space-y-2">
              {daySessions.map((s) => (
                <Card key={s.id} className="border border-[#6d28d9]/10 bg-white shadow-sm shadow-[#6d28d9]/5 overflow-hidden transition-all hover:shadow-md hover:shadow-[#6d28d9]/[0.06] hover:border-[#6d28d9]/20 cursor-pointer"
                  onClick={() => router.push(`/professor/sessions/${s.id}`)}>
                  <div className={cn("h-0.5", {
                    "bg-[#f97316]": s.status?.toLowerCase() === "active",
                    "bg-[#6d28d9]": s.status?.toLowerCase() === "scheduled",
                    "bg-slate-300": s.status?.toLowerCase() === "completed",
                    "bg-red-500": s.status?.toLowerCase() === "cancelled",
                  })} />
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className={cn("rounded-lg p-2 shrink-0", {
                          "bg-[#f97316]/10": s.status?.toLowerCase() === "active",
                          "bg-[#6d28d9]/10": s.status?.toLowerCase() === "scheduled",
                          "bg-[#f8f9fc]": s.status?.toLowerCase() === "completed",
                          "bg-red-500/10": s.status?.toLowerCase() === "cancelled",
                        })}>
                          <GraduationCap className={cn("h-4 w-4", {
                            "text-[#f97316]": s.status?.toLowerCase() === "active",
                            "text-[#6d28d9]": s.status?.toLowerCase() === "scheduled",
                            "text-[#475569]": s.status?.toLowerCase() === "completed",
                            "text-red-600": s.status?.toLowerCase() === "cancelled",
                          })} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-[#1a1a2e] truncate">{s.moduleName}</p>
                            <Badge variant="outline" className="text-[10px] font-mono shrink-0 border-[#6d28d9]/15">{s.sessiontype}</Badge>
                            <SessionLabel status={s.status} />
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-semibold text-[#475569] mt-0.5">
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{s.starttime}</span>
                            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{s.roomName}</span>
                            <span className="flex items-center gap-1"><Users className="h-3 w-3" />{s.groupName}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {s.totalstudents > 0 && (
                          <div className="text-right hidden sm:block">
                            <p className="text-sm font-semibold tabular-nums text-[#1a1a2e]">{s.presentcount}</p>
                            <p className="text-xs font-semibold text-[#475569] tabular-nums">/{s.totalstudents}</p>
                          </div>
                        )}
                        <ChevronRight className="h-4 w-4 text-[#475569]" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))
      )}

      {hasMore && filtered.length > 0 && search === "" && statusFilter === "" && (
        <div className="flex justify-center pt-4 pb-8">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore} className="rounded-xl border-[#6d28d9]/20 text-[#6d28d9] font-bold">
            {loadingMore ? "Chargement..." : "Charger plus"}
          </Button>
        </div>
      )}
    </div>
  );
}

function SessionLabel({ status }: { status: string }) {
  const k = status?.toLowerCase() ?? "";
  const styles: Record<string, string> = {
    active: "bg-[#f97316]/10 text-[#f97316] border-none",
    scheduled: "bg-[#f8f9fc] text-[#475569] font-bold border border-slate-200",
    completed: "bg-[#6d28d9]/10 text-[#6d28d9] border-none",
    cancelled: "bg-red-500/10 text-red-600 border-red-200",
  };
  const labels: Record<string, string> = {
    active: "En cours", scheduled: "Planifié", completed: "Terminé", cancelled: "Annulé",
  };
  return <Badge variant="outline" className={cn("text-[10px] rounded-full", styles[k] ?? "")}>{labels[k] ?? status}</Badge>;
}
