import { useState, useRef } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Search, Percent, DollarSign, Loader2, MoreVertical, Trash2, Edit, Camera, ChevronDown, ChevronUp } from "lucide-react";
import { useBarbers, useCreateBarber, useUpdateBarber, useDeleteBarber } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type DayBreak = { start: string | null; end: string | null; enabled: boolean };
type BreakSchedule = {
  monday: DayBreak;
  tuesday: DayBreak;
  wednesday: DayBreak;
  thursday: DayBreak;
  friday: DayBreak;
  saturday: DayBreak;
  sunday: DayBreak;
};

const DEFAULT_BREAK_SCHEDULE: BreakSchedule = {
  monday: { start: null, end: null, enabled: false },
  tuesday: { start: null, end: null, enabled: false },
  wednesday: { start: null, end: null, enabled: false },
  thursday: { start: null, end: null, enabled: false },
  friday: { start: null, end: null, enabled: false },
  saturday: { start: null, end: null, enabled: false },
  sunday: { start: null, end: null, enabled: false },
};

const DAY_LABELS: Record<keyof BreakSchedule, string> = {
  monday: "Segunda",
  tuesday: "Terça",
  wednesday: "Quarta",
  thursday: "Quinta",
  friday: "Sexta",
  saturday: "Sábado",
  sunday: "Domingo",
};

export default function Barbers() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBarber, setEditingBarber] = useState<any>(null);
  const [showBreakSchedule, setShowBreakSchedule] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    password: "",
    role: "",
    commissionType: "percentage",
    commissionValue: "50",
    active: true,
    avatar: "",
  });
  const [breakSchedule, setBreakSchedule] = useState<BreakSchedule>(DEFAULT_BREAK_SCHEDULE);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: barbers = [], isLoading } = useBarbers();
  const createMutation = useCreateBarber();
  const updateMutation = useUpdateBarber();
  const deleteMutation = useDeleteBarber();
  const { toast } = useToast();
  const { uploadFile, isUploading } = useUpload();

  const resetForm = () => {
    setFormData({ name: "", phone: "", password: "", role: "", commissionType: "percentage", commissionValue: "50", active: true, avatar: "" });
    setBreakSchedule(DEFAULT_BREAK_SCHEDULE);
    setShowBreakSchedule(false);
    setAvatarPreview(null);
    setEditingBarber(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const openEditDialog = (barber: any) => {
    setEditingBarber(barber);
    setFormData({
      name: barber.name,
      phone: barber.phone || "",
      password: "",
      role: barber.role || "",
      commissionType: barber.commissionType,
      commissionValue: barber.commissionValue,
      active: barber.active,
      avatar: barber.avatar || "",
    });
    if (barber.breakSchedule) {
      setBreakSchedule(barber.breakSchedule);
      const hasAnyEnabled = Object.values(barber.breakSchedule as BreakSchedule).some((d: DayBreak) => d.enabled);
      setShowBreakSchedule(hasAnyEnabled);
    } else if (barber.lunchStart && barber.lunchEnd) {
      const schedule: BreakSchedule = { ...DEFAULT_BREAK_SCHEDULE };
      (['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const).forEach(day => {
        schedule[day] = { start: barber.lunchStart, end: barber.lunchEnd, enabled: true };
      });
      setBreakSchedule(schedule);
      setShowBreakSchedule(true);
    } else {
      setBreakSchedule(DEFAULT_BREAK_SCHEDULE);
      setShowBreakSchedule(false);
    }
    setAvatarPreview(barber.avatar ? (barber.avatar.startsWith('/objects/') ? barber.avatar : `/objects/${barber.avatar}`) : null);
    setIsDialogOpen(true);
  };

  const updateDayBreak = (day: keyof BreakSchedule, field: keyof DayBreak, value: any) => {
    setBreakSchedule(prev => ({
      ...prev,
      [day]: { ...prev[day], [field]: value }
    }));
  };

  const applyToAllDays = (sourceDay: keyof BreakSchedule) => {
    const source = breakSchedule[sourceDay];
    const newSchedule = { ...breakSchedule };
    (Object.keys(newSchedule) as (keyof BreakSchedule)[]).forEach(day => {
      if (day !== sourceDay && day !== 'sunday') {
        newSchedule[day] = { ...source };
      }
    });
    setBreakSchedule(newSchedule);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    setAvatarPreview(previewUrl);

    try {
      const response = await uploadFile(file);
      if (response) {
        // Salvar apenas o ID do objeto, sem o prefixo /objects/
        const avatarPath = response.objectPath.replace(/^\/objects\//, '');
        setFormData(prev => ({ ...prev, avatar: avatarPath }));
        toast({ title: "Foto enviada com sucesso!" });
      }
    } catch (error: any) {
      toast({ title: "Erro ao enviar foto", description: error.message, variant: "destructive" });
      setAvatarPreview(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data: any = {
        name: formData.name,
        phone: formData.phone || null,
        role: formData.role || null,
        commissionType: formData.commissionType,
        commissionValue: formData.commissionValue,
        active: formData.active,
        avatar: formData.avatar || null,
        breakSchedule: breakSchedule,
      };
      if (formData.password) {
        data.password = formData.password;
      }

      if (editingBarber) {
        await updateMutation.mutateAsync({ id: editingBarber.id, ...data });
        toast({ title: "Barbeiro atualizado com sucesso!" });
      } else {
        await createMutation.mutateAsync(data);
        toast({ title: "Barbeiro cadastrado com sucesso!" });
      }
      setIsDialogOpen(false);
      resetForm();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async (barber: any) => {
    if (confirm(`Tem certeza que deseja excluir ${barber.name}?`)) {
      try {
        await deleteMutation.mutateAsync(barber.id);
        toast({ title: "Barbeiro excluído com sucesso!" });
      } catch (error: any) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
      }
    }
  };

  const filteredBarbers = barbers.filter((b: any) =>
    b.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Barbeiros</h1>
            <p className="text-muted-foreground">Gerencie sua equipe de profissionais.</p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-barber" className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="mr-2 h-4 w-4" /> Novo Barbeiro
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingBarber ? "Editar Barbeiro" : "Cadastrar Barbeiro"}</DialogTitle>
                <DialogDescription>
                  {editingBarber ? "Atualize os dados do barbeiro." : "Adicione um novo profissional à equipe."}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-barber">
                <div className="flex flex-col items-center gap-4">
                  <Label>Foto do Barbeiro</Label>
                  <div className="relative">
                    <Avatar className="h-24 w-24 border-2 border-primary/30" data-testid="avatar-preview">
                      {avatarPreview ? (
                        <AvatarImage src={avatarPreview} alt="Preview" data-testid="img-avatar-preview" />
                      ) : null}
                      <AvatarFallback className="bg-primary/10 text-primary font-bold text-2xl">
                        {formData.name ? formData.name.substring(0, 2).toUpperCase() : <Camera className="w-8 h-8" />}
                      </AvatarFallback>
                    </Avatar>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="absolute -bottom-2 -right-2 rounded-full h-8 w-8 bg-card border-primary/30"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      data-testid="button-upload-avatar"
                    >
                      {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                    </Button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                    data-testid="input-avatar-file"
                  />
                  {isUploading && <p className="text-sm text-muted-foreground">Enviando foto...</p>}
                </div>
                <div>
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    data-testid="input-barber-name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="João Silva"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="phone">WhatsApp</Label>
                    <Input
                      id="phone"
                      data-testid="input-barber-phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="(11) 99999-9999"
                    />
                  </div>
                  <div>
                    <Label htmlFor="password">{editingBarber ? "Nova Senha" : "Senha"}</Label>
                    <Input
                      id="password"
                      type="password"
                      data-testid="input-barber-password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder={editingBarber ? "Deixe vazio para manter" : "Senha de acesso"}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground -mt-2">WhatsApp e senha permitem acesso ao painel do barbeiro.</p>
                <div>
                  <Label htmlFor="role">Cargo/Função</Label>
                  <Input
                    id="role"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    placeholder="Master Barber, Barbeiro, etc."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Tipo de Comissão</Label>
                    <Select
                      value={formData.commissionType}
                      onValueChange={(value) => setFormData({ ...formData, commissionType: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentual (%)</SelectItem>
                        <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="commissionValue">Valor</Label>
                    <Input
                      id="commissionValue"
                      type="number"
                      step="0.01"
                      value={formData.commissionValue}
                      onChange={(e) => setFormData({ ...formData, commissionValue: e.target.value })}
                      placeholder={formData.commissionType === "percentage" ? "50" : "25.00"}
                      required
                    />
                  </div>
                </div>
                <Collapsible open={showBreakSchedule} onOpenChange={setShowBreakSchedule}>
                  <CollapsibleTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-between"
                      data-testid="button-toggle-break-schedule"
                    >
                      <span>Intervalo / Almoço por Dia</span>
                      {showBreakSchedule ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 space-y-1">
                    <p className="text-xs text-muted-foreground mb-2">Configure o intervalo para cada dia. Horários bloqueados não aparecerão para agendamento.</p>
                    {(Object.keys(DAY_LABELS) as (keyof BreakSchedule)[]).map((day) => (
                      <div key={day} className="flex flex-wrap items-center gap-1.5 py-1.5 px-2 rounded bg-muted/30">
                        <div className="flex items-center gap-1.5 min-w-[90px]">
                          <Switch
                            checked={breakSchedule[day].enabled}
                            onCheckedChange={(checked) => updateDayBreak(day, 'enabled', checked)}
                            data-testid={`switch-break-${day}`}
                            className="scale-90"
                          />
                          <span className="text-xs font-medium">{DAY_LABELS[day]}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Input
                            type="time"
                            value={breakSchedule[day].start || ''}
                            onChange={(e) => updateDayBreak(day, 'start', e.target.value || null)}
                            disabled={!breakSchedule[day].enabled}
                            className="w-[70px] h-7 text-xs px-1"
                            data-testid={`input-break-start-${day}`}
                          />
                          <span className="text-xs text-muted-foreground">-</span>
                          <Input
                            type="time"
                            value={breakSchedule[day].end || ''}
                            onChange={(e) => updateDayBreak(day, 'end', e.target.value || null)}
                            disabled={!breakSchedule[day].enabled}
                            className="w-[70px] h-7 text-xs px-1"
                            data-testid={`input-break-end-${day}`}
                          />
                        </div>
                        {breakSchedule[day].enabled && day !== 'sunday' && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-xs h-6 px-1.5 ml-auto"
                            onClick={() => applyToAllDays(day)}
                            data-testid={`button-apply-all-${day}`}
                          >
                            Aplicar
                          </Button>
                        )}
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
                <div className="flex items-center justify-between">
                  <Label htmlFor="active">Ativo</Label>
                  <Switch
                    id="active"
                    checked={formData.active}
                    onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" data-testid="button-submit-barber" disabled={createMutation.isPending || updateMutation.isPending}>
                    {(createMutation.isPending || updateMutation.isPending) ? "Salvando..." : (editingBarber ? "Atualizar" : "Cadastrar")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar barbeiros..."
            className="pl-10 bg-card border-border"
            data-testid="input-search-barbers"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBarbers.map((barber: any) => (
            <Card key={barber.id} className={`group hover:border-primary/50 transition-colors bg-card/50 backdrop-blur-sm ${!barber.active ? 'opacity-60' : ''}`}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-14 w-14 border-2 border-primary/30" data-testid={`avatar-barber-${barber.id}`}>
                      {barber.avatar && (
                        <AvatarImage src={barber.avatar.startsWith('/objects/') ? barber.avatar : `/objects/${barber.avatar}`} alt={barber.name} data-testid={`img-barber-${barber.id}`} />
                      )}
                      <AvatarFallback className="bg-primary/10 text-primary font-bold text-lg">
                        {barber.name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-bold text-lg text-foreground">{barber.name}</h3>
                      <p className="text-sm text-muted-foreground">{barber.role || "Barbeiro"}</p>
                      <div className="flex items-center gap-1 mt-2 text-xs">
                        {barber.commissionType === "percentage" ? (
                          <span className="flex items-center gap-1 bg-blue-500/10 text-blue-400 px-2 py-1 rounded">
                            <Percent className="w-3 h-3" /> {barber.commissionValue}%
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 bg-green-500/10 text-green-400 px-2 py-1 rounded">
                            <DollarSign className="w-3 h-3" /> R$ {parseFloat(barber.commissionValue).toFixed(2)}
                          </span>
                        )}
                        {!barber.active && (
                          <span className="bg-red-500/10 text-red-400 px-2 py-1 rounded">Inativo</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-card border-border">
                      <DropdownMenuItem onClick={() => openEditDialog(barber)}>
                        <Edit className="w-4 h-4 mr-2" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(barber)}>
                        <Trash2 className="w-4 h-4 mr-2" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredBarbers.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p>Nenhum barbeiro cadastrado ainda.</p>
            <p className="text-sm mt-1">Clique em "Novo Barbeiro" para começar.</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
