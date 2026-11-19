"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { uuid } from "@/lib/uuid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, Plus, MoreHorizontal, Edit, Trash2, Loader2, LayoutList, Layers } from "lucide-react";
import { toast } from "sonner";
import { Mascot } from "@/components/mascot/Mascot";
import { MascotHeader } from "@/components/mascot/MascotHeader";
import { EmptyState } from "@/components/mascot/EmptyState";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";

type Section = { id: string; levelId: string; levelName: string; name: string; code: string; isActive: boolean };
type Level = { id: string; name: string; code: string; isActive: boolean };

export function SectionsManagement({ initialSections, levels }: { initialSections: Section[]; levels: Level[] }) {
  const [sections, setSections] = useState<Section[]>(initialSections);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Section | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Section | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ levelId: "", name: "", code: "", isActive: true });
  const supabase = createClient();

  const openAdd = () => { setEditing(null); setForm({ levelId: levels[0]?.id ?? "", name: "", code: "", isActive: true }); setDialogOpen(true); };
  const openEdit = (s: Section) => { setEditing(s); setForm({ levelId: s.levelId, name: s.name, code: s.code, isActive: s.isActive }); setDialogOpen(true); };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing) {
        await supabase.from("sections").update({ levelId: form.levelId, name: form.name, code: form.code, isActive: form.isActive }).eq("id", editing.id);
        const lvl = levels.find((l) => l.id === form.levelId);
        setSections((prev) => prev.map((s) => s.id === editing.id ? { ...s, ...form, levelName: lvl?.name ?? "" } : s));
        toast.success("Section mise à jour");
      } else {
        const id = uuid();
        await supabase.from("sections").insert({ id, levelId: form.levelId, name: form.name, code: form.code, isActive: form.isActive });
        const lvl = levels.find((l) => l.id === form.levelId);
        setSections((prev) => [{ id, ...form, levelName: lvl?.name ?? "" }, ...prev]);
        toast.success("Section créée");
      }
      setDialogOpen(false);
    } catch (err) { toast.error("Erreur", { description: String(err) }); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    const s = deleteConfirm;
    try {
      const { data, error } = await supabase.from("sections").delete().eq("id", s.id).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Aucune ligne supprimée (vérifiez les permissions RLS)");
      setSections((prev) => prev.filter((x) => x.id !== s.id));
      toast.success("Section supprimée");
      setDeleteConfirm(null);
    } catch (err) {
      const msg = String(err);
      if (msg.includes("foreign key")) toast.error("Impossible de supprimer cette section : elle est liée à des éléments existants");
      else toast.error("Erreur", { description: msg });
      setDeleteConfirm(null);
    }
  };

  const filtered = sections.filter(
    (s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <MascotHeader
        title="Sections"
        description={`${sections.length} section(s) référencée(s)`}
        pose="bonjour"
      >
        <Button onClick={openAdd} className="h-11 rounded-2xl bg-gradient-to-r from-[#6d28d9] to-[#8b5cf6] px-5 font-bold text-white shadow-md shadow-[#6d28d9]/20 hover:shadow-lg">
          <Plus className="mr-2 h-4 w-4" />
          Ajouter
        </Button>
      </MascotHeader>
      
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              pose="reflexion"
              title="Aucune section trouvée"
              hint="Essayez d'ajuster vos critères de recherche."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Section</TableHead>
                  <TableHead className="hidden md:table-cell">Code</TableHead>
                  <TableHead className="hidden sm:table-cell">Niveau</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <LayoutList className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">{s.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="font-mono text-xs text-muted-foreground">{s.code}</span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="outline" className="text-xs gap-1">
                        <Layers className="h-3 w-3" />
                        {s.levelName}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1.5 text-xs ${s.isActive ? "text-emerald-600" : "text-muted-foreground"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${s.isActive ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                        {s.isActive ? "Actif" : "Inactif"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>} />
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => openEdit(s)}><Edit className="mr-2 h-4 w-4" />Modifier</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteConfirm(s)}><Trash2 className="mr-2 h-4 w-4" />Supprimer</DropdownMenuItem>
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
      
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl p-6 border-[#6d28d9]/15">
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-3">
              <Mascot pose="validation" size="sm" />
              <div>
                <DialogTitle className="text-lg font-bold text-[#1a1a2e]">
                  {editing ? "Modifier la section" : "Ajouter une section"}
                </DialogTitle>
                <DialogDescription className="text-xs text-[#64748b]">
                  {editing ? "Modifiez les informations de la section." : "Créez une nouvelle section rattachée à un niveau (ex: Section A du L1-INFO)."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <Label htmlFor="section-level" className="text-xs font-bold text-[#1a1a2e]">Niveau de rattachement</Label>
              <Select value={form.levelId} onValueChange={(v) => { if (v) setForm({ ...form, levelId: v }); }}>
                <SelectTrigger id="section-level" className="rounded-xl border-[#6d28d9]/15 text-xs font-semibold">
                  <SelectValue placeholder="Sélectionner un niveau">
                    {levels.find((l) => l.id === form.levelId)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-[#6d28d9]/15 shadow-xl">
                  {levels.map((l) => <SelectItem key={l.id} value={l.id} className="rounded-xl text-xs font-medium">{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="section-name" className="text-xs font-bold text-[#1a1a2e]">Nom de la section</Label>
                <Input id="section-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Section A" className="rounded-xl border-[#6d28d9]/15 text-xs font-medium" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="section-code" className="text-xs font-bold text-[#1a1a2e]">Code court</Label>
                <Input id="section-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="A" className="rounded-xl border-[#6d28d9]/15 text-xs font-medium" />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Checkbox id="section-active" checked={form.isActive} onCheckedChange={(c) => setForm({ ...form, isActive: c as boolean })} />
              <Label htmlFor="section-active" className="text-xs font-semibold text-[#1a1a2e]">Section active</Label>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl border-[#6d28d9]/20 font-bold">Annuler</Button>
            <Button onClick={handleSave} disabled={saving} className="rounded-xl bg-[#6d28d9] hover:bg-[#5b21b6] text-white font-bold">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={!!deleteConfirm} onOpenChange={(o: boolean) => !o && setDeleteConfirm(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la section ?</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer "{deleteConfirm?.name}" ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="rounded-xl bg-rose-600 text-white hover:bg-rose-700">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
