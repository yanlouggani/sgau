"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, XCircle, GraduationCap } from "lucide-react";
import { EmptyState, LoadingState } from "@/components/mascot/EmptyState";

type Record_ = {
  id: string; sessionid: string; sessiondate: string; starttime: string;
  moduleName: string; status: string;
};

export default function StudentAbsencesPage() {
  const [records, setRecords] = useState<Record_[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from("attendance")
      .select("*, sessions!inner(id, sessiondate, starttime, modules(name))")
      .eq("studentid", user.id)
      .in("status", ["absent", "late", "justified"])
      .order("sessiondate", { referencedTable: "sessions", ascending: false })
      .order("starttime", { referencedTable: "sessions", ascending: false })
      .limit(200);
    if (data) {
      setRecords((data as Record<string, unknown>[]).map((a) => {
        const s = a.sessions as Record<string, unknown>;
        return {
          id: a.id as string,
          sessionid: s.id as string,
          sessiondate: s.sessiondate as string,
          starttime: s.starttime as string,
          moduleName: ((s.modules as Record<string, unknown> | null)?.name as string) ?? "",
          status: a.status as string,
        };
      }));
    }
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!active) return;
      await load();
    })();
    return () => {
      active = false;
    };
  }, [load]);

  const statusBadge = (status: string) => {
    switch (status) {
      case "absent": return <Badge className="bg-red-500/10 text-red-600 border-red-200 text-xs">Absent</Badge>;
      case "late": return <Badge className="bg-amber-500/10 text-amber-600 border-amber-200 text-xs">En retard</Badge>;
      case "justified": return <Badge className="bg-[#6d28d9]/10 text-[#6d28d9] border-[#6d28d9]/25 text-xs">Justifié</Badge>;
      default: return <Badge variant="outline" className="text-xs text-muted-foreground">{status}</Badge>;
    }
  };

  const totalAbsences = records.filter((r) => r.status === "absent").length;
  const totalLate = records.filter((r) => r.status === "late").length;
  const totalJustified = records.filter((r) => r.status === "justified").length;

  if (loading) return <LoadingState label="Chargement de vos absences..." />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Absences</h1>
        <p className="text-muted-foreground">Absences et retards</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Absences</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent><p className="text-3xl font-bold text-red-600">{totalAbsences}</p></CardContent>
        </Card>
        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Retards</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent><p className="text-3xl font-bold text-amber-600">{totalLate}</p></CardContent>
        </Card>
        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Justifiés</CardTitle>
            <AlertTriangle className="h-4 w-4 text-[#6d28d9]" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-[#6d28d9]">{totalJustified}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Historique des absences</CardTitle>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <EmptyState
              compact
              pose="celebration"
              title="Aucune absence à signaler"
              hint="Continuez sur cette lancée, votre assiduité est parfaite."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Date</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Module</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Horaire</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id} className="border-b border-border/30 hover:bg-accent/30 transition-colors">
                      <td className="py-3 px-4">{r.sessiondate ? new Date(r.sessiondate).toLocaleDateString("fr-FR") : "—"}</td>
                      <td className="py-3 px-4">
                        <span className="flex items-center gap-1.5">
                          <GraduationCap className="h-3.5 w-3.5 text-primary" />
                          {r.moduleName}
                        </span>
                      </td>
                      <td className="py-3 px-4">{r.starttime ?? "—"}</td>
                      <td className="py-3 px-4">{statusBadge(r.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
