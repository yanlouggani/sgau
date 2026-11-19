"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/browser";
import { uuid } from "@/lib/uuid";
import { MascotHeader } from "@/components/mascot/MascotHeader";
import { EmptyState, LoadingState } from "@/components/mascot/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Plus,
  MoreHorizontal,
  Edit,
  Trash2,
  BookOpen,
  Loader2,
  AlertTriangle,
  Coins,
  GraduationCap,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  getLocalModulePricing,
  saveLocalModulePricing,
  type ModulePricing,
} from "@/lib/pricing";

type ModuleItem = {
  id: string;
  name: string;
  domainid?: string | null;
  domain_name?: string;
  isactive: boolean;
  price_per_session: number;
  monthly_price: number;
  level_name: string;
  category: string;
};

const LEVEL_PRESETS = [
  "Toutes classes",
  "Primaire (1AP - 5AP)",
  "CEM / Collège (1AM - 4AM / BEM)",
  "Lycée — 1re AS",
  "Lycée — 2e AS",
  "Lycée — Terminale (BAC)",
];

const CATEGORY_PRESETS = [
  "Scientifique",
  "Littéraire & Philosophie",
  "Langues Étrangères",
  "Gestion & Économie",
  "Soutien Général",
];

export default function ModulesPage() {
  const [rows, setRows] = useState<ModuleItem[]>([]);
  const [domains, setDomains] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ModuleItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ModuleItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<{
    name: string;
    domainid: string;
    level_name: string;
    category: string;
    price_per_session: number;
    monthly_price: number;
    isactive: boolean;
  }>({
    name: "",
    domainid: "",
    level_name: "Lycée — Terminale (BAC)",
    category: "Scientifique",
    price_per_session: 800,
    monthly_price: 3000,
    isactive: true,
  });

  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [modRes, domRes] = await Promise.all([
        supabase.from("modules").select("*").order("name"),
        supabase.from("domains").select("id, name").order("name"),
      ]);

      if (modRes.error) {
        setError(modRes.error.message);
        setLoading(false);
        return;
      }

      const dm = new Map(domRes.data?.map((d: { id: string; name: string }) => [d.id, d.name]) ?? []);
      setDomains(domRes.data ?? []);

      const list: ModuleItem[] = (modRes.data ?? []).map((m: Record<string, unknown>) => {
        const mId = m.id as string;
        const localPricing = getLocalModulePricing(mId);

        return {
          id: mId,
          name: m.name as string,
          domainid: (m.domainid as string) || null,
          domain_name: dm.get(m.domainid as string),
          isactive: (m.isactive as boolean) ?? true,
          price_per_session:
            Number(m.price_per_session) || localPricing.price_per_session || 800,
          monthly_price:
            Number(m.monthly_price) || localPricing.monthly_price || 3000,
          level_name:
            (m.level_name as string) || localPricing.level_name || "Toutes classes",
          category:
            (m.category as string) || localPricing.category || "Scientifique",
        };
      });

      setRows(list);
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setEditing(null);
    setForm({
      name: "",
      domainid: domains[0]?.id ?? "",
      level_name: "Lycée — Terminale (BAC)",
      category: "Scientifique",
      price_per_session: 800,
      monthly_price: 3000,
      isactive: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (r: ModuleItem) => {
    setEditing(r);
    setForm({
      name: r.name,
      domainid: r.domainid || "",
      level_name: r.level_name || "Toutes classes",
      category: r.category || "Scientifique",
      price_per_session: r.price_per_session || 800,
      monthly_price: r.monthly_price || 3000,
      isactive: r.isactive,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Veuillez saisir un nom de matière");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        domainid: form.domainid || null,
        isactive: form.isactive,
        price_per_session: Number(form.price_per_session),
        monthly_price: Number(form.monthly_price),
        level_name: form.level_name,
        category: form.category,
      };

      if (editing) {
        // Tentative d'update complet
        let updateRes = await supabase.from("modules").update(payload).eq("id", editing.id);

        if (updateRes.error && updateRes.error.message.includes("column")) {
          // Fallback colonnes standard
          updateRes = await supabase
            .from("modules")
            .update({
              name: form.name.trim(),
              domainid: form.domainid || null,
              isactive: form.isactive,
            })
            .eq("id", editing.id);
        }

        if (updateRes.error) throw updateRes.error;

        // Sauvegarder dans le cache local de tarification
        saveLocalModulePricing(editing.id, {
          price_per_session: Number(form.price_per_session),
          monthly_price: Number(form.monthly_price),
          level_name: form.level_name,
          category: form.category,
        });

        toast.success("Matière et tarifs mis à jour");
      } else {
        const id = uuid();
        let insertRes = await supabase.from("modules").insert({ id, ...payload });

        if (insertRes.error && insertRes.error.message.includes("column")) {
          insertRes = await supabase.from("modules").insert({
            id,
            name: form.name.trim(),
            domainid: form.domainid || null,
            isactive: form.isactive,
          });
        }

        if (insertRes.error) throw insertRes.error;

        saveLocalModulePricing(id, {
          price_per_session: Number(form.price_per_session),
          monthly_price: Number(form.monthly_price),
          level_name: form.level_name,
          category: form.category,
        });

        toast.success("Matière créée avec succès");
      }

      setDialogOpen(false);
      load();
    } catch (err) {
      toast.error("Erreur lors de l'enregistrement", { description: String(err) });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error: err } = await supabase.from("modules").delete().eq("id", deleteTarget.id);
      if (err) throw err;
      setRows((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      toast.success("Matière supprimée");
      setDeleteTarget(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("foreign key") || msg.includes("violates")) {
        toast.error("Impossible de supprimer : des groupes ou séances sont rattachés à cette matière.");
      } else {
        toast.error("Erreur de suppression", { description: msg });
      }
    } finally {
      setDeleting(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.level_name.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
    );
  }, [rows, search]);

  if (loading) return <LoadingState label="Chargement des matières et grilles tarifaires..." />;

  return (
    <div className="space-y-8 pb-10">
      <MascotHeader
        title="Matières & Tarifs des Cours de Soutien"
        description="Catalogue des matières enseignées, niveaux scolaires associés et tarifs (prix par séance et forfait mensuel en DZD)."
        pose="eureka"
        mascotMessage={`${rows.length} matière(s) configurée(s)`}
        badge="Catalogue & Tarifs"
      >
        <Button
          onClick={openAdd}
          className="h-11 rounded-2xl bg-[#6d28d9] hover:bg-[#5b21b6] px-5 font-bold text-white shadow-md shadow-[#6d28d9]/20"
        >
          <Plus className="mr-2 h-4 w-4" />
          Ajouter une Matière
        </Button>
      </MascotHeader>

      {error && (
        <Card className="border border-rose-500/30 bg-rose-500/5 rounded-3xl">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-rose-700">Erreur de chargement</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
            <Button variant="outline" size="sm" className="ml-auto rounded-xl" onClick={load}>
              Réessayer
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Main Table Card */}
      <Card className="overflow-hidden rounded-3xl border border-[#6d28d9]/10 bg-white shadow-xs">
        <div className="p-5 border-b border-[#6d28d9]/5 flex items-center justify-between">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6d28d9]" />
            <Input
              placeholder="Rechercher par matière, niveau (Terminale, BEM...) ou catégorie..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 rounded-2xl border-[#6d28d9]/15 bg-[#f8f9fc] pl-10 text-xs font-semibold text-[#1a1a2e] focus:border-[#6d28d9] focus:bg-white"
            />
          </div>
        </div>

        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              pose="reflexion"
              title="Aucune matière trouvée"
              hint="Aucune matière ne correspond à votre recherche."
            />
          ) : (
            <Table>
              <TableHeader className="bg-[#f8f9fc]">
                <TableRow className="border-b border-[#6d28d9]/5 hover:bg-transparent">
                  <TableHead className="py-4 text-xs font-extrabold uppercase tracking-wider text-[#6d28d9]">
                    Matière / Cours
                  </TableHead>
                  <TableHead className="py-4 text-xs font-extrabold uppercase tracking-wider text-[#6d28d9]">
                    Niveau / Cycle
                  </TableHead>
                  <TableHead className="py-4 text-xs font-extrabold uppercase tracking-wider text-[#6d28d9]">
                    Tarif par Séance
                  </TableHead>
                  <TableHead className="py-4 text-xs font-extrabold uppercase tracking-wider text-[#6d28d9]">
                    Forfait Mensuel (4 séances)
                  </TableHead>
                  <TableHead className="py-4 text-xs font-extrabold uppercase tracking-wider text-[#6d28d9]">
                    Statut
                  </TableHead>
                  <TableHead className="w-16 py-4 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow
                    key={r.id}
                    className="border-b border-[#6d28d9]/5 transition-colors hover:bg-[#6d28d9]/5"
                  >
                    <TableCell className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-[#6d28d9]/10 p-2 text-[#6d28d9]">
                          <BookOpen className="h-4 w-4" />
                        </div>
                        <div>
                          <span className="text-sm font-bold text-[#1e1b4b]">{r.name}</span>
                          <div className="text-[11px] text-muted-foreground">
                            {r.category}
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="py-4">
                      <Badge variant="outline" className="rounded-xl text-xs border-[#6d28d9]/20 text-[#6d28d9]">
                        <GraduationCap className="h-3 w-3 mr-1" />
                        {r.level_name}
                      </Badge>
                    </TableCell>

                    <TableCell className="py-4">
                      <span className="font-bold text-sm text-[#1e1b4b]">
                        {r.price_per_session.toLocaleString("fr-FR")} DA
                      </span>
                      <span className="text-[11px] text-muted-foreground block">par séance</span>
                    </TableCell>

                    <TableCell className="py-4">
                      <span className="font-black text-sm text-[#6d28d9]">
                        {r.monthly_price.toLocaleString("fr-FR")} DA
                      </span>
                      <span className="text-[11px] text-muted-foreground block">par mois</span>
                    </TableCell>

                    <TableCell className="py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                          r.isactive
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            r.isactive ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
                          }`}
                        />
                        {r.isactive ? "Active" : "Inactive"}
                      </span>
                    </TableCell>

                    <TableCell className="py-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-xl text-muted-foreground hover:bg-[#6d28d9]/10 hover:text-[#6d28d9]"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end" className="w-44 rounded-2xl p-1.5 shadow-xl">
                          <DropdownMenuItem
                            onClick={() => openEdit(r)}
                            className="rounded-xl text-xs font-semibold"
                          >
                            <Edit className="mr-2 h-4 w-4 text-[#6d28d9]" />
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="rounded-xl text-xs font-semibold text-rose-600 focus:bg-rose-50"
                            onClick={() => setDeleteTarget(r)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal Dialog Création / Édition */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[520px] rounded-3xl p-6">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl font-black text-[#1e1b4b] flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-[#6d28d9]" />
              {editing ? "Modifier la matière" : "Ajouter une matière"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Définissez le nom, le niveau scolaire et la grille tarifaire pour cette matière de cours de soutien.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="mod-name" className="text-xs font-bold">
                Nom de la matière *
              </Label>
              <Input
                id="mod-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Mathématiques, Physique-Chimie, Arabe..."
                className="rounded-xl h-10 border-[#6d28d9]/15 font-semibold text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Niveau / Cycle *</Label>
                <Select
                  value={form.level_name}
                  onValueChange={(val) => setForm({ ...form, level_name: val || "Toutes classes" })}
                >
                  <SelectTrigger className="rounded-xl h-10 border-[#6d28d9]/15 text-xs">
                    <SelectValue placeholder="Sélectionner un niveau">
                      {form.level_name}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {LEVEL_PRESETS.map((lvl) => (
                      <SelectItem key={lvl} value={lvl}>
                        {lvl}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Catégorie</Label>
                <Select
                  value={form.category}
                  onValueChange={(val) => setForm({ ...form, category: val || "Scientifique" })}
                >
                  <SelectTrigger className="rounded-xl h-10 border-[#6d28d9]/15 text-xs">
                    <SelectValue placeholder="Catégorie">
                      {form.category}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_PRESETS.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-2xl bg-[#6d28d9]/5 border border-[#6d28d9]/15 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-[#6d28d9]" />
                <h4 className="text-xs font-black text-[#1e1b4b]">
                  Tarification Élève (DZD)
                </h4>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-muted-foreground">
                    Prix par séance (DA)
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="50"
                    value={form.price_per_session}
                    onChange={(e) =>
                      setForm({ ...form, price_per_session: Number(e.target.value) })
                    }
                    className="rounded-xl h-9 border-[#6d28d9]/15 text-xs font-bold bg-white"
                  />
                  <p className="text-[10px] text-muted-foreground">Paiement au cours</p>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-muted-foreground">
                    Forfait mensuel (DA)
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="100"
                    value={form.monthly_price}
                    onChange={(e) =>
                      setForm({ ...form, monthly_price: Number(e.target.value) })
                    }
                    className="rounded-xl h-9 border-[#6d28d9]/15 text-xs font-black text-[#6d28d9] bg-white"
                  />
                  <p className="text-[10px] text-muted-foreground">4 séances / mois</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="ma"
                checked={form.isactive}
                onChange={(e) => setForm({ ...form, isactive: e.target.checked })}
                className="rounded border-[#6d28d9]/20 text-[#6d28d9] focus:ring-[#6d28d9]"
              />
              <Label htmlFor="ma" className="text-xs font-semibold text-[#1e1b4b]">
                Matière active (ouverte aux inscriptions)
              </Label>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl font-bold">
              Annuler
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-[#6d28d9] hover:bg-[#5b21b6] text-white font-bold gap-2"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Enregistrer" : "Créer la matière"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Suppression Matière AlertDialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette matière ?</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer définitivement la matière <strong className="text-[#1a1a2e] font-semibold">{deleteTarget?.name}</strong> ?
              Cette action est irréversible et supprimera les associations de cours rattachées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Supprimer la matière
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
