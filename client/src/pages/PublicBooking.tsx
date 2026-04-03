import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, addDays, isBefore, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Calendar, 
  Clock, 
  User, 
  Phone, 
  Scissors, 
  ChevronLeft, 
  ChevronRight,
  Check,
  X,
  Loader2,
  CalendarDays,
  Sparkles,
  Package
} from "lucide-react";

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

interface Barber {
  id: string;
  name: string;
  avatar: string | null;
  role: string | null;
  lunchStart: string | null;
  lunchEnd: string | null;
  breakSchedule: BreakSchedule | null;
}

interface Service {
  id: string;
  name: string;
  price: string;
  duration: number;
  category: string | null;
}

interface BusySlot {
  startTime: string;
  endTime: string;
}

interface ClientAppointment {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  barberName: string;
  barberAvatar: string | null;
  serviceName: string;
  servicePrice: string;
}

interface ActivePackage {
  id: string;
  packageId: string;
  packageName: string;
  serviceId: string;
  serviceName: string;
  serviceDuration: number;
  quantityRemaining: number;
  quantityOriginal: number;
  expiresAt: string;
}

interface RecognizedClient {
  id: string;
  name: string;
  phone: string;
}

type Step = 'welcome' | 'login' | 'register' | 'client-home' | 'barber' | 'service' | 'datetime' | 'confirm' | 'success' | 'my-appointments';

export default function PublicBooking() {
  const { barbershopId } = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [step, setStep] = useState<Step>('welcome');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [loginPhone, setLoginPhone] = useState('');
  const [recognizedClient, setRecognizedClient] = useState<RecognizedClient | null>(null);
  const [activePackages, setActivePackages] = useState<ActivePackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<ActivePackage | null>(null);
  const [usePackageMode, setUsePackageMode] = useState(false);
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [additionalServices, setAdditionalServices] = useState<Service[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [appointmentToCancel, setAppointmentToCancel] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isAutoAssigning, setIsAutoAssigning] = useState(false);
  const [cameFromAutoAssign, setCameFromAutoAssign] = useState(false);

  const { data: barbershop } = useQuery({
    queryKey: [`/public/${barbershopId}/info`],
    queryFn: async () => {
      const res = await fetch(`/api/public/${barbershopId}/info`);
      if (!res.ok) throw new Error('Barbearia não encontrada');
      return res.json();
    },
    enabled: !!barbershopId
  });

  const { data: barbers = [] } = useQuery<Barber[]>({
    queryKey: [`/public/${barbershopId}/barbers`],
    queryFn: async () => {
      const res = await fetch(`/api/public/${barbershopId}/barbers`);
      return res.json();
    },
    enabled: !!barbershopId && step === 'barber'
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: [`/public/${barbershopId}/services`, selectedBarber?.id],
    queryFn: async () => {
      const url = selectedBarber
        ? `/api/public/${barbershopId}/services?barberId=${selectedBarber.id}`
        : `/api/public/${barbershopId}/services`;
      const res = await fetch(url);
      return res.json();
    },
    enabled: !!barbershopId && step === 'service'
  });

  const { data: availability } = useQuery<{ busySlots: BusySlot[] }>({
    queryKey: [`/public/${barbershopId}/availability`, selectedBarber?.id, format(selectedDate, 'yyyy-MM-dd')],
    queryFn: async () => {
      const res = await fetch(
        `/api/public/${barbershopId}/availability?barberId=${selectedBarber?.id}&date=${format(selectedDate, 'yyyy-MM-dd')}`
      );
      return res.json();
    },
    enabled: !!barbershopId && !!selectedBarber && step === 'datetime'
  });

  const getTimezoneOffset = () => {
    const tzOffset = new Date().getTimezoneOffset();
    const tzHours = Math.floor(Math.abs(tzOffset) / 60);
    const tzMins = Math.abs(tzOffset) % 60;
    const tzSign = tzOffset <= 0 ? '+' : '-';
    return `${tzSign}${tzHours.toString().padStart(2, '0')}:${tzMins.toString().padStart(2, '0')}`;
  };

  const { data: myAppointments = [], refetch: refetchMyAppointments } = useQuery<ClientAppointment[]>({
    queryKey: [`/public/${barbershopId}/my-appointments`, clientPhone],
    queryFn: async () => {
      const tzOffset = getTimezoneOffset();
      const res = await fetch(`/api/public/${barbershopId}/my-appointments?phone=${encodeURIComponent(clientPhone)}&timezoneOffset=${encodeURIComponent(tzOffset)}`);
      return res.json();
    },
    enabled: !!barbershopId && !!clientPhone && step === 'my-appointments'
  });

  const handleClientLookup = async () => {
    if (!loginPhone.trim()) {
      toast({
        title: "Telefone obrigatório",
        description: "Por favor, digite seu telefone.",
        variant: "destructive"
      });
      return;
    }
    
    setIsLookingUp(true);
    try {
      const res = await fetch(`/api/public/${barbershopId}/client-lookup?phone=${encodeURIComponent(loginPhone)}`);
      const data = await res.json();
      
      if (data.found) {
        setRecognizedClient(data.client);
        setActivePackages(data.activePackages || []);
        setClientName(data.client.name);
        setClientPhone(data.client.phone);
        setStep('client-home');
      } else {
        toast({
          title: "Cliente não encontrado",
          description: "Não encontramos seu cadastro. Crie uma conta para continuar.",
          variant: "destructive"
        });
        setClientPhone(loginPhone);
        setStep('register');
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao buscar cliente.",
        variant: "destructive"
      });
    } finally {
      setIsLookingUp(false);
    }
  };

  const bookMutation = useMutation({
    mutationFn: async () => {
      // Get timezone offset for server-side validation
      const tzOffset = new Date().getTimezoneOffset();
      const tzHours = Math.floor(Math.abs(tzOffset) / 60);
      const tzMins = Math.abs(tzOffset) % 60;
      const tzSign = tzOffset <= 0 ? '+' : '-';
      const timezoneOffset = `${tzSign}${tzHours.toString().padStart(2, '0')}:${tzMins.toString().padStart(2, '0')}`;
      
      const bookingData: any = {
        barberId: selectedBarber?.id,
        serviceId: usePackageMode && selectedPackage ? selectedPackage.serviceId : selectedService?.id,
        date: format(selectedDate, 'yyyy-MM-dd'),
        time: selectedTime,
        timezoneOffset
      };
      
      if (additionalServices.length > 0) {
        bookingData.additionalServiceIds = additionalServices.map(s => s.id);
      }
      
      if (usePackageMode && recognizedClient && selectedPackage) {
        bookingData.clientId = recognizedClient.id;
        bookingData.usePackage = true;
        bookingData.clientPackageId = selectedPackage.id;
      } else {
        bookingData.clientName = clientName;
        bookingData.clientPhone = clientPhone;
      }
      
      const res = await fetch(`/api/public/${barbershopId}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingData)
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Erro ao agendar');
      }
      return res.json();
    },
    onSuccess: () => {
      setStep('success');
      // Invalidate query so it refetches when user navigates to my-appointments
      queryClient.invalidateQueries({ queryKey: [`/public/${barbershopId}/my-appointments`, clientPhone] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao agendar",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const cancelMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      const res = await fetch(`/api/public/${barbershopId}/cancel/${appointmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientPhone })
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Erro ao cancelar');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Agendamento cancelado",
        description: "Seu agendamento foi cancelado com sucesso.",
      });
      setShowCancelDialog(false);
      setAppointmentToCancel(null);
      refetchMyAppointments();
      queryClient.invalidateQueries({ queryKey: ['/appointments'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao cancelar",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const getDayKey = (date: Date): string => {
    const dayIndex = date.getDay();
    const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return dayMap[dayIndex];
  };

  const generateTimeSlots = () => {
    const slots: string[] = [];
    const interval = barbershop?.bookingIntervalMinutes || 30;
    const dayKey = getDayKey(selectedDate);
    
    let openHour = 8;
    let openMin = 0;
    let closeHour = 20;
    let closeMin = 0;
    
    if (barbershop?.workingHours) {
      const dayHours = (barbershop.workingHours as Record<string, { open: string; close: string; enabled: boolean }>)[dayKey];
      if (dayHours?.enabled) {
        const [oh, om] = dayHours.open.split(':').map(Number);
        const [ch, cm] = dayHours.close.split(':').map(Number);
        openHour = oh;
        openMin = om;
        closeHour = ch;
        closeMin = cm;
      } else if (dayHours?.enabled === false) {
        return [];
      }
    }
    
    let currentHour = openHour;
    let currentMin = openMin;
    
    while (currentHour < closeHour || (currentHour === closeHour && currentMin < closeMin)) {
      const time = `${currentHour.toString().padStart(2, '0')}:${currentMin.toString().padStart(2, '0')}`;
      slots.push(time);
      
      currentMin += interval;
      if (currentMin >= 60) {
        currentHour += Math.floor(currentMin / 60);
        currentMin = currentMin % 60;
      }
    }
    
    return slots;
  };

  const getBarberBreakForDay = (barber: Barber | null, date: Date): { start: string; end: string } | null => {
    if (!barber || !date) return null;
    
    const dayNames: (keyof BreakSchedule)[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayKey = dayNames[date.getDay()];
    
    if (barber.breakSchedule && barber.breakSchedule[dayKey]?.enabled) {
      const dayBreak = barber.breakSchedule[dayKey];
      if (dayBreak.start && dayBreak.end) {
        return { start: dayBreak.start, end: dayBreak.end };
      }
    }
    
    if (barber.lunchStart && barber.lunchEnd) {
      return { start: barber.lunchStart, end: barber.lunchEnd };
    }
    
    return null;
  };

  const isSlotAvailable = (time: string) => {
    const serviceDuration = getTotalDuration();
    
    const [hours, mins] = time.split(':').map(Number);
    const slotStartMinutes = hours * 60 + mins;
    const slotEndMinutes = slotStartMinutes + serviceDuration;
    
    const dayBreak = getBarberBreakForDay(selectedBarber, selectedDate);
    if (dayBreak) {
      const [lunchStartH, lunchStartM] = dayBreak.start.split(':').map(Number);
      const [lunchEndH, lunchEndM] = dayBreak.end.split(':').map(Number);
      const lunchStartMinutes = lunchStartH * 60 + lunchStartM;
      const lunchEndMinutes = lunchEndH * 60 + lunchEndM;
      
      const noOverlap = slotEndMinutes <= lunchStartMinutes || slotStartMinutes >= lunchEndMinutes;
      if (!noOverlap) {
        return false;
      }
    }
    
    if (!availability?.busySlots) return true;
    
    // Create slot times in UTC to match backend storage
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const slotStart = new Date(`${dateStr}T${time.padStart(5, '0')}:00.000Z`);
    const slotEnd = new Date(slotStart.getTime() + serviceDuration * 60000);
    
    // Check advance hours requirement using UTC-as-local convention
    // Convert current local time to same UTC format for accurate comparison
    const realNow = new Date();
    const nowAsUTC = new Date(Date.UTC(
      realNow.getFullYear(),
      realNow.getMonth(),
      realNow.getDate(),
      realNow.getHours(),
      realNow.getMinutes(),
      realNow.getSeconds()
    ));
    const advanceHours = barbershop?.bookingAdvanceHours || 2;
    const minBookingTime = new Date(nowAsUTC.getTime() + advanceHours * 60 * 60 * 1000);
    
    if (isBefore(slotStart, minBookingTime)) return false;
    
    return !availability.busySlots.some(busy => {
      const busyStart = new Date(busy.startTime);
      const busyEnd = new Date(busy.endTime);
      return !(slotEnd <= busyStart || slotStart >= busyEnd);
    });
  };

  const isDayEnabled = (date: Date) => {
    if (!barbershop?.workingHours) return true;
    const dayKey = getDayKey(date);
    const dayHours = (barbershop.workingHours as Record<string, { open: string; close: string; enabled: boolean }>)[dayKey];
    return dayHours?.enabled !== false;
  };

  const getMaxDate = () => {
    const maxDays = barbershop?.bookingMaxDaysAhead || 30;
    return addDays(new Date(), maxDays);
  };

  const formatPrice = (price: string) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(parseFloat(price));
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleIdentify = () => {
    if (!clientName.trim() || !clientPhone.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Por favor, preencha seu nome e telefone.",
        variant: "destructive"
      });
      return;
    }
    setStep('barber');
  };

  const resetBooking = () => {
    setSelectedBarber(null);
    setSelectedService(null);
    setAdditionalServices([]);
    setSelectedTime(null);
    setCameFromAutoAssign(false);
    setStep('barber');
  };

  const handleAutoAssign = async () => {
    if (!selectedService) return;
    setIsAutoAssigning(true);
    try {
      const serviceId = usePackageMode && selectedPackage
        ? selectedPackage.serviceId
        : selectedService.id;

      const res = await fetch(`/api/public/${barbershopId}/auto-assign-barber?serviceId=${serviceId}`);
      const data = await res.json();

      if (!res.ok || data.error) {
        toast({
          title: "Nenhum horário disponível",
          description: data.error || "Não encontramos profissional disponível. Escolha manualmente.",
          variant: "destructive",
        });
        return;
      }

      setSelectedBarber({
        id: data.barberId,
        name: data.barberName,
        avatar: data.barberAvatar,
        role: data.barberRole,
        lunchStart: data.barberLunchStart,
        lunchEnd: data.barberLunchEnd,
        breakSchedule: data.barberBreakSchedule,
      });

      const [year, month, day] = data.firstSlotDate.split('-').map(Number);
      setSelectedDate(new Date(year, month - 1, day));
      setSelectedTime(data.firstSlotTime);
      setCameFromAutoAssign(true);
      setStep('confirm');
    } catch {
      toast({
        title: "Erro",
        description: "Não foi possível buscar horário disponível.",
        variant: "destructive",
      });
    } finally {
      setIsAutoAssigning(false);
    }
  };

  const getTotalDuration = () => {
    let duration = selectedService?.duration || selectedPackage?.serviceDuration || 30;
    for (const svc of additionalServices) {
      duration += svc.duration;
    }
    return duration;
  };

  const getTotalPrice = () => {
    if (usePackageMode) return 0;
    let total = parseFloat(selectedService?.price || '0');
    for (const svc of additionalServices) {
      total += parseFloat(svc.price);
    }
    return total;
  };

  const toggleAdditionalService = (service: Service) => {
    if (additionalServices.some(s => s.id === service.id)) {
      setAdditionalServices(additionalServices.filter(s => s.id !== service.id));
    } else {
      setAdditionalServices([...additionalServices, service]);
    }
  };

  if (!barbershopId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center">
        <Card className="w-full max-w-md border-primary/20">
          <CardContent className="pt-6 text-center">
            <X className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Link inválido</h2>
            <p className="text-muted-foreground">Este link de agendamento não é válido.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container max-w-lg mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border border-primary/30 mb-4">
            <Scissors className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-serif font-bold text-foreground" data-testid="text-barbershop-name">
            {barbershop?.name || 'Carregando...'}
          </h1>
          <p className="text-muted-foreground mt-1">Agende seu horário online</p>
        </div>

        {step === 'welcome' && (
          <Card className="border-primary/20 bg-card/80 backdrop-blur" data-testid="card-welcome">
            <CardHeader className="text-center pb-2">
              <CardTitle className="flex items-center justify-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Bem-vindo!
              </CardTitle>
              <CardDescription>
                Como deseja continuar?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                className="w-full bg-primary hover:bg-primary/90 h-14 text-base" 
                onClick={() => setStep('login')}
                data-testid="button-returning-client"
              >
                <User className="h-5 w-5 mr-2" />
                Já sou cliente
              </Button>
              <Button 
                variant="outline"
                className="w-full h-14 text-base border-primary/30"
                onClick={() => setStep('register')}
                data-testid="button-new-client"
              >
                <Sparkles className="h-5 w-5 mr-2" />
                Primeira vez aqui
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 'login' && (
          <Card className="border-primary/20 bg-card/80 backdrop-blur" data-testid="card-login">
            <CardHeader className="pb-2">
              <div className="flex items-center">
                <Button variant="ghost" size="sm" onClick={() => setStep('welcome')}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
              </div>
              <CardTitle className="text-center mt-2 flex items-center justify-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Já sou cliente
              </CardTitle>
              <CardDescription className="text-center">
                Digite seu telefone para encontrar seu cadastro
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Seu WhatsApp</label>
                <Input 
                  placeholder="Ex: (11) 99999-9999"
                  value={loginPhone}
                  onChange={(e) => setLoginPhone(e.target.value)}
                  data-testid="input-login-phone"
                />
              </div>
              <Button 
                className="w-full bg-primary hover:bg-primary/90" 
                onClick={handleClientLookup}
                disabled={isLookingUp}
                data-testid="button-lookup"
              >
                {isLookingUp ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Buscando...
                  </>
                ) : (
                  'Continuar'
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 'register' && (
          <Card className="border-primary/20 bg-card/80 backdrop-blur" data-testid="card-register">
            <CardHeader className="pb-2">
              <div className="flex items-center">
                <Button variant="ghost" size="sm" onClick={() => setStep('welcome')}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
              </div>
              <CardTitle className="text-center mt-2 flex items-center justify-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Novo Cliente
              </CardTitle>
              <CardDescription className="text-center">
                Preencha seus dados para continuar
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Seu nome</label>
                <Input 
                  placeholder="Ex: João Silva"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  data-testid="input-client-name"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Seu WhatsApp</label>
                <Input 
                  placeholder="Ex: (11) 99999-9999"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  data-testid="input-client-phone"
                />
              </div>
              <Button 
                className="w-full bg-primary hover:bg-primary/90" 
                onClick={() => {
                  if (!clientName.trim() || !clientPhone.trim()) {
                    toast({
                      title: "Campos obrigatórios",
                      description: "Por favor, preencha seu nome e telefone.",
                      variant: "destructive"
                    });
                    return;
                  }
                  setUsePackageMode(false);
                  setStep('barber');
                }}
                data-testid="button-continue-register"
              >
                Continuar
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 'client-home' && recognizedClient && (
          <Card className="border-primary/20 bg-card/80 backdrop-blur" data-testid="card-client-home">
            <CardHeader className="pb-2">
              <div className="flex items-center">
                <Button variant="ghost" size="sm" onClick={() => {
                  setRecognizedClient(null);
                  setActivePackages([]);
                  setStep('welcome');
                }}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
              </div>
              <div className="text-center mt-2">
                <CardTitle className="text-xl">
                  Olá, {recognizedClient.name.split(' ')[0]}!
                </CardTitle>
                <CardDescription>
                  O que deseja fazer hoje?
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {activePackages.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-primary flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Seus Pacotes Ativos
                  </h3>
                  {activePackages.map((pkg) => (
                    <div 
                      key={pkg.id}
                      className="p-4 rounded-xl border-2 border-primary/30 bg-primary/5"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-semibold text-primary">{pkg.packageName}</p>
                          <p className="text-sm text-muted-foreground">{pkg.serviceName}</p>
                        </div>
                        <Badge className="bg-primary text-primary-foreground">
                          {pkg.quantityRemaining} usos
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">
                        Válido até {format(new Date(pkg.expiresAt), "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                      <Button 
                        className="w-full bg-primary hover:bg-primary/90"
                        onClick={() => {
                          setSelectedPackage(pkg);
                          setUsePackageMode(true);
                          setAdditionalServices([]);
                          setSelectedService({
                            id: pkg.serviceId,
                            name: pkg.serviceName,
                            price: '0',
                            duration: pkg.serviceDuration,
                            category: null
                          });
                          setStep('barber');
                        }}
                        data-testid={`button-use-package-${pkg.id}`}
                      >
                        Agendar com Pacote (R$ 0,00)
                      </Button>
                    </div>
                  ))}
                  <Separator className="my-4" />
                </div>
              )}
              
              <Button 
                variant="outline"
                className="w-full h-12 border-primary/30"
                onClick={() => {
                  setUsePackageMode(false);
                  setSelectedPackage(null);
                  setStep('barber');
                }}
                data-testid="button-book-normal"
              >
                <Calendar className="h-4 w-4 mr-2" />
                Agendar Serviço Normal
              </Button>
              
              <Button 
                variant="ghost"
                className="w-full"
                onClick={() => setStep('my-appointments')}
                data-testid="button-my-appointments"
              >
                <CalendarDays className="h-4 w-4 mr-2" />
                Meus Agendamentos
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 'barber' && (
          <Card className="border-primary/20 bg-card/80 backdrop-blur" data-testid="card-barber-selection">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => {
                  if (recognizedClient) {
                    setStep('client-home');
                  } else {
                    setStep('register');
                  }
                }}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
                <Badge variant="outline" className="text-primary border-primary/30">
                  {usePackageMode ? 'Pacote' : '1/3'}
                </Badge>
              </div>
              <CardTitle className="text-center mt-2">Escolha o Profissional</CardTitle>
              {usePackageMode && selectedPackage && (
                <div className="flex items-center justify-center gap-2 mt-2 p-2 bg-primary/10 rounded-lg">
                  <Package className="h-4 w-4 text-primary" />
                  <span className="text-sm text-primary font-medium">
                    {selectedPackage.packageName} - R$ 0,00
                  </span>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {!usePackageMode && (
                  <button
                    onClick={() => {
                      setSelectedBarber(null);
                      setStep('service');
                    }}
                    className="flex items-center gap-4 p-4 rounded-xl border border-primary/40 bg-primary/5 hover:border-primary/70 hover:bg-primary/10 transition-all text-left"
                    data-testid="button-barber-no-preference"
                  >
                    <div className="h-14 w-14 rounded-full border-2 border-primary/40 bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-primary">Sem preferência</p>
                      <p className="text-sm text-muted-foreground">Primeiro horário disponível</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-primary ml-auto" />
                  </button>
                )}
                {barbers.map((barber) => (
                  <button
                    key={barber.id}
                    onClick={() => {
                      setSelectedBarber(barber);
                      setCameFromAutoAssign(false);
                      if (usePackageMode) {
                        setStep('datetime');
                      } else {
                        setStep('service');
                      }
                    }}
                    className="flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-background/50 hover:border-primary/50 hover:bg-primary/5 transition-all text-left"
                    data-testid={`button-barber-${barber.id}`}
                  >
                    <Avatar className="h-14 w-14 border-2 border-primary/30">
                      {barber.avatar && (
                        <AvatarImage src={barber.avatar?.startsWith('/objects/') ? barber.avatar : `/objects/${barber.avatar}`} data-testid={`img-barber-${barber.id}`} />
                      )}
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                        {getInitials(barber.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold">{barber.name}</p>
                      <p className="text-sm text-muted-foreground">{barber.role || 'Barbeiro'}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground ml-auto" />
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'service' && (
          <Card className="border-primary/20 bg-card/80 backdrop-blur" data-testid="card-service-selection">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => { setSelectedTime(null); setCameFromAutoAssign(false); setStep('barber'); }}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
                <Badge variant="outline" className="text-primary border-primary/30">2/3</Badge>
              </div>
              <CardTitle className="text-center mt-2">Escolha os Serviços</CardTitle>
              <CardDescription className="text-center">
                Selecione um ou mais serviços
              </CardDescription>
              {selectedBarber && (
                <div className="flex items-center justify-center gap-2 mt-2">
                  <Avatar className="h-6 w-6 border border-primary/30">
                    {selectedBarber.avatar && (
                      <AvatarImage src={selectedBarber.avatar?.startsWith('/objects/') ? selectedBarber.avatar : `/objects/${selectedBarber.avatar}`} />
                    )}
                    <AvatarFallback className="text-xs">{getInitials(selectedBarber.name)}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-muted-foreground">com {selectedBarber.name}</span>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[350px] pr-4">
                <div className="space-y-2">
                  {services.map((service) => {
                    const isSelected = selectedService?.id === service.id;
                    const isAdditional = additionalServices.some(s => s.id === service.id);
                    const isActive = isSelected || isAdditional;
                    return (
                      <button
                        key={service.id}
                        onClick={() => {
                          if (!selectedService) {
                            setSelectedService(service);
                          } else if (isSelected) {
                            setSelectedService(null);
                            setAdditionalServices([]);
                          } else {
                            toggleAdditionalService(service);
                          }
                        }}
                        className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all text-left ${
                          isActive 
                            ? 'border-primary bg-primary/10' 
                            : 'border-border/50 bg-background/50 hover:border-primary/50 hover:bg-primary/5'
                        }`}
                        data-testid={`button-service-${service.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            isActive ? 'border-primary bg-primary' : 'border-muted-foreground'
                          }`}>
                            {isActive && <Check className="h-3 w-3 text-primary-foreground" />}
                          </div>
                          <div>
                            <p className="font-semibold">{service.name}</p>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                              <Clock className="h-3 w-3" />
                              <span>{service.duration} min</span>
                              {service.category && (
                                <>
                                  <span>•</span>
                                  <span>{service.category}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-primary">{formatPrice(service.price)}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
              
              {(selectedService || additionalServices.length > 0) && (
                <div className="mt-4 p-3 bg-primary/10 rounded-lg border border-primary/30">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-muted-foreground">Serviços selecionados:</span>
                    <span className="font-bold text-primary">{formatPrice(getTotalPrice().toString())}</span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    {selectedService && <p>• {selectedService.name}</p>}
                    {additionalServices.map(s => <p key={s.id}>• {s.name}</p>)}
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>Duração total: {getTotalDuration()} min</span>
                  </div>
                </div>
              )}
              
              <Button
                variant="outline"
                className="w-full mt-4 border-primary/30 hover:bg-primary/5"
                disabled={!selectedService || isAutoAssigning}
                onClick={handleAutoAssign}
                data-testid="button-auto-assign"
              >
                {isAutoAssigning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Buscando horário...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Primeiro horário disponível
                  </>
                )}
              </Button>
              {selectedBarber && (
                <Button 
                  className="w-full mt-2 bg-primary hover:bg-primary/90"
                  disabled={!selectedService}
                  onClick={() => setStep('datetime')}
                  data-testid="button-continue-services"
                >
                  Continuar
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {step === 'datetime' && (
          <Card className="border-primary/20 bg-card/80 backdrop-blur" data-testid="card-datetime-selection">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => setStep(usePackageMode ? 'barber' : 'service')}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
                <Badge variant="outline" className="text-primary border-primary/30">
                  {usePackageMode ? 'Pacote' : '3/3'}
                </Badge>
              </div>
              <CardTitle className="text-center mt-2">Data e Horário</CardTitle>
              {usePackageMode && selectedPackage && (
                <div className="flex items-center justify-center gap-2 mt-2 p-2 bg-primary/10 rounded-lg">
                  <Package className="h-4 w-4 text-primary" />
                  <span className="text-sm text-primary font-medium">
                    {selectedPackage.packageName} - R$ 0,00
                  </span>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => {
                    const prevDate = addDays(selectedDate, -1);
                    if (!isBefore(prevDate, startOfDay(new Date()))) {
                      setSelectedDate(prevDate);
                      setSelectedTime(null);
                    }
                  }}
                  disabled={isBefore(addDays(selectedDate, -1), startOfDay(new Date()))}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <div className="text-center">
                  <p className="font-semibold capitalize" data-testid="text-selected-date">
                    {format(selectedDate, "EEEE", { locale: ptBR })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {format(selectedDate, "d 'de' MMMM", { locale: ptBR })}
                  </p>
                  {!isDayEnabled(selectedDate) && (
                    <p className="text-xs text-destructive mt-1">Fechado neste dia</p>
                  )}
                </div>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => {
                    const nextDate = addDays(selectedDate, 1);
                    if (!isBefore(getMaxDate(), nextDate)) {
                      setSelectedDate(nextDate);
                      setSelectedTime(null);
                    }
                  }}
                  disabled={isBefore(getMaxDate(), addDays(selectedDate, 1))}
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>

              <Separator />

              <div>
                <p className="text-sm text-muted-foreground mb-3">Horários disponíveis:</p>
                <div className="grid grid-cols-4 gap-2">
                  {generateTimeSlots().map((time) => {
                    const available = isSlotAvailable(time);
                    return (
                      <Button
                        key={time}
                        variant={selectedTime === time ? "default" : "outline"}
                        size="sm"
                        disabled={!available}
                        onClick={() => setSelectedTime(time)}
                        className={`${
                          selectedTime === time 
                            ? 'bg-primary text-primary-foreground' 
                            : available 
                              ? 'hover:border-primary/50' 
                              : 'opacity-40'
                        }`}
                        data-testid={`button-time-${time.replace(':', '')}`}
                      >
                        {time}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <Button 
                className="w-full bg-primary hover:bg-primary/90" 
                disabled={!selectedTime}
                onClick={() => setStep('confirm')}
                data-testid="button-continue-confirm"
              >
                Continuar
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 'confirm' && (
          <Card className="border-primary/20 bg-card/80 backdrop-blur" data-testid="card-confirm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => setStep(cameFromAutoAssign ? 'service' : 'datetime')}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
              </div>
              <CardTitle className="text-center mt-2">Confirmar Agendamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {usePackageMode && selectedPackage && (
                <div className="p-3 rounded-lg bg-primary/10 border border-primary/30 flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-primary">Usando Pacote</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedPackage.packageName} - Será descontado 1 uso
                    </p>
                  </div>
                  <Badge className="bg-green-500 text-white">R$ 0,00</Badge>
                </div>
              )}
              
              <div className="p-4 rounded-xl border border-border/50 bg-background/50 space-y-3">
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Cliente</p>
                    <p className="font-medium">{clientName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Telefone</p>
                    <p className="font-medium">{clientPhone}</p>
                  </div>
                </div>
                <Separator />
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8 border border-primary/30">
                    {selectedBarber?.avatar && (
                      <AvatarImage src={selectedBarber.avatar?.startsWith('/objects/') ? selectedBarber.avatar : `/objects/${selectedBarber.avatar}`} />
                    )}
                    <AvatarFallback className="text-xs">
                      {selectedBarber && getInitials(selectedBarber.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-xs text-muted-foreground">Profissional</p>
                    <p className="font-medium">{selectedBarber?.name}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Scissors className="h-4 w-4 text-muted-foreground mt-1" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">
                      {additionalServices.length > 0 ? 'Serviços' : 'Serviço'}
                    </p>
                    <p className="font-medium">{selectedService?.name}</p>
                    {additionalServices.map(svc => (
                      <p key={svc.id} className="font-medium text-sm text-muted-foreground">+ {svc.name}</p>
                    ))}
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${usePackageMode ? 'text-green-500' : 'text-primary'}`}>
                      {usePackageMode ? 'R$ 0,00' : formatPrice(getTotalPrice().toString())}
                    </p>
                    <p className="text-xs text-muted-foreground">{getTotalDuration()} min</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Data e Horário</p>
                    <p className="font-medium capitalize">
                      {format(selectedDate, "d 'de' MMMM", { locale: ptBR })} às {selectedTime}
                    </p>
                  </div>
                </div>
              </div>

              <Button 
                className="w-full bg-primary hover:bg-primary/90" 
                onClick={() => bookMutation.mutate()}
                disabled={bookMutation.isPending}
                data-testid="button-confirm-booking"
              >
                {bookMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Agendando...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    {usePackageMode ? 'Confirmar (Usar Pacote)' : 'Confirmar Agendamento'}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 'success' && (
          <Card className="border-primary/20 bg-card/80 backdrop-blur" data-testid="card-success">
            <CardContent className="pt-8 pb-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 border border-green-500/30 mb-4">
                <Check className="h-8 w-8 text-green-500" />
              </div>
              <h2 className="text-xl font-bold mb-2">Agendamento Confirmado!</h2>
              <p className="text-muted-foreground mb-6">
                Seu horário foi reservado com sucesso.
              </p>
              <div className="p-4 rounded-xl border border-border/50 bg-background/50 text-left space-y-2 mb-6">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Profissional:</span>
                  <span className="font-medium">{selectedBarber?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Serviço:</span>
                  <span className="font-medium">{selectedService?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Data:</span>
                  <span className="font-medium capitalize">
                    {format(selectedDate, "d/MM/yyyy", { locale: ptBR })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Horário:</span>
                  <span className="font-medium">{selectedTime}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setStep('my-appointments')}
                  data-testid="button-view-appointments"
                >
                  <CalendarDays className="h-4 w-4 mr-2" />
                  Meus Agendamentos
                </Button>
                <Button 
                  className="flex-1 bg-primary"
                  onClick={resetBooking}
                  data-testid="button-new-booking"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Novo Agendamento
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'my-appointments' && (
          <Card className="border-primary/20 bg-card/80 backdrop-blur" data-testid="card-my-appointments">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => {
                  if (recognizedClient) {
                    setStep('client-home');
                  } else {
                    setStep('welcome');
                  }
                }}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
              </div>
              <CardTitle className="text-center mt-2">Meus Agendamentos</CardTitle>
            </CardHeader>
            <CardContent>
              {myAppointments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CalendarDays className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Você não tem agendamentos futuros.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {myAppointments.map((apt) => (
                    <div 
                      key={apt.id} 
                      className="p-4 rounded-xl border border-border/50 bg-background/50"
                      data-testid={`appointment-${apt.id}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8 border border-primary/30">
                            {apt.barberAvatar && (
                              <AvatarImage src={`/objects/${apt.barberAvatar}`} />
                            )}
                            <AvatarFallback className="text-xs">
                              {getInitials(apt.barberName)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{apt.barberName}</span>
                        </div>
                        <Badge 
                          variant={apt.status === 'completed' ? 'secondary' : 'outline'}
                          className="text-primary border-primary/30"
                        >
                          {apt.status === 'scheduled' ? 'Agendado' : apt.status === 'completed' ? 'Concluído' : apt.status}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground mb-2">
                        <p className="font-medium text-foreground">{apt.serviceName}</p>
                        <p>
                          {(() => {
                            const d = new Date(apt.startTime);
                            const day = d.getUTCDate();
                            const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 
                                           'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
                            const month = months[d.getUTCMonth()];
                            const hours = d.getUTCHours().toString().padStart(2, '0');
                            const mins = d.getUTCMinutes().toString().padStart(2, '0');
                            return `${day} de ${month} às ${hours}:${mins}`;
                          })()}
                        </p>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-primary">{formatPrice(apt.servicePrice)}</span>
                        {apt.status === 'scheduled' && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              setAppointmentToCancel(apt.id);
                              setShowCancelDialog(true);
                            }}
                            data-testid={`button-cancel-${apt.id}`}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Cancelar
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Button 
                className="w-full mt-4 bg-primary"
                onClick={resetBooking}
                data-testid="button-new-booking-list"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Novo Agendamento
              </Button>
            </CardContent>
          </Card>
        )}

        <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancelar Agendamento</DialogTitle>
              <DialogDescription>
                Tem certeza que deseja cancelar este agendamento? Esta ação não pode ser desfeita.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
                Não, manter
              </Button>
              <Button 
                variant="destructive"
                onClick={() => appointmentToCancel && cancelMutation.mutate(appointmentToCancel)}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Sim, cancelar'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
