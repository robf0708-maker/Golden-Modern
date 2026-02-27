import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ServiceCombobox } from "@/components/ServiceCombobox";
import { ClientCombobox } from "@/components/ClientCombobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Plus,
  Clock,
  Scissors,
  User,
  Trash2,
  Edit,
  ShoppingBag,
  Package,
  Coffee
} from "lucide-react";
import { format, addDays, startOfToday, setHours, setMinutes, isSameDay, parseISO, startOfDay, endOfDay } from "date-fns";

// Helper to format time in UTC (since appointments are stored as UTC)
const formatTimeUTC = (date: Date): string => {
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const mins = date.getUTCMinutes().toString().padStart(2, '0');
  return `${hours}:${mins}`;
};

const formatDateUTC = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isSameDayUTC = (date1: Date, date2: Date): boolean => {
  return date1.getUTCFullYear() === date2.getUTCFullYear() &&
         date1.getUTCMonth() === date2.getUTCMonth() &&
         date1.getUTCDate() === date2.getUTCDate();
};
import { ptBR } from "date-fns/locale";
import { useAppointments, useCreateAppointment, useUpdateAppointment, useDeleteAppointment, useBarbers, useClients, useServices, useClientPackages, usePackages, useCreateClient } from "@/lib/api";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Gift, Repeat } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function Schedule() {
  const [, setLocation] = useLocation();
  const [currentDate, setCurrentDate] = useState(startOfToday());
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<any>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const startDate = format(startOfDay(currentDate), "yyyy-MM-dd'T'HH:mm:ss");
  const endDate = format(endOfDay(currentDate), "yyyy-MM-dd'T'HH:mm:ss");

  const { data: appointments = [], isLoading: loadingAppointments, refetch: refetchAppointments } = useAppointments(startDate, endDate);
  
  // Atualizar agendamentos quando volta do POS após fechar comanda
  useEffect(() => {
    const needsRefresh = localStorage.getItem('refreshAppointments');
    if (needsRefresh === 'true') {
      localStorage.removeItem('refreshAppointments');
      refetchAppointments();
    }
  }, [refetchAppointments]);
  const { data: barbers = [], isLoading: loadingBarbers } = useBarbers();
  const { data: clients = [] } = useClients();
  const { data: services = [] } = useServices();
  const { data: allClientPackages = [] } = useClientPackages();
  const { data: packages = [] } = usePackages();
  
  // Buscar dados da barbearia para working hours
  const { data: barbershop } = useQuery({
    queryKey: ['/api/barbershop'],
    queryFn: async () => {
      const res = await fetch('/api/barbershop', { credentials: 'include' });
      if (!res.ok) throw new Error('Erro ao carregar dados da barbearia');
      return res.json();
    }
  });

  const activeBarbers = barbers.filter((b: any) => b.active);

  const getClientPackageForService = (clientId: string, serviceId: string) => {
    if (!clientId || !serviceId) return null;
    const now = new Date();
    const clientPkgs = allClientPackages.filter((cp: any) => 
      cp.clientId === clientId && 
      cp.quantityRemaining > 0 && 
      new Date(cp.expiresAt) > now
    );
    for (const cp of clientPkgs) {
      const pkg = packages.find((p: any) => p.id === cp.packageId);
      if (pkg && pkg.serviceId === serviceId) {
        return { clientPackage: cp, package: pkg };
      }
    }
    return null;
  };

  // Obter TODOS os pacotes ativos do cliente
  const getClientActivePackages = (clientId: string) => {
    if (!clientId) return [];
    const now = new Date();
    const clientPkgs = allClientPackages.filter((cp: any) => 
      cp.clientId === clientId && 
      cp.quantityRemaining > 0 && 
      new Date(cp.expiresAt) > now
    );
    return clientPkgs.map((cp: any) => {
      const pkg = packages.find((p: any) => p.id === cp.packageId);
      return { clientPackage: cp, package: pkg };
    }).filter((item: any) => item.package);
  };

  const createMutation = useCreateAppointment();
  const updateMutation = useUpdateAppointment();
  const deleteMutation = useDeleteAppointment();
  const createClientMutation = useCreateClient();
  
  // Estado para novo cliente
  const [isNewClientDialogOpen, setIsNewClientDialogOpen] = useState(false);
  const [newClientData, setNewClientData] = useState({ name: "", phone: "", email: "" });
  
  // Estado para serviços adicionais (múltiplos serviços por agendamento)
  const [additionalServiceIds, setAdditionalServiceIds] = useState<string[]>([]);
  
  // Estado para uso de pacote
  const [usePackage, setUsePackage] = useState(false);
  const [selectedClientPackageId, setSelectedClientPackageId] = useState<string>("");

  const [formData, setFormData] = useState({
    clientId: "",
    barberId: "",
    serviceId: "",
    date: format(currentDate, "yyyy-MM-dd"),
    time: "09:00",
    notes: "",
    status: "scheduled"
  });

  const [recurrence, setRecurrence] = useState({
    type: "none" as "none" | "weekly" | "biweekly" | "monthly",
    count: 4
  });

  // Gerar timeSlots dinamicamente baseado no horário de funcionamento
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const currentDayName = dayNames[currentDate.getDay()];
  const workingHours = barbershop?.workingHours?.[currentDayName];
  
  const openHour = workingHours?.enabled ? parseInt(workingHours.open?.split(':')[0] || '9') : 9;
  const closeHour = workingHours?.enabled ? parseInt(workingHours.close?.split(':')[0] || '19') : 19;
  
  const timeSlots = [];
  for (let i = openHour; i <= closeHour; i++) {
    timeSlots.push(setMinutes(setHours(new Date(), i), 0));
    if (i < closeHour) {
      timeSlots.push(setMinutes(setHours(new Date(), i), 30));
    }
  }

  const handlePrevDay = () => setCurrentDate(addDays(currentDate, -1));
  const handleNextDay = () => setCurrentDate(addDays(currentDate, 1));
  const handleToday = () => setCurrentDate(startOfToday());

  const resetForm = () => {
    setFormData({
      clientId: "",
      barberId: "",
      serviceId: "",
      date: format(currentDate, "yyyy-MM-dd"),
      time: "09:00",
      notes: "",
      status: "scheduled"
    });
    setAdditionalServiceIds([]);
    setRecurrence({ type: "none", count: 4 });
    setEditingAppointment(null);
    setConfirmingDelete(false);
    setUsePackage(false);
    setSelectedClientPackageId("");
  };
  
  // Calcular detalhes do pacote selecionado
  const getSelectedPackageDetails = () => {
    if (!usePackage || !selectedClientPackageId) return null;
    const activePackages = getClientActivePackages(formData.clientId);
    const selected = activePackages.find((p: any) => p.clientPackage.id === selectedClientPackageId);
    return selected;
  };
  
  // Obter serviço do pacote selecionado
  const getPackageServiceId = () => {
    const pkgDetails = getSelectedPackageDetails();
    return pkgDetails?.package?.serviceId?.toString() || "";
  };
  
  // Calcular duração total (serviço principal + adicionais + pacote)
  const getTotalDuration = () => {
    let total = 0;
    
    // Se usando pacote, pegar duração do serviço do pacote
    if (usePackage && selectedClientPackageId) {
      const pkgDetails = getSelectedPackageDetails();
      if (pkgDetails?.package?.serviceId) {
        const pkgService = services.find((s: any) => s.id === pkgDetails.package.serviceId);
        if (pkgService) total += pkgService.duration;
      }
    }
    
    // Adicionar serviço principal (se diferente do pacote ou sem pacote)
    if (formData.serviceId && (!usePackage || formData.serviceId !== getPackageServiceId())) {
      const primaryService = services.find((s: any) => s.id.toString() === formData.serviceId);
      if (primaryService) total += primaryService.duration;
    }
    
    // Adicionar serviços adicionais
    for (const svcId of additionalServiceIds) {
      const svc = services.find((s: any) => s.id.toString() === svcId);
      if (svc) total += svc.duration;
    }
    return total || 30; // mínimo 30 min
  };
  
  // Calcular preço total (pacote não cobra, apenas serviços extras)
  const getTotalPrice = () => {
    let total = 0;
    
    // Serviço principal só cobra se NÃO estiver usando pacote para ele
    if (formData.serviceId && !usePackage) {
      const primaryService = services.find((s: any) => s.id.toString() === formData.serviceId);
      if (primaryService) total += parseFloat(primaryService.price);
    }
    
    // Serviços adicionais sempre cobram
    for (const svcId of additionalServiceIds) {
      const svc = services.find((s: any) => s.id.toString() === svcId);
      if (svc) total += parseFloat(svc.price);
    }
    return total;
  };

  const handleEdit = (apt: any) => {
    const aptStart = new Date(apt.startTime);
    setFormData({
      clientId: apt.clientId.toString(),
      barberId: apt.barberId.toString(),
      serviceId: apt.serviceId?.toString() || "",
      date: formatDateUTC(aptStart),
      time: formatTimeUTC(aptStart),
      notes: apt.notes || "",
      status: apt.status
    });
    
    // Carregar serviços adicionais se existirem
    if (apt.allServiceIds && apt.allServiceIds.length > 1) {
      // Converter todos os IDs para string e remover o serviço principal
      const primaryId = apt.serviceId?.toString();
      const additionalIds = apt.allServiceIds
        .map((id: any) => id?.toString())
        .filter((id: string | undefined) => id && id !== primaryId);
      setAdditionalServiceIds(additionalIds);
    } else {
      setAdditionalServiceIds([]);
    }
    
    // Carregar informação de uso de pacote
    if (apt.usedPackage && apt.clientPackageId) {
      setUsePackage(true);
      setSelectedClientPackageId(apt.clientPackageId.toString());
    } else {
      setUsePackage(false);
      setSelectedClientPackageId("");
    }
    
    setEditingAppointment(apt);
    setIsDialogOpen(true);
  };

  const checkConflict = (barberId: string, date: string, time: string, excludeId?: string): boolean => {
    // Create date in UTC to match stored appointments
    const targetDateTime = new Date(`${date}T${time}:00.000Z`);
    // Use total duration of all services
    const duration = getTotalDuration() || 30;
    const targetEnd = new Date(targetDateTime.getTime() + duration * 60000);

    return appointments.some((apt: any) => {
      if (excludeId && apt.id === excludeId) return false;
      if (apt.barberId.toString() !== barberId) return false;

      const aptStart = new Date(apt.startTime);
      const aptEnd = new Date(apt.endTime);

      return (targetDateTime < aptEnd && targetEnd > aptStart);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validar campos obrigatórios
    if (!formData.clientId) {
      toast({ title: "Selecione o cliente", variant: "destructive" });
      return;
    }
    if (!formData.barberId) {
      toast({ title: "Selecione o barbeiro", variant: "destructive" });
      return;
    }
    
    // Serviço é obrigatório apenas se NÃO estiver usando pacote
    if (!usePackage && !formData.serviceId) {
      toast({ title: "Selecione o serviço", variant: "destructive" });
      return;
    }
    
    // Se usando pacote, precisa ter pacote selecionado
    if (usePackage && !selectedClientPackageId) {
      toast({ title: "Selecione o pacote", variant: "destructive" });
      return;
    }
    
    if (checkConflict(formData.barberId, formData.date, formData.time, editingAppointment?.id)) {
      toast({ 
        title: "Conflito de horário", 
        description: "Já existe um agendamento para este barbeiro neste horário.",
        variant: "destructive" 
      });
      return;
    }

    try {
      const duration = getTotalDuration() || 30;
      
      // Calculate all dates for recurrence
      const dates: Date[] = [];
      const baseDate = new Date(`${formData.date}T${formData.time}:00.000Z`);
      
      if (recurrence.type === "none" || editingAppointment) {
        dates.push(baseDate);
      } else {
        for (let i = 0; i < recurrence.count; i++) {
          const newDate = new Date(baseDate);
          if (recurrence.type === "weekly") {
            newDate.setDate(baseDate.getDate() + (i * 7));
          } else if (recurrence.type === "biweekly") {
            newDate.setDate(baseDate.getDate() + (i * 14));
          } else if (recurrence.type === "monthly") {
            newDate.setMonth(baseDate.getMonth() + i);
          }
          dates.push(newDate);
        }
      }

      // Determinar serviceId real: se usando pacote, pegar do pacote; senão do form
      const effectiveServiceId = usePackage && selectedClientPackageId 
        ? getPackageServiceId() || formData.serviceId
        : formData.serviceId;

      if (editingAppointment) {
        const dateTime = dates[0];
        const endTime = new Date(dateTime.getTime() + duration * 60000);
        const data: any = {
          clientId: formData.clientId,
          barberId: formData.barberId,
          serviceId: effectiveServiceId,
          startTime: dateTime.toISOString(),
          endTime: endTime.toISOString(),
          notes: formData.notes,
          status: formData.status,
          usedPackage: usePackage,
          clientPackageId: usePackage ? selectedClientPackageId : null
        };
        if (additionalServiceIds.length > 0) {
          data.additionalServiceIds = additionalServiceIds;
        }
        await updateMutation.mutateAsync({ id: editingAppointment.id, ...data });
        toast({ title: "Agendamento atualizado com sucesso!" });
      } else {
        // Create all appointments
        let created = 0;
        for (const dateTime of dates) {
          const endTime = new Date(dateTime.getTime() + duration * 60000);
          const data: any = {
            clientId: formData.clientId,
            barberId: formData.barberId,
            serviceId: effectiveServiceId,
            startTime: dateTime.toISOString(),
            endTime: endTime.toISOString(),
            notes: formData.notes,
            status: formData.status,
            usedPackage: usePackage,
            clientPackageId: usePackage ? selectedClientPackageId : null
          };
          if (additionalServiceIds.length > 0) {
            data.additionalServiceIds = additionalServiceIds;
          }
          try {
            await createMutation.mutateAsync(data);
            created++;
          } catch (err) {
            console.error(`Erro ao criar agendamento para ${dateTime}:`, err);
          }
        }
        if (created === 1) {
          toast({ title: "Agendamento criado com sucesso!" });
        } else if (created > 1) {
          toast({ title: `${created} agendamentos criados com sucesso!` });
        }
      }
      setIsDialogOpen(false);
      resetForm();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleSlotClick = (slot: Date, barberId: number) => {
    setFormData({
      ...formData,
      barberId: barberId.toString(),
      date: format(currentDate, "yyyy-MM-dd"),
      time: format(slot, "HH:mm")
    });
    setIsDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!editingAppointment) return;
    
    try {
      await deleteMutation.mutateAsync(editingAppointment.id);
      toast({ title: "Agendamento excluído com sucesso!" });
      setIsDialogOpen(false);
      resetForm();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      setConfirmingDelete(false);
    }
  };

  const handleOpenComanda = async () => {
    if (!editingAppointment) return;
    
    try {
      const clientId = editingAppointment.clientId;
      if (clientId) {
        const response = await fetch(`/api/comandas/client/${clientId}/open`, { credentials: 'include' });
        if (response.ok) {
          const existingComanda = await response.json();
          if (existingComanda) {
            const prefilledData: any = {
              appointmentId: editingAppointment.id,
              clientId: editingAppointment.clientId,
              serviceId: editingAppointment.serviceId,
              barberId: editingAppointment.barberId,
              existingComandaId: existingComanda.id
            };
            
            if (editingAppointment.allServiceIds && editingAppointment.allServiceIds.length > 0) {
              prefilledData.allServiceIds = editingAppointment.allServiceIds;
            }
            
            if (editingAppointment.usedPackage && editingAppointment.clientPackageId) {
              prefilledData.usedPackage = true;
              prefilledData.clientPackageId = editingAppointment.clientPackageId;
            }
            
            localStorage.setItem('posPrefilledData', JSON.stringify(prefilledData));
            
            toast({ 
              title: "Cliente já tem comanda em espera", 
              description: "A comanda existente será carregada no PDV."
            });
            setIsDialogOpen(false);
            resetForm();
            setLocation("/pos");
            return;
          }
        }
      }
    } catch (error) {
      console.error('Erro ao verificar comanda existente:', error);
    }
    
    const prefilledData: any = {
      appointmentId: editingAppointment.id,
      clientId: editingAppointment.clientId,
      serviceId: editingAppointment.serviceId,
      barberId: editingAppointment.barberId
    };
    
    if (editingAppointment.allServiceIds && editingAppointment.allServiceIds.length > 0) {
      prefilledData.allServiceIds = editingAppointment.allServiceIds;
    }
    
    if (editingAppointment.usedPackage && editingAppointment.clientPackageId) {
      prefilledData.usedPackage = true;
      prefilledData.clientPackageId = editingAppointment.clientPackageId;
    }
    
    localStorage.setItem('posPrefilledData', JSON.stringify(prefilledData));
    
    toast({ title: "Abrindo comanda..." });
    setIsDialogOpen(false);
    resetForm();
    setLocation("/pos");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed": return "border-green-500 bg-green-500/10";
      case "completed": return "border-blue-500 bg-blue-500/10";
      case "cancelled": return "border-red-500 bg-red-500/10";
      case "no_show": return "border-orange-500 bg-orange-500/10";
      default: return "border-yellow-500 bg-yellow-500/10";
    }
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientData.name.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    try {
      const newClient: any = await createClientMutation.mutateAsync(newClientData);
      toast({ title: "Cliente cadastrado com sucesso!" });
      
      // Atualizar o formulário com o novo ID do cliente
      setFormData(prev => ({ ...prev, clientId: newClient.id.toString() }));
      
      setNewClientData({ name: "", phone: "", email: "" });
      setIsNewClientDialogOpen(false);
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  if (loadingBarbers || loadingAppointments) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100vh-8rem)] gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Agenda</h1>
            <p className="text-muted-foreground">Gerencie os horários dos seus barbeiros.</p>
          </div>
          
          <div className="flex items-center gap-2 bg-card p-1 rounded-lg border border-border">
            <Button variant="ghost" size="icon" onClick={handlePrevDay} data-testid="button-prev-day">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 px-4 min-w-[200px] justify-center font-medium hover:bg-accent" data-testid="text-current-date">
                  <CalendarIcon className="h-4 w-4 text-primary" />
                  {format(currentDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <Calendar
                  mode="single"
                  selected={currentDate}
                  onSelect={(date) => date && setCurrentDate(date)}
                  locale={ptBR}
                  className="rounded-md border"
                />
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="icon" onClick={handleNextDay} data-testid="button-next-day">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleToday} data-testid="button-today">Hoje</Button>
            <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button data-testid="button-new-appointment" className="bg-primary text-primary-foreground hover:bg-primary/90">
                  <Plus className="mr-2 h-4 w-4" /> Novo Agendamento
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingAppointment ? "Editar Agendamento" : "Novo Agendamento"}</DialogTitle>
                  <DialogDescription>
                    {editingAppointment ? "Atualize os dados do agendamento." : "Preencha os dados para criar um novo agendamento."}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-appointment">
                  <div>
                    <Label htmlFor="client">Cliente</Label>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <ClientCombobox
                          clients={clients}
                          value={formData.clientId}
                          onValueChange={(v) => {
                            setFormData({ ...formData, clientId: v });
                            // Reset package selection when client changes
                            setUsePackage(false);
                            setSelectedClientPackageId("");
                          }}
                          data-testid="select-client"
                        />
                      </div>
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="icon"
                        onClick={() => setIsNewClientDialogOpen(true)}
                        data-testid="button-add-client-inline"
                        title="Adicionar novo cliente"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {/* Seleção de Pacote - aparece quando cliente tem pacotes ativos */}
                  {formData.clientId && getClientActivePackages(formData.clientId).length > 0 && (
                    <div className="p-4 bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-lg space-y-3">
                      <div className="flex items-center gap-2 text-green-400 font-medium text-sm">
                        <Package className="h-4 w-4" />
                        <span>Cliente tem pacote(s) ativo(s)!</span>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <Button
                          type="button"
                          variant={usePackage ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            setUsePackage(true);
                            // Auto-selecionar primeiro pacote se houver apenas um
                            const pkgs = getClientActivePackages(formData.clientId);
                            if (pkgs.length === 1) {
                              setSelectedClientPackageId(pkgs[0].clientPackage.id);
                            }
                          }}
                          className={usePackage ? "bg-green-600 hover:bg-green-700" : "border-green-500/50 text-green-400 hover:bg-green-500/10"}
                          data-testid="button-use-package"
                        >
                          <Package className="h-4 w-4 mr-2" />
                          Usar Pacote
                        </Button>
                        <Button
                          type="button"
                          variant={!usePackage ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            setUsePackage(false);
                            setSelectedClientPackageId("");
                          }}
                          className={!usePackage ? "" : "border-border hover:bg-accent"}
                          data-testid="button-normal-service"
                        >
                          <Scissors className="h-4 w-4 mr-2" />
                          Serviço Normal
                        </Button>
                      </div>
                      
                      {usePackage && (
                        <div className="space-y-2">
                          <Label className="text-green-400 text-xs">Selecione o Pacote:</Label>
                          <Select 
                            value={selectedClientPackageId} 
                            onValueChange={(v) => setSelectedClientPackageId(v)}
                          >
                            <SelectTrigger className="bg-background/50 border-green-500/30" data-testid="select-package">
                              <SelectValue placeholder="Escolha o pacote" />
                            </SelectTrigger>
                            <SelectContent>
                              {getClientActivePackages(formData.clientId).map((item: any) => {
                                const svc = services.find((s: any) => s.id === item.package.serviceId);
                                return (
                                  <SelectItem key={item.clientPackage.id} value={item.clientPackage.id} data-testid={`select-package-option-${item.clientPackage.id}`}>
                                    <div className="flex flex-col">
                                      <span className="font-medium">{item.package.name}</span>
                                      <span className="text-xs text-muted-foreground">
                                        {svc?.name || "Serviço"} - {item.clientPackage.quantityRemaining} uso(s) restante(s)
                                      </span>
                                    </div>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                          
                          {selectedClientPackageId && (
                            <div className="flex items-center gap-2 text-xs text-green-400 mt-2">
                              <Gift className="h-3 w-3" />
                              <span>
                                Uso #{(getSelectedPackageDetails()?.clientPackage?.quantityUsed || 0) + 1} de{" "}
                                {(getSelectedPackageDetails()?.clientPackage?.quantityRemaining || 0) + (getSelectedPackageDetails()?.clientPackage?.quantityUsed || 0)} total
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div>
                    <Label htmlFor="barber">Barbeiro</Label>
                    <Select value={formData.barberId} onValueChange={(v) => setFormData({ ...formData, barberId: v })}>
                      <SelectTrigger data-testid="select-barber">
                        <SelectValue placeholder="Selecione o barbeiro" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeBarbers.map((b: any) => (
                          <SelectItem key={b.id} value={b.id.toString()} data-testid={`select-barber-option-${b.id}`}>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6 border border-primary/30">
                                <AvatarImage src={b.avatar?.startsWith('/objects/') ? b.avatar : `/objects/${b.avatar}`} alt={b.name} data-testid={`img-barber-avatar-select-${b.id}`} />
                                <AvatarFallback>{b.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                              </Avatar>
                              <span>{b.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Serviço Principal - opcional quando usa pacote */}
                  {usePackage && selectedClientPackageId ? (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        Serviço Adicional <span className="text-muted-foreground text-xs">(opcional)</span>
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        O serviço do pacote ({services.find((s: any) => s.id.toString() === getPackageServiceId())?.name || "Serviço"}) já está incluído.
                        Adicione outro serviço se desejar.
                      </p>
                      <ServiceCombobox
                        services={services.filter((s: any) => s.id.toString() !== getPackageServiceId())}
                        value={formData.serviceId}
                        onValueChange={(v) => setFormData({ ...formData, serviceId: v })}
                        data-testid="select-service"
                        placeholder="Adicionar serviço extra (opcional)"
                      />
                    </div>
                  ) : (
                    <div>
                      <Label htmlFor="service">Serviço Principal</Label>
                      <ServiceCombobox
                        services={services}
                        value={formData.serviceId}
                        onValueChange={(v) => setFormData({ ...formData, serviceId: v })}
                        data-testid="select-service"
                      />
                    </div>
                  )}

                  {/* Serviços Adicionais */}
                  {(formData.serviceId || (usePackage && selectedClientPackageId)) && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Serviços Adicionais</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setAdditionalServiceIds([...additionalServiceIds, ""])}
                          data-testid="button-add-service"
                          className="h-7 text-xs"
                        >
                          <Plus className="h-3 w-3 mr-1" /> Adicionar Serviço
                        </Button>
                      </div>
                      
                      {additionalServiceIds.map((svcId, index) => (
                        <div key={index} className="flex gap-2 items-center">
                          <div className="flex-1">
                            <ServiceCombobox
                              services={services.filter((s: any) => 
                                s.id.toString() !== formData.serviceId && 
                                !additionalServiceIds.filter((_, i) => i !== index).includes(s.id.toString())
                              )}
                              value={svcId}
                              onValueChange={(v) => {
                                const newIds = [...additionalServiceIds];
                                newIds[index] = v;
                                setAdditionalServiceIds(newIds);
                              }}
                              data-testid={`select-additional-service-${index}`}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              const newIds = additionalServiceIds.filter((_, i) => i !== index);
                              setAdditionalServiceIds(newIds);
                            }}
                            data-testid={`button-remove-service-${index}`}
                            className="h-8 w-8 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      
                      {/* Resumo de duração e preço total */}
                      {(formData.serviceId || additionalServiceIds.length > 0 || (usePackage && selectedClientPackageId)) && (
                        <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg mt-2">
                          <div className="flex justify-between items-center text-sm">
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-primary" />
                              <span>Duração total: <strong>{getTotalDuration()} min</strong></span>
                            </div>
                            <div className="flex flex-col items-end">
                              {usePackage && selectedClientPackageId ? (
                                <>
                                  {getTotalPrice() > 0 && (
                                    <span className="text-primary font-semibold">
                                      +R$ {getTotalPrice().toFixed(2)} (extras)
                                    </span>
                                  )}
                                  <span className="text-green-400 text-xs flex items-center gap-1">
                                    <Package className="h-3 w-3" /> Pacote incluso
                                  </span>
                                </>
                              ) : (
                                <span className="text-primary font-semibold">
                                  R$ {getTotalPrice().toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="date">Data</Label>
                      <Input 
                        type="date" 
                        id="date"
                        data-testid="input-date"
                        value={formData.date} 
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })} 
                        required 
                      />
                    </div>
                    <div>
                      <Label htmlFor="time">Horário</Label>
                      <Input 
                        type="time" 
                        id="time"
                        data-testid="input-time"
                        value={formData.time} 
                        onChange={(e) => setFormData({ ...formData, time: e.target.value })} 
                        required 
                      />
                    </div>
                  </div>

                  {!editingAppointment && (
                    <div className="space-y-3 p-3 bg-background/50 border border-border rounded-lg">
                      <div className="flex items-center gap-2">
                        <Repeat className="h-4 w-4 text-primary" />
                        <Label className="text-sm font-medium">Repetir Agendamento</Label>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Select 
                            value={recurrence.type} 
                            onValueChange={(v: "none" | "weekly" | "biweekly" | "monthly") => setRecurrence({ ...recurrence, type: v })}
                          >
                            <SelectTrigger data-testid="select-recurrence-type">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Não repetir</SelectItem>
                              <SelectItem value="weekly">Toda semana</SelectItem>
                              <SelectItem value="biweekly">A cada 15 dias</SelectItem>
                              <SelectItem value="monthly">Todo mês</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {recurrence.type !== "none" && (
                          <div>
                            <Select 
                              value={recurrence.count.toString()} 
                              onValueChange={(v) => setRecurrence({ ...recurrence, count: parseInt(v) })}
                            >
                              <SelectTrigger data-testid="select-recurrence-count">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="2">2 vezes</SelectItem>
                                <SelectItem value="4">4 vezes</SelectItem>
                                <SelectItem value="6">6 vezes</SelectItem>
                                <SelectItem value="8">8 vezes</SelectItem>
                                <SelectItem value="10">10 vezes</SelectItem>
                                <SelectItem value="12">12 vezes</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                      {recurrence.type !== "none" && (
                        <p className="text-xs text-muted-foreground">
                          Serão criados {recurrence.count} agendamentos{" "}
                          {recurrence.type === "weekly" && "semanais"}
                          {recurrence.type === "biweekly" && "quinzenais"}
                          {recurrence.type === "monthly" && "mensais"}
                        </p>
                      )}
                    </div>
                  )}
                  {editingAppointment && (
                    <div>
                      <Label htmlFor="status">Status</Label>
                      <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                        <SelectTrigger data-testid="select-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="scheduled">Agendado</SelectItem>
                          <SelectItem value="confirmed">Confirmado</SelectItem>
                          <SelectItem value="completed">Concluído</SelectItem>
                          <SelectItem value="cancelled">Cancelado</SelectItem>
                          <SelectItem value="no_show">Não compareceu</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label htmlFor="notes">Observações</Label>
                    <Input 
                      id="notes"
                      data-testid="input-notes"
                      value={formData.notes} 
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })} 
                      placeholder="Observações do agendamento (opcional)"
                    />
                  </div>
                  <DialogFooter className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                    <div className="flex gap-2">
                      {editingAppointment && !confirmingDelete && (
                        <Button 
                          type="button" 
                          variant="destructive" 
                          onClick={() => setConfirmingDelete(true)}
                          data-testid="button-delete-appointment"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Excluir
                        </Button>
                      )}
                      {editingAppointment && confirmingDelete && (
                        <div className="flex gap-2">
                          <Button 
                            type="button" 
                            variant="outline" 
                            onClick={() => setConfirmingDelete(false)}
                            data-testid="button-cancel-delete"
                          >
                            Cancelar
                          </Button>
                          <Button 
                            type="button" 
                            variant="destructive" 
                            onClick={handleDeleteConfirm}
                            data-testid="button-confirm-delete"
                            disabled={deleteMutation.isPending}
                          >
                            {deleteMutation.isPending ? "Excluindo..." : "Confirmar Exclusão"}
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {editingAppointment && !confirmingDelete && editingAppointment.status !== 'completed' && editingAppointment.status !== 'cancelled' && (
                        <Button 
                          type="button" 
                          onClick={handleOpenComanda}
                          data-testid="button-open-comanda"
                          disabled={updateMutation.isPending}
                          className="bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                          <ShoppingBag className="mr-2 h-4 w-4" />
                          {updateMutation.isPending ? "Abrindo..." : "Abrir Comanda"}
                        </Button>
                      )}
                      {!confirmingDelete && (
                        <Button type="submit" variant="outline" data-testid="button-submit-appointment" disabled={createMutation.isPending || updateMutation.isPending}>
                          {(createMutation.isPending || updateMutation.isPending) ? "Salvando..." : (editingAppointment ? "Atualizar" : "Agendar")}
                        </Button>
                      )}
                    </div>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            
            {/* Dialog para novo cliente */}
            <Dialog open={isNewClientDialogOpen} onOpenChange={setIsNewClientDialogOpen}>
              <DialogContent className="bg-card border-border">
                <DialogHeader>
                  <DialogTitle>Novo Cliente</DialogTitle>
                  <DialogDescription>
                    Cadastre um novo cliente rapidamente.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateClient} className="space-y-4">
                  <div>
                    <Label htmlFor="newClientName">Nome *</Label>
                    <Input
                      id="newClientName"
                      value={newClientData.name}
                      onChange={(e) => setNewClientData({ ...newClientData, name: e.target.value })}
                      placeholder="Nome do cliente"
                      data-testid="input-new-client-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="newClientPhone">Telefone</Label>
                    <Input
                      id="newClientPhone"
                      value={newClientData.phone}
                      onChange={(e) => setNewClientData({ ...newClientData, phone: e.target.value })}
                      placeholder="(00) 00000-0000"
                      data-testid="input-new-client-phone"
                    />
                  </div>
                  <div>
                    <Label htmlFor="newClientEmail">Email</Label>
                    <Input
                      id="newClientEmail"
                      type="email"
                      value={newClientData.email}
                      onChange={(e) => setNewClientData({ ...newClientData, email: e.target.value })}
                      placeholder="email@exemplo.com"
                      data-testid="input-new-client-email"
                    />
                  </div>
                  <DialogFooter>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsNewClientDialogOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={createClientMutation.isPending}
                      data-testid="button-save-new-client"
                    >
                      {createClientMutation.isPending ? "Salvando..." : "Cadastrar"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {activeBarbers.length === 0 ? (
          <Card className="flex-1 flex items-center justify-center border-border/50 bg-card/50">
            <div className="text-center text-muted-foreground">
              <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum barbeiro ativo cadastrado.</p>
              <p className="text-sm">Cadastre barbeiros para usar a agenda.</p>
            </div>
          </Card>
        ) : (
          <Card className="flex-1 overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm flex flex-col">
            <div className="flex border-b border-border">
              <div className="w-20 flex-shrink-0 border-r border-border p-4 bg-background/50">
                <span className="text-xs font-bold text-muted-foreground">HORÁRIO</span>
              </div>
              {activeBarbers.map((barber: any) => (
                <div key={barber.id} className="flex-1 p-4 border-r border-border min-w-[200px] flex items-center gap-3 bg-background/30 justify-center">
                  <Avatar className="h-8 w-8 border border-primary/30" data-testid={`avatar-barber-header-${barber.id}`}>
                    <AvatarImage src={barber.avatar?.startsWith('/objects/') ? barber.avatar : `/objects/${barber.avatar}`} alt={barber.name} data-testid={`img-barber-avatar-header-${barber.id}`} />
                    <AvatarFallback>{barber.name.substring(0,2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="text-center">
                    <p className="text-sm font-bold text-foreground" data-testid={`text-barber-name-${barber.id}`}>{barber.name}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">{barber.role || "Barbeiro"}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="relative min-w-[800px]"> 
                {timeSlots.map((slot, i) => (
                  <div key={i} className="flex h-12 border-b border-border/30 group hover:bg-white/5 transition-colors">
                    <div className="w-20 flex-shrink-0 border-r border-border/30 p-1 text-right flex items-center justify-end pr-2">
                      <span className="text-xs text-muted-foreground font-mono">
                        {format(slot, "HH:mm")}
                      </span>
                    </div>
                    {activeBarbers.map((barber: any) => (
                      <div 
                        key={barber.id} 
                        className="flex-1 border-r border-border/30 relative cursor-pointer"
                        onClick={() => handleSlotClick(slot, barber.id)}
                        data-testid={`slot-${format(slot, "HH:mm")}-${barber.id}`}
                      >
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-primary/5 pointer-events-none" />
                      </div>
                    ))}
                  </div>
                ))}

                {/* Blocos de intervalo/almoço dos barbeiros - por dia da semana */}
                {activeBarbers.map((barber: any, barberIndex: number) => {
                  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
                  const dayKey = dayNames[currentDate.getDay()];
                  
                  let breakStart: string | null = null;
                  let breakEnd: string | null = null;
                  
                  if (barber.breakSchedule && barber.breakSchedule[dayKey]?.enabled) {
                    breakStart = barber.breakSchedule[dayKey].start;
                    breakEnd = barber.breakSchedule[dayKey].end;
                  } else if (barber.lunchStart && barber.lunchEnd) {
                    breakStart = barber.lunchStart;
                    breakEnd = barber.lunchEnd;
                  }
                  
                  if (!breakStart || !breakEnd) return null;
                  
                  const [lunchStartHour, lunchStartMin] = breakStart.split(':').map(Number);
                  const [lunchEndHour, lunchEndMin] = breakEnd.split(':').map(Number);
                  
                  const lunchStartMinutes = lunchStartHour * 60 + lunchStartMin;
                  const lunchEndMinutes = lunchEndHour * 60 + lunchEndMin;
                  const startOffset = lunchStartMinutes - (openHour * 60);
                  const topPosition = (startOffset / 30) * 48;
                  const duration = lunchEndMinutes - lunchStartMinutes;
                  const height = (duration / 30) * 48;
                  
                  const leftPosition = `calc(5rem + ${barberIndex} * ((100% - 5rem) / ${activeBarbers.length}))`;
                  const width = `calc((100% - 5rem) / ${activeBarbers.length} - 8px)`;
                  
                  return (
                    <div
                      key={`lunch-${barber.id}`}
                      className="absolute z-5 rounded-md p-1 bg-muted/60 border border-dashed border-muted-foreground/30 flex flex-col items-center justify-center"
                      style={{
                        top: `${topPosition}px`,
                        height: `${height - 4}px`,
                        left: `calc(${leftPosition} + 4px)`,
                        width: width
                      }}
                      data-testid={`lunch-block-${barber.id}`}
                    >
                      <Coffee className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[9px] text-muted-foreground font-medium">Intervalo</span>
                    </div>
                  );
                })}

                {appointments
                  .filter((apt: any) => apt.status !== 'cancelled')
                  .map((apt: any) => {
                  const aptStart = new Date(apt.startTime);
                  const aptEnd = new Date(apt.endTime);
                  
                  // Use UTC date for comparison since appointments are stored in UTC
                  const currentDateUTC = new Date(Date.UTC(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()));
                  if (!isSameDayUTC(aptStart, currentDateUTC)) return null;

                  // Use UTC hours/minutes for positioning
                  const startMinutes = aptStart.getUTCHours() * 60 + aptStart.getUTCMinutes();
                  const startOffset = startMinutes - (openHour * 60);
                  const topPosition = (startOffset / 30) * 48;
                  
                  const service = services.find((s: any) => s.id === apt.serviceId);
                  const duration = Math.round((aptEnd.getTime() - aptStart.getTime()) / 60000) || 30;
                  const height = (duration / 30) * 48;

                  const barberIndex = activeBarbers.findIndex((b: any) => b.id === apt.barberId);
                  if (barberIndex === -1) return null;

                  const leftPosition = `calc(5rem + ${barberIndex} * ((100% - 5rem) / ${activeBarbers.length}))`;
                  const width = `calc((100% - 5rem) / ${activeBarbers.length} - 8px)`;

                  const client = clients.find((c: any) => c.id === apt.clientId);
                  const barber = activeBarbers.find((b: any) => b.id === apt.barberId);

                  return (
                    <div
                      key={apt.id}
                      className={`absolute z-10 rounded-md p-2 border-l-4 shadow-lg cursor-pointer transition-transform hover:scale-[1.02] active:scale-95 flex flex-col justify-between overflow-hidden ${getStatusColor(apt.status)}`}
                      style={{
                        top: `${topPosition}px`,
                        height: `${height - 4}px`,
                        left: `calc(${leftPosition} + 4px)`,
                        width: width
                      }}
                      onClick={() => handleEdit(apt)}
                      data-testid={`appointment-${apt.id}`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-bold text-foreground truncate">
                            {service?.name || "Serviço"}
                            {apt.additionalServicesCount > 0 && (
                              <span className="text-primary ml-1">+{apt.additionalServicesCount}</span>
                            )}
                          </span>
                          {apt.usedPackage && (
                            <Package className="w-3 h-3 text-primary flex-shrink-0" data-testid={`icon-package-${apt.id}`} />
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <User className="w-3 h-3" />
                        <span>{client?.name || "Cliente"}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{formatTimeUTC(aptStart)} - {formatTimeUTC(aptEnd)}</span>
                        {apt.usedPackage && apt.clientPackageId && (() => {
                          const clientPkg = allClientPackages.find((cp: any) => cp.id === apt.clientPackageId);
                          if (clientPkg) {
                            const totalUses = (clientPkg.quantityRemaining || 0) + (clientPkg.quantityUsed || 0);
                            const usedCount = clientPkg.quantityUsed || 0;
                            return (
                              <Badge variant="outline" className="text-[8px] px-1 py-0 h-4 border-green-500/50 text-green-400 bg-green-500/10">
                                Uso {usedCount}/{totalUses}
                              </Badge>
                            );
                          }
                          return (
                            <Badge variant="outline" className="text-[8px] px-1 py-0 h-4 border-primary/50 text-primary">
                              Pacote
                            </Badge>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}
