"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { uuid } from "@/lib/uuid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Plus, MoreHorizontal, Edit, Trash2, BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MascotHeader } from "@/components/mascot/MascotHeader";
import { EmptyState } from "@/components/mascot/EmptyState";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";

type Formation = { id: string; name: string; domainId: string; domainName?: string; isActive: boolean };
type Domain = { id: string; name: string };

export function ModulesManagement({ initialModules, domains }: { initialModules: Formation[]; domains: Domain[] }) {
  const [modules, setModules] = useState<Formation[]>(initialModules);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Formation | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Formation | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", domainId: "", isActive: true });
  const supabase = createClient();

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", domainId: "", isActive: true });
    setDialogOpen(true);
  };

  const openEdit = (mod: Formation) => {
    setEditing(mod);
    setForm({ name: mod.name, domainId: mod.domainId, isActive: mod.isActive });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing) {
        await supabase.from("modules").update({ name: form.name, domainId: form.domainId, isActive: form.isActive }).eq("id", editing.id);
        const domain = domains.find((d) => d.id === form.domainId);
        setModules((prev) => prev.map((m) => m.id === editing.id ? { ...m, name: form.name, domainId: form.domainId, domainName: domain?.name ?? m.domainName, isActive: form.isActive } : m));
        toast.success("Matière mise à jour");
      } else {
        const id = uuid();
        const domain = domains.find((d) => d.id === form.domainId);
        await supabase.from("modules").insert({ id, name: form.name, domainId: form.domainId, isActive: form.isActive });
        setModules((prev) => [{ id, name: form.name, domainId: form.domainId, domainName: domain?.name, isActive: form.isActive }, ...prev]);
        toast.success("Matière créée");
      }
      setDialogOpen(false);
    } catch (err) { toast.error("Erreur", { description: String(err) }); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    const mod = deleteConfirm;
    try {
      const { data, error } = await supabase.from("modules").delete().eq("id", mod.id).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Aucune ligne supprimée (vérifiez les permissions RLS)");
      setModules((prev) => prev.filter((m) => m.id !== mod.id));
      toast.success("Matière supprimée");
      setDeleteConfirm(null);
    } catch (err) {
      const msg = String(err);
      if (msg.includes("foreign key")) toast.error("Impossible de supprimer cette matière : elle est liée à des groupes ou des séances");
      else toast.error("Erreur", { description: msg });
      setDeleteConfirm(null);
    }
  };

  const filtered = modules.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-8 pb-10">
      <MascotHeader
        title="Matières"
        description={`${modules.length} matière(s) référencée(s)`}
        pose="bonjour"
      >
        <Button onClick={openAdd} className="h-11 rounded-2xl bg-gradient-to-r from-[#6d28d9] to-[#8b5cf6] px-5 font-bold text-white shadow-md shadow-[#6d28d9]/20 hover:shadow-lg">
          <Plus className="mr-2 h-4 w-4" />
          Ajouter
        </Button>
      </MascotHeader>
      <Card className="overflow-hidden rounded-3xl border border-[#6d28d9]/10 bg-white shadow-xs">
        <div className="border-b border-[#6d28d9]/5 p-5">
          <div className="relative max-w-md">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6d28d9]" />
            <Input placeholder="Rechercher une matière..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 rounded-2xl border-[#6d28d9]/15 bg-[#f8f9fc] pl-10 text-xs font-semibold text-[#1a1a2e] focus:border-[#6d28d9] focus:bg-white" />
          </div>
        </div>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              pose="reflexion"
              title="Aucune matière trouvée"
              hint="Essayez d'ajuster vos critères de recherche."
            />
          ) : (
            <Table>
              <TableHeader className="bg-[#f8f9fc]">
                <TableRow className="border-b border-[#6d28d9]/5 hover:bg-transparent">
                  <TableHead className="py-4 text-xs font-extrabold uppercase tracking-wider text-[#6d28d9]">Matière</TableHead>
                  <TableHead className="hidden py-4 text-xs font-extrabold uppercase tracking-wider text-[#6d28d9] sm:table-cell">Domaine</TableHead>
                  <TableHead className="py-4 text-xs font-extrabold uppercase tracking-wider text-[#6d28d9]">Statut</TableHead>
                  <TableHead className="w-16 py-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((mod) => (
                  <TableRow key={mod.id} className="border-b border-[#6d28d9]/5 transition-colors hover:bg-[#f3f0ff]/30">
                    <TableCell className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-[#6d28d9]/10 p-2 text-[#6d28d9]">
                          <BookOpen className="h-4 w-4" />
                        </div>
                        <span className="text-sm font-semibold text-[#1a1a2e]">{mod.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden py-4 sm:table-cell">
                      {mod.domainName ? (
                        <Badge variant="secondary" className="rounded-full border-[#6d28d9]/10 bg-[#6d28d9]/10 text-[#6d28d9]">{mod.domainName}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${mod.isActive ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${mod.isActive ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
                        {mod.isActive ? "Actif" : "Inactif"}
                      </span>
                    </TableCell>
                    <TableCell className="py-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl text-[#64748b] hover:bg-[#6d28d9]/10 hover:text-[#6d28d9]"><MoreHorizontal className="h-4 w-4" /></Button>} />
                        <DropdownMenuContent align="end" className="w-44 rounded-2xl p-1.5 shadow-xl">
                          <DropdownMenuItem onClick={() => openEdit(mod)} className="rounded-xl text-xs font-semibold">
                            <Edit className="mr-2 h-4 w-4 text-[#6d28d9]" />
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuItem className="rounded-xl text-xs font-semibold text-rose-600 focus:bg-rose-50" onClick={() => setDeleteConfirm(mod)}>
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
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              {editing ? "Modifier la matière" : "Ajouter une matière"}
            </DialogTitle>
            <DialogDescription>
              {editing ? "Modifiez les informations de la matière." : "Créez une nouvelle matière rattachée à un domaine (ex: Langues, Informatique)."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-4">
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-muted-foreground border-b pb-1">Informations</h4>
              <div className="space-y-2">
                <Label htmlFor="mod-name">Nom</Label>
                <Input id="mod-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Anglais technique" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mod-domain">Domaine</Label>
                <Select value={form.domainId} onValueChange={(v) => { if (v) setForm({ ...form, domainId: v }); }}>
                  <SelectTrigger id="mod-domain" className="w-full">
                    <SelectValue placeholder="Sélectionner un domaine">{(v: string) => domains.find((d) => d.id === v)?.name ?? v}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {domains.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    {domains.length === 0 && <p className="text-xs text-muted-foreground p-2 text-center">Aucun domaine disponible</p>}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Checkbox id="mod-active" checked={form.isActive} onCheckedChange={(c) => setForm({ ...form, isActive: c as boolean })} />
              <Label htmlFor="mod-active" className="text-sm font-normal">Matière active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving || !form.name || !form.domainId}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleteConfirm} onOpenChange={(o: boolean) => !o && setDeleteConfirm(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la matière ?</AlertDialogTitle>
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
