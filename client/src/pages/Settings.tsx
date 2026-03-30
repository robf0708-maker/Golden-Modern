import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { 
  Settings as SettingsIcon, 
  Building2, 
  Clock, 
  Calendar, 
  Link as LinkIcon,
  Copy,
  Check,
  ExternalLink,
  Save,
  Loader2,
  Upload,
  X,
  Users,
  MessageSquare,
  Bell,
  Bot,
  Percent,
  RefreshCw
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/api";
import { useUpload } from "@/hooks/use-upload";

const DAYS_OF_WEEK = [
  { key: 'monday', label: 'Segunda-feira' },
  { key: 'tuesday', label: 'Terça-feira' },
  { key: 'wednesday', label: 'Quarta-feira' },
  { key: 'thursday', label: 'Quinta-feira' },
  { key: 'friday', label: 'Sexta-feira' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' },
] as const;

const DEFAULT_WORKING_HOURS = {
  monday: { open: '09:00', close: '19:00', enabled: true },
  tuesday: { open: '09:00', close: '19:00', enabled: true },
  wednesday: { open: '09:00', close: '19:00', enabled: true },
  thursday: { open: '09:00', close: '19:00', enabled: true },
  friday: { open: '09:00', close: '19:00', enabled: true },
  saturday: { open: '09:00', close: '17:00', enabled: true },
  sunday: { open: '09:00', close: '13:00', enabled: false },
};

type WorkingHours = typeof DEFAULT_WORKING_HOURS;

export default function Settings() {
  const { toast } = useToast();
  const { data: authData } = useAuth();
  const queryClient = useQueryClient();
  const { uploadFile, isUploading } = useUpload();
  const [copied, setCopied] = useState(false);
  const [barberLinkCopied, setBarberLinkCopied] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    logo: '',
    workingHours: DEFAULT_WORKING_HOURS as WorkingHours,
    bookingIntervalMinutes: 30,
    bookingAdvanceHours: 2,
    bookingMaxDaysAhead: 30,
    feeCredit: '0',
    feeDebit: '0',
    feePix: '0',
    feeStripePercent: '3.99',
    feeStripeFixed: '0.39',
  });

  const [notificationSettings, setNotificationSettings] = useState({
    provider: 'uazapi',
    welcomeEnabled: true,
    reminder1DayEnabled: true,
    reminder1HourEnabled: true,
    confirmationEnabled: true,
    cancellationEnabled: true,
    welcomeTemplate: '',
    reminder1DayTemplate: '',
    reminder1HourTemplate: '',
    confirmationTemplate: '',
    cancellationTemplate: '',
    reactivation20daysEnabled: true,
    reactivation20daysTemplate: '',
    reactivation30daysEnabled: true,
    reactivation30daysTemplate: '',
    reactivation45daysEnabled: true,
    reactivation45daysTemplate: '',
    predictedReturnEnabled: true,
    predictedReturnTemplate: '',
  });

  const [chatbotSettings, setChatbotSettings] = useState({
    enabled: false,
    systemPrompt: '',
    greetingNewClient: '',
    greetingReturningClient: '',
    askServicePrompt: '',
    askBarberPrompt: '',
    waitingOptionEnabled: true,
    waitingPrompt: '',
    minAdvanceMinutes: 60,
    maxDaysAhead: 30,
    webhookToken: '',
    whatsappConnected: false,
    whatsappPhone: null as string | null,
    uazapiInstanceName: null as string | null,
  });
  const [whatsappQrcode, setWhatsappQrcode] = useState<string | null>(null);
  const [whatsappConnecting, setWhatsappConnecting] = useState(false);
  const { data: barbershop, isLoading } = useQuery({
    queryKey: ['/api/barbershop'],
    queryFn: async () => {
      const res = await fetch('/api/barbershop', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch barbershop');
      return res.json();
    },
  });

  const { data: notifSettings } = useQuery({
    queryKey: ['/api/notification-settings'],
    queryFn: async () => {
      const res = await fetch('/api/notification-settings', { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const { data: chatbotData } = useQuery({
    queryKey: ['/api/chatbot-settings'],
    queryFn: async () => {
      const res = await fetch('/api/chatbot-settings', { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    },
  });

  useEffect(() => {
    if (barbershop) {
      setFormData({
        name: barbershop.name || '',
        phone: barbershop.phone || '',
        address: barbershop.address || '',
        logo: barbershop.logo || '',
        workingHours: barbershop.workingHours || DEFAULT_WORKING_HOURS,
        bookingIntervalMinutes: barbershop.bookingIntervalMinutes || 30,
        bookingAdvanceHours: barbershop.bookingAdvanceHours || 2,
        bookingMaxDaysAhead: barbershop.bookingMaxDaysAhead || 30,
        feeCredit: barbershop.feeCredit || '0',
        feeDebit: barbershop.feeDebit || '0',
        feePix: barbershop.feePix || '0',
        feeStripePercent: barbershop.feeStripePercent || '3.99',
        feeStripeFixed: barbershop.feeStripeFixed || '0.39',
      });
    }
  }, [barbershop]);

  useEffect(() => {
    if (notifSettings) {
      setNotificationSettings({
        provider: notifSettings.provider || 'uazapi',
        welcomeEnabled: notifSettings.welcomeEnabled ?? true,
        reminder1DayEnabled: notifSettings.reminder1DayEnabled ?? true,
        reminder1HourEnabled: notifSettings.reminder1HourEnabled ?? true,
        confirmationEnabled: notifSettings.confirmationEnabled ?? true,
        cancellationEnabled: notifSettings.cancellationEnabled ?? true,
        welcomeTemplate: notifSettings.welcomeTemplate || '',
        reminder1DayTemplate: notifSettings.reminder1DayTemplate || '',
        reminder1HourTemplate: notifSettings.reminder1HourTemplate || '',
        confirmationTemplate: notifSettings.confirmationTemplate || '',
        cancellationTemplate: notifSettings.cancellationTemplate || '',
        reactivation20daysEnabled: notifSettings.reactivation20daysEnabled ?? true,
        reactivation20daysTemplate: notifSettings.reactivation20daysTemplate || '',
        reactivation30daysEnabled: notifSettings.reactivation30daysEnabled ?? true,
        reactivation30daysTemplate: notifSettings.reactivation30daysTemplate || '',
        reactivation45daysEnabled: notifSettings.reactivation45daysEnabled ?? true,
        reactivation45daysTemplate: notifSettings.reactivation45daysTemplate || '',
        predictedReturnEnabled: notifSettings.predictedReturnEnabled ?? true,
        predictedReturnTemplate: notifSettings.predictedReturnTemplate || '',
      });
    }
  }, [notifSettings]);

  useEffect(() => {
    if (chatbotData) {
      setChatbotSettings(prev => ({
        ...prev,
        enabled: chatbotData.enabled ?? false,
        systemPrompt: chatbotData.systemPrompt || '',
        greetingNewClient: chatbotData.greetingNewClient || '',
        greetingReturningClient: chatbotData.greetingReturningClient || '',
        askServicePrompt: chatbotData.askServicePrompt || '',
        askBarberPrompt: chatbotData.askBarberPrompt || '',
        waitingOptionEnabled: chatbotData.waitingOptionEnabled ?? true,
        waitingPrompt: chatbotData.waitingPrompt || '',
        minAdvanceMinutes: chatbotData.minAdvanceMinutes || 60,
        maxDaysAhead: chatbotData.maxDaysAhead || 30,
        webhookToken: chatbotData.webhookToken || '',
        whatsappConnected: chatbotData.whatsappConnected ?? false,
        whatsappPhone: chatbotData.whatsappPhone ?? null,
        uazapiInstanceName: chatbotData.uazapiInstanceName ?? null,
        uazapiInstanceToken: chatbotData.uazapiInstanceToken ?? null,
      }));
    }
  }, [chatbotData]);

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<typeof formData>) => {
      const res = await fetch('/api/barbershop', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update settings');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/barbershop'] });
      toast({ title: 'Configurações salvas com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    },
  });

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

  const notificationMutation = useMutation({
    mutationFn: async (data: typeof notificationSettings) => {
      const res = await fetch('/api/notification-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update notification settings');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notification-settings'] });
      toast({ title: 'Configurações de notificação salvas!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    },
  });

  const handleSaveNotifications = () => {
    notificationMutation.mutate(notificationSettings);
  };

  const chatbotMutation = useMutation({
    mutationFn: async (data: typeof chatbotSettings) => {
      const res = await fetch('/api/chatbot-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update chatbot settings');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chatbot-settings'] });
      toast({ title: 'Configurações do chatbot salvas!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    },
  });

  const handleSaveChatbot = () => {
    chatbotMutation.mutate(chatbotSettings);
  };

  const whatsappConnectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao conectar');
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.connected) {
        // Instância já estava conectada — sincronizar UI imediatamente
        setWhatsappConnecting(false);
        setWhatsappQrcode(null);
        setChatbotSettings(prev => ({ ...prev, whatsappConnected: true, whatsappPhone: data.phone || prev.whatsappPhone, uazapiInstanceName: data.instanceName || prev.uazapiInstanceName }));
        queryClient.invalidateQueries({ queryKey: ['/api/chatbot-settings'] });
        toast({ title: 'WhatsApp conectado!' });
        return;
      }
      setWhatsappQrcode(data.qrcode ? String(data.qrcode) : null);
      setWhatsappConnecting(true);
      setChatbotSettings(prev => ({ ...prev, uazapiInstanceName: data.instanceName || prev.uazapiInstanceName }));
      queryClient.invalidateQueries({ queryKey: ['/api/chatbot-settings'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    },
  });

  const whatsappDisconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/whatsapp/disconnect', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Falha ao desconectar');
      return res.json();
    },
    onSuccess: () => {
      setWhatsappQrcode(null);
      setWhatsappConnecting(false);
      // Mantém uazapiInstanceName para reutilizar a instância na próxima conexão
      setChatbotSettings(prev => ({ ...prev, whatsappConnected: false, whatsappPhone: null }));
      queryClient.invalidateQueries({ queryKey: ['/api/chatbot-settings'] });
      toast({ title: 'WhatsApp desconectado' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    },
  });


  const { data: whatsappStatus } = useQuery({
    queryKey: ['/api/whatsapp/status', whatsappConnecting],
    queryFn: async () => {
      const res = await fetch('/api/whatsapp/status', { credentials: 'include' });
      if (!res.ok) throw new Error('Falha ao buscar status');
      return res.json();
    },
    refetchInterval: whatsappConnecting ? 3000 : false,
    enabled: whatsappConnecting || (!!chatbotSettings.uazapiInstanceName && !chatbotSettings.whatsappConnected),
  });

  useEffect(() => {
    if (whatsappStatus?.connected) {
      setWhatsappConnecting(false);
      setWhatsappQrcode(null);
      setChatbotSettings(prev => ({ ...prev, whatsappConnected: true, whatsappPhone: whatsappStatus.phone || null }));
      queryClient.invalidateQueries({ queryKey: ['/api/chatbot-settings'] });
    }
  }, [whatsappStatus?.connected, whatsappStatus?.phone]);

  // Buscar QR code quando estiver aguardando conexão (inclui ao recarregar a página)
  const awaitingConnection = (whatsappConnecting || chatbotSettings.uazapiInstanceName) && !chatbotSettings.whatsappConnected;
  useEffect(() => {
    if (!awaitingConnection || !chatbotSettings.uazapiInstanceName) return;
    const fetchQr = async () => {
      try {
        const res = await fetch('/api/whatsapp/qrcode', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.connected) {
            // Instância conectou! Atualizar UI
            setWhatsappConnecting(false);
            setWhatsappQrcode(null);
            setChatbotSettings(prev => ({ ...prev, whatsappConnected: true, whatsappPhone: data.phone || prev.whatsappPhone }));
            queryClient.invalidateQueries({ queryKey: ['/api/chatbot-settings'] });
          } else if (data.qrcode) {
            setWhatsappQrcode(String(data.qrcode));
          }
        }
      } catch { /* ignore */ }
    };
    fetchQr(); // Busca imediata
    const t = setInterval(fetchQr, 3000);
    return () => clearInterval(t);
  }, [awaitingConnection, chatbotSettings.uazapiInstanceName, chatbotSettings.whatsappConnected]);


  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const response = await uploadFile(file);
      if (response) {
        const url = `/objects/${response.objectPath}`;
        setFormData(prev => ({ ...prev, logo: url }));
        toast({ title: 'Logo carregado com sucesso!' });
      }
    } catch (error: any) {
      toast({ title: 'Erro ao carregar logo', description: error.message, variant: 'destructive' });
    }
  };

  const updateWorkingHours = (day: keyof WorkingHours, field: 'open' | 'close' | 'enabled', value: string | boolean) => {
    setFormData(prev => {
      const wh = prev.workingHours || DEFAULT_WORKING_HOURS;
      const dayData = wh[day] || { open: '09:00', close: '19:00', enabled: true };
      return {
        ...prev,
        workingHours: {
          ...wh,
          [day]: {
            ...dayData,
            [field]: value,
          },
        },
      };
    });
  };

  const bookingLink = authData?.user?.barbershopId 
    ? `${window.location.origin}/agendar/${authData.user.barbershopId}`
    : '';

  const copyBookingLink = async () => {
    if (!bookingLink) return;
    await navigator.clipboard.writeText(bookingLink);
    setCopied(true);
    toast({ title: 'Link copiado!' });
    setTimeout(() => setCopied(false), 2000);
  };

  const barberPanelLink = `${window.location.origin}/barbeiro`;

  const copyBarberLink = async () => {
    await navigator.clipboard.writeText(barberPanelLink);
    setBarberLinkCopied(true);
    toast({ title: 'Link do painel do barbeiro copiado!' });
    setTimeout(() => setBarberLinkCopied(false), 2000);
  };

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
            <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-3">
              <SettingsIcon className="h-8 w-8 text-primary" />
              Configurações
            </h1>
            <p className="text-muted-foreground">Gerencie as configurações da sua barbearia.</p>
          </div>
          
          <Button 
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            data-testid="button-save-settings"
          >
            {updateMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar Alterações
          </Button>
        </div>

        <Tabs defaultValue="info" className="w-full">
          <TabsList className="grid w-full grid-cols-9 mb-6">
            <TabsTrigger value="info" className="flex items-center gap-2" data-testid="tab-info">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Dados</span>
            </TabsTrigger>
            <TabsTrigger value="hours" className="flex items-center gap-2" data-testid="tab-hours">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Horários</span>
            </TabsTrigger>
            <TabsTrigger value="booking" className="flex items-center gap-2" data-testid="tab-booking">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Agenda</span>
            </TabsTrigger>
            <TabsTrigger value="fees" className="flex items-center gap-2" data-testid="tab-fees">
              <Percent className="h-4 w-4" />
              <span className="hidden sm:inline">Taxas</span>
            </TabsTrigger>
            <TabsTrigger value="link" className="flex items-center gap-2" data-testid="tab-link">
              <LinkIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Link</span>
            </TabsTrigger>
            <TabsTrigger value="barber" className="flex items-center gap-2" data-testid="tab-barber">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Barbeiros</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2" data-testid="tab-notifications">
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">Avisos</span>
            </TabsTrigger>
            <TabsTrigger value="chatbot" className="flex items-center gap-2" data-testid="tab-chatbot">
              <Bot className="h-4 w-4" />
              <span className="hidden sm:inline">Chatbot</span>
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="flex items-center gap-2" data-testid="tab-whatsapp">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">WhatsApp</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="info">
            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle className="font-serif">Dados da Barbearia</CardTitle>
                <CardDescription>Informações básicas sobre o seu estabelecimento.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative w-32 h-32 rounded-xl border-2 border-dashed border-border overflow-hidden bg-background/50 flex items-center justify-center">
                      {formData.logo ? (
                        <>
                          <img 
                            src={formData.logo} 
                            alt="Logo" 
                            className="w-full h-full object-cover"
                          />
                          <button
                            onClick={() => setFormData(prev => ({ ...prev, logo: '' }))}
                            className="absolute top-1 right-1 p-1 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            data-testid="button-remove-logo"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <div className="text-center text-muted-foreground">
                          <Building2 className="h-8 w-8 mx-auto mb-2" />
                          <span className="text-xs">Sem logo</span>
                        </div>
                      )}
                    </div>
                    <Label htmlFor="logo-upload" className="cursor-pointer">
                      <Button variant="outline" size="sm" disabled={isUploading} asChild>
                        <span>
                          {isUploading ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Upload className="h-4 w-4 mr-2" />
                          )}
                          {formData.logo ? 'Trocar Logo' : 'Enviar Logo'}
                        </span>
                      </Button>
                      <input
                        id="logo-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLogoUpload}
                        data-testid="input-logo-upload"
                      />
                    </Label>
                  </div>

                  <div className="flex-1 space-y-4">
                    <div>
                      <Label htmlFor="name">Nome da Barbearia</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Barbearia Premium"
                        data-testid="input-barbershop-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone">Telefone</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                        placeholder="(11) 99999-9999"
                        data-testid="input-barbershop-phone"
                      />
                    </div>
                    <div>
                      <Label htmlFor="address">Endereço</Label>
                      <Input
                        id="address"
                        value={formData.address}
                        onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                        placeholder="Rua Principal, 123 - Centro"
                        data-testid="input-barbershop-address"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="hours">
            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle className="font-serif">Horários de Funcionamento</CardTitle>
                <CardDescription>Defina os dias e horários que a barbearia funciona.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {DAYS_OF_WEEK.map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-4 p-4 rounded-lg bg-background/50 border border-border">
                      <div className="flex items-center gap-3 w-40">
                        <Switch
                          checked={formData.workingHours[key]?.enabled ?? false}
                          onCheckedChange={(checked) => updateWorkingHours(key, 'enabled', checked)}
                          data-testid={`switch-${key}`}
                        />
                        <span className={`font-medium ${formData.workingHours[key]?.enabled ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {label}
                        </span>
                      </div>
                      
                      {formData.workingHours[key]?.enabled && (
                        <div className="flex items-center gap-2 flex-1">
                          <Input
                            type="time"
                            value={formData.workingHours[key]?.open || '09:00'}
                            onChange={(e) => updateWorkingHours(key, 'open', e.target.value)}
                            className="w-32"
                            data-testid={`input-${key}-open`}
                          />
                          <span className="text-muted-foreground">até</span>
                          <Input
                            type="time"
                            value={formData.workingHours[key]?.close || '19:00'}
                            onChange={(e) => updateWorkingHours(key, 'close', e.target.value)}
                            className="w-32"
                            data-testid={`input-${key}-close`}
                          />
                        </div>
                      )}
                      
                      {!formData.workingHours[key]?.enabled && (
                        <span className="text-muted-foreground italic">Fechado</span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="booking">
            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle className="font-serif">Configurações da Agenda</CardTitle>
                <CardDescription>Personalize como os agendamentos funcionam.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label htmlFor="interval">Intervalo entre Horários</Label>
                  <p className="text-sm text-muted-foreground mb-2">
                    Define o intervalo mínimo entre os horários disponíveis para agendamento.
                  </p>
                  <Select
                    value={String(formData.bookingIntervalMinutes)}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, bookingIntervalMinutes: parseInt(value) }))}
                  >
                    <SelectTrigger className="w-48" data-testid="select-interval">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 minutos</SelectItem>
                      <SelectItem value="30">30 minutos</SelectItem>
                      <SelectItem value="45">45 minutos</SelectItem>
                      <SelectItem value="60">1 hora</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div>
                  <Label htmlFor="advance">Antecedência Mínima</Label>
                  <p className="text-sm text-muted-foreground mb-2">
                    Tempo mínimo de antecedência para fazer um agendamento.
                  </p>
                  <Select
                    value={String(formData.bookingAdvanceHours)}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, bookingAdvanceHours: parseFloat(value) }))}
                  >
                    <SelectTrigger className="w-48" data-testid="select-advance">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.5">30 minutos</SelectItem>
                      <SelectItem value="1">1 hora</SelectItem>
                      <SelectItem value="2">2 horas</SelectItem>
                      <SelectItem value="4">4 horas</SelectItem>
                      <SelectItem value="12">12 horas</SelectItem>
                      <SelectItem value="24">24 horas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div>
                  <Label htmlFor="maxDays">Máximo de Dias para Agendar</Label>
                  <p className="text-sm text-muted-foreground mb-2">
                    Quantos dias no futuro os clientes podem agendar.
                  </p>
                  <Select
                    value={String(formData.bookingMaxDaysAhead)}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, bookingMaxDaysAhead: parseInt(value) }))}
                  >
                    <SelectTrigger className="w-48" data-testid="select-max-days">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 dias</SelectItem>
                      <SelectItem value="14">14 dias</SelectItem>
                      <SelectItem value="30">30 dias</SelectItem>
                      <SelectItem value="60">60 dias</SelectItem>
                      <SelectItem value="90">90 dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fees">
            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle className="font-serif">Taxas de Pagamento</CardTitle>
                <CardDescription>
                  Configure as taxas cobradas pelas operadoras de pagamento. Essas taxas serão descontadas do valor que entra no caixa e das comissões dos profissionais.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="feeCredit">Taxa Cartão Crédito (%)</Label>
                    <Input
                      id="feeCredit"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={formData.feeCredit}
                      onChange={(e) => setFormData(prev => ({ ...prev, feeCredit: e.target.value }))}
                      placeholder="Ex: 3.5"
                      data-testid="input-fee-credit"
                    />
                    <p className="text-xs text-muted-foreground">Taxa cobrada pela maquininha no crédito</p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="feeDebit">Taxa Cartão Débito (%)</Label>
                    <Input
                      id="feeDebit"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={formData.feeDebit}
                      onChange={(e) => setFormData(prev => ({ ...prev, feeDebit: e.target.value }))}
                      placeholder="Ex: 2.0"
                      data-testid="input-fee-debit"
                    />
                    <p className="text-xs text-muted-foreground">Taxa cobrada pela maquininha no débito</p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="feePix">Taxa PIX (%)</Label>
                    <Input
                      id="feePix"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={formData.feePix}
                      onChange={(e) => setFormData(prev => ({ ...prev, feePix: e.target.value }))}
                      placeholder="Ex: 1.0"
                      data-testid="input-fee-pix"
                    />
                    <p className="text-xs text-muted-foreground">Taxa cobrada pelo PIX (se houver)</p>
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Taxas do Stripe (Assinaturas/Pacotes Online)</h4>
                  <p className="text-xs text-muted-foreground">
                    Configure as taxas do Stripe para calcular corretamente as comissões dos pacotes pagos via cartão online.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="feeStripePercent">Taxa Stripe (%)</Label>
                      <Input
                        id="feeStripePercent"
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={formData.feeStripePercent}
                        onChange={(e) => setFormData(prev => ({ ...prev, feeStripePercent: e.target.value }))}
                        placeholder="Ex: 3.99"
                        data-testid="input-fee-stripe-percent"
                      />
                      <p className="text-xs text-muted-foreground">Porcentagem cobrada pelo Stripe por transação</p>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="feeStripeFixed">Taxa Fixa Stripe (R$)</Label>
                      <Input
                        id="feeStripeFixed"
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.feeStripeFixed}
                        onChange={(e) => setFormData(prev => ({ ...prev, feeStripeFixed: e.target.value }))}
                        placeholder="Ex: 0.39"
                        data-testid="input-fee-stripe-fixed"
                      />
                      <p className="text-xs text-muted-foreground">Valor fixo cobrado por transação</p>
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-amber-400 mb-2">Como funciona:</h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Ao fechar uma comanda com cartão ou PIX, a taxa será calculada automaticamente</li>
                    <li>• O valor líquido (sem taxa) entra no caixa</li>
                    <li>• A comissão do profissional é calculada sobre o valor líquido</li>
                    <li>• O total de taxas aparece no fechamento do caixa para controle</li>
                    <li>• Para pacotes pagos via Stripe, as taxas do Stripe são descontadas automaticamente</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="link">
            <Card className="border-primary/30 bg-gradient-to-br from-primary/10 to-card">
              <CardHeader>
                <CardTitle className="font-serif flex items-center gap-2">
                  <LinkIcon className="h-5 w-5 text-primary" />
                  Link de Agendamento Online
                </CardTitle>
                <CardDescription>
                  Compartilhe este link com seus clientes para que eles possam agendar online.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 rounded-lg bg-background/50 border border-border">
                  <Label className="text-sm text-muted-foreground mb-2 block">Seu link de agendamento:</Label>
                  <div className="flex gap-2">
                    <Input 
                      value={bookingLink}
                      readOnly
                      className="font-mono text-sm"
                      data-testid="input-booking-link"
                    />
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={copyBookingLink}
                      data-testid="button-copy-link"
                    >
                      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button 
                    variant="outline" 
                    onClick={() => window.open(bookingLink, '_blank')}
                    className="flex-1"
                    data-testid="button-preview-link"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Visualizar Página
                  </Button>
                  <Button 
                    onClick={copyBookingLink}
                    className="flex-1 bg-primary text-primary-foreground"
                    data-testid="button-copy-link-large"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copiar Link
                  </Button>
                </div>

                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <h4 className="font-medium text-foreground mb-2">Como usar:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Envie o link por WhatsApp para seus clientes</li>
                    <li>• Coloque o link no Instagram ou Facebook da barbearia</li>
                    <li>• Imprima um QR Code com o link para deixar na barbearia</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="barber">
            <Card className="border-border/50 bg-gradient-to-br from-blue-500/10 to-card">
              <CardHeader>
                <CardTitle className="font-serif flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-400" />
                  Painel do Barbeiro
                </CardTitle>
                <CardDescription>
                  Compartilhe este link com seus barbeiros para que eles acessem suas comissões.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 rounded-lg bg-background/50 border border-border">
                  <Label className="text-sm text-muted-foreground mb-2 block">Link de acesso para barbeiros:</Label>
                  <div className="flex gap-2">
                    <Input 
                      value={barberPanelLink}
                      readOnly
                      className="font-mono text-sm"
                      data-testid="input-barber-link"
                    />
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={copyBarberLink}
                      data-testid="button-copy-barber-link"
                    >
                      {barberLinkCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button 
                    variant="outline" 
                    onClick={() => window.open(barberPanelLink, '_blank')}
                    className="flex-1"
                    data-testid="button-preview-barber-link"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Visualizar Página
                  </Button>
                  <Button 
                    onClick={copyBarberLink}
                    className="flex-1 bg-blue-500 text-white hover:bg-blue-600"
                    data-testid="button-copy-barber-link-large"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copiar Link
                  </Button>
                </div>

                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <h4 className="font-medium text-foreground mb-2">Como funciona:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Cadastre o WhatsApp e senha de cada barbeiro na página de Barbeiros</li>
                    <li>• Envie este link para cada barbeiro por WhatsApp</li>
                    <li>• O barbeiro acessa com seu WhatsApp e senha</li>
                    <li>• Ele vê suas comissões, compras e histórico de pagamentos</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications">
            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle className="font-serif flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-green-500" />
                  Notificações WhatsApp
                </CardTitle>
                <CardDescription>
                  Configure lembretes automáticos para seus clientes via WhatsApp.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <h4 className="font-medium text-foreground mb-2 flex items-center gap-2">
                    <Bell className="h-4 w-4 text-amber-500" />
                    Configuração do Provedor
                  </h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Para enviar mensagens reais via WhatsApp, configure um provedor abaixo. 
                    Enquanto não configurar, as mensagens serão apenas registradas no sistema.
                  </p>
                  <div className="space-y-2">
                    <Label>Provedor de WhatsApp</Label>
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      <span className="font-medium text-green-400">UazAPI</span>
                      <span className="text-xs text-muted-foreground ml-2">Conectado e funcionando</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Usando UazAPI para envio de mensagens WhatsApp. Suas credenciais já estão configuradas.
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h4 className="font-medium text-foreground">Tipos de Notificação</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Use as variáveis: {'{nome}'}, {'{telefone}'}, {'{data}'}, {'{horario}'}, {'{servico}'}, {'{barbeiro}'}, {'{barbearia}'}
                  </p>
                  
                  <div className="grid gap-4">
                    <div className="p-4 rounded-lg bg-background/50 border border-border space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Boas-vindas</p>
                          <p className="text-sm text-muted-foreground">Mensagem para novos clientes</p>
                        </div>
                        <Switch 
                          checked={notificationSettings.welcomeEnabled}
                          onCheckedChange={(v) => setNotificationSettings(prev => ({ ...prev, welcomeEnabled: v }))}
                          data-testid="switch-welcome"
                        />
                      </div>
                      {notificationSettings.welcomeEnabled && (
                        <Textarea
                          placeholder="Olá {nome}! Seja bem-vindo(a) à {barbearia}! Estamos felizes em ter você como cliente."
                          value={notificationSettings.welcomeTemplate}
                          onChange={(e) => setNotificationSettings(prev => ({ ...prev, welcomeTemplate: e.target.value }))}
                          className="min-h-[80px]"
                          data-testid="textarea-welcome-template"
                        />
                      )}
                    </div>

                    <div className="p-4 rounded-lg bg-background/50 border border-border space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Lembrete 1 dia antes</p>
                          <p className="text-sm text-muted-foreground">Enviar lembrete 24h antes do agendamento</p>
                        </div>
                        <Switch 
                          checked={notificationSettings.reminder1DayEnabled}
                          onCheckedChange={(v) => setNotificationSettings(prev => ({ ...prev, reminder1DayEnabled: v }))}
                          data-testid="switch-reminder-1day"
                        />
                      </div>
                      {notificationSettings.reminder1DayEnabled && (
                        <Textarea
                          placeholder="Olá {nome}! Lembrete: Você tem um agendamento amanhã às {horario} para {servico} com {barbeiro} na {barbearia}."
                          value={notificationSettings.reminder1DayTemplate}
                          onChange={(e) => setNotificationSettings(prev => ({ ...prev, reminder1DayTemplate: e.target.value }))}
                          className="min-h-[80px]"
                          data-testid="textarea-reminder-1day-template"
                        />
                      )}
                    </div>

                    <div className="p-4 rounded-lg bg-background/50 border border-border space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Lembrete 1 hora antes</p>
                          <p className="text-sm text-muted-foreground">Enviar lembrete 1h antes do agendamento</p>
                        </div>
                        <Switch 
                          checked={notificationSettings.reminder1HourEnabled}
                          onCheckedChange={(v) => setNotificationSettings(prev => ({ ...prev, reminder1HourEnabled: v }))}
                          data-testid="switch-reminder-1hour"
                        />
                      </div>
                      {notificationSettings.reminder1HourEnabled && (
                        <Textarea
                          placeholder="Olá {nome}! Seu horário é em 1 hora! Às {horario} para {servico} com {barbeiro} na {barbearia}."
                          value={notificationSettings.reminder1HourTemplate}
                          onChange={(e) => setNotificationSettings(prev => ({ ...prev, reminder1HourTemplate: e.target.value }))}
                          className="min-h-[80px]"
                          data-testid="textarea-reminder-1hour-template"
                        />
                      )}
                    </div>

                    <div className="p-4 rounded-lg bg-background/50 border border-border space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Confirmação de agendamento</p>
                          <p className="text-sm text-muted-foreground">Enviar confirmação ao criar agendamento</p>
                        </div>
                        <Switch 
                          checked={notificationSettings.confirmationEnabled}
                          onCheckedChange={(v) => setNotificationSettings(prev => ({ ...prev, confirmationEnabled: v }))}
                          data-testid="switch-confirmation"
                        />
                      </div>
                      {notificationSettings.confirmationEnabled && (
                        <Textarea
                          placeholder="Olá {nome}! Seu agendamento foi confirmado para {data} às {horario}. Serviço: {servico} com {barbeiro}. Aguardamos você na {barbearia}!"
                          value={notificationSettings.confirmationTemplate}
                          onChange={(e) => setNotificationSettings(prev => ({ ...prev, confirmationTemplate: e.target.value }))}
                          className="min-h-[80px]"
                          data-testid="textarea-confirmation-template"
                        />
                      )}
                    </div>

                    <div className="p-4 rounded-lg bg-background/50 border border-border space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Cancelamento</p>
                          <p className="text-sm text-muted-foreground">Notificar cliente quando agendamento for cancelado</p>
                        </div>
                        <Switch 
                          checked={notificationSettings.cancellationEnabled}
                          onCheckedChange={(v) => setNotificationSettings(prev => ({ ...prev, cancellationEnabled: v }))}
                          data-testid="switch-cancellation"
                        />
                      </div>
                      {notificationSettings.cancellationEnabled && (
                        <Textarea
                          placeholder="Olá {nome}! Seu agendamento de {data} às {horario} foi cancelado. Entre em contato conosco para reagendar."
                          value={notificationSettings.cancellationTemplate}
                          onChange={(e) => setNotificationSettings(prev => ({ ...prev, cancellationTemplate: e.target.value }))}
                          className="min-h-[80px]"
                          data-testid="textarea-cancellation-template"
                        />
                      )}
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-5 w-5 text-orange-500" />
                    <div>
                      <h4 className="font-medium text-foreground">Funil de Reativação</h4>
                      <p className="text-sm text-muted-foreground">Mensagens automáticas para clientes inativos e previsão de retorno</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Variáveis disponíveis: {'{nome}'}, {'{barbearia}'}
                  </p>

                  <div className="space-y-4">
                    <div className="space-y-2 p-4 rounded-lg border border-border/50 bg-card/30">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Reativação 20 dias</p>
                          <p className="text-sm text-muted-foreground">Enviar após 20 dias sem visita (1a mensagem)</p>
                        </div>
                        <Switch 
                          checked={notificationSettings.reactivation20daysEnabled}
                          onCheckedChange={(v) => setNotificationSettings(prev => ({ ...prev, reactivation20daysEnabled: v }))}
                        />
                      </div>
                      {notificationSettings.reactivation20daysEnabled && (
                        <Textarea
                          placeholder="Oi {nome}! Sentimos sua falta na {barbearia}! Já faz um tempinho desde o seu último corte. Que tal garantir um horário?"
                          value={notificationSettings.reactivation20daysTemplate}
                          onChange={(e) => setNotificationSettings(prev => ({ ...prev, reactivation20daysTemplate: e.target.value }))}
                          className="min-h-[80px]"
                        />
                      )}
                    </div>

                    <div className="space-y-2 p-4 rounded-lg border border-border/50 bg-card/30">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Reativação 30 dias</p>
                          <p className="text-sm text-muted-foreground">Enviar após 30 dias sem visita (2a mensagem)</p>
                        </div>
                        <Switch 
                          checked={notificationSettings.reactivation30daysEnabled}
                          onCheckedChange={(v) => setNotificationSettings(prev => ({ ...prev, reactivation30daysEnabled: v }))}
                        />
                      </div>
                      {notificationSettings.reactivation30daysEnabled && (
                        <Textarea
                          placeholder="Olá {nome}! Faz um mês que não te vemos por aqui na {barbearia}! Vamos agendar seu próximo corte?"
                          value={notificationSettings.reactivation30daysTemplate}
                          onChange={(e) => setNotificationSettings(prev => ({ ...prev, reactivation30daysTemplate: e.target.value }))}
                          className="min-h-[80px]"
                        />
                      )}
                    </div>

                    <div className="space-y-2 p-4 rounded-lg border border-border/50 bg-card/30">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Reativação 45 dias</p>
                          <p className="text-sm text-muted-foreground">Enviar após 45 dias sem visita (3a e última mensagem)</p>
                        </div>
                        <Switch 
                          checked={notificationSettings.reactivation45daysEnabled}
                          onCheckedChange={(v) => setNotificationSettings(prev => ({ ...prev, reactivation45daysEnabled: v }))}
                        />
                      </div>
                      {notificationSettings.reactivation45daysEnabled && (
                        <Textarea
                          placeholder="{nome}, sua presença faz falta! Já tem um tempo que você não visita a {barbearia}. Responda para agendar!"
                          value={notificationSettings.reactivation45daysTemplate}
                          onChange={(e) => setNotificationSettings(prev => ({ ...prev, reactivation45daysTemplate: e.target.value }))}
                          className="min-h-[80px]"
                        />
                      )}
                    </div>

                    <div className="space-y-2 p-4 rounded-lg border border-border/50 bg-card/30">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Previsão de Retorno</p>
                          <p className="text-sm text-muted-foreground">Enviar 3 dias antes da data prevista de retorno do cliente</p>
                        </div>
                        <Switch 
                          checked={notificationSettings.predictedReturnEnabled}
                          onCheckedChange={(v) => setNotificationSettings(prev => ({ ...prev, predictedReturnEnabled: v }))}
                        />
                      </div>
                      {notificationSettings.predictedReturnEnabled && (
                        <Textarea
                          placeholder="Olá {nome}! Parece que já está quase na hora de alinhar o visual! Que tal já garantir seu horário na {barbearia}?"
                          value={notificationSettings.predictedReturnTemplate}
                          onChange={(e) => setNotificationSettings(prev => ({ ...prev, predictedReturnTemplate: e.target.value }))}
                          className="min-h-[80px]"
                        />
                      )}
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="flex justify-end">
                  <Button 
                    onClick={handleSaveNotifications}
                    disabled={notificationMutation.isPending}
                    className="bg-green-500 text-white hover:bg-green-600"
                    data-testid="button-save-notifications"
                  >
                    {notificationMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Salvar Configurações de Notificação
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="chatbot">
            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle className="font-serif flex items-center gap-2">
                  <Bot className="h-5 w-5 text-primary" />
                  Chatbot IA WhatsApp
                </CardTitle>
                <CardDescription>Configure o atendente virtual que responde mensagens automaticamente.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 rounded-lg bg-primary/10 border border-primary/20">
                  <div>
                    <p className="font-medium text-foreground">Ativar Chatbot</p>
                    <p className="text-sm text-muted-foreground">O chatbot vai responder automaticamente às mensagens no WhatsApp</p>
                  </div>
                  <Switch 
                    checked={chatbotSettings.enabled}
                    onCheckedChange={(v) => {
                      const updated = { ...chatbotSettings, enabled: v };
                      setChatbotSettings(updated);
                      chatbotMutation.mutate(updated);
                    }}
                    data-testid="switch-chatbot-enabled"
                  />
                </div>

                {chatbotSettings.enabled && (
                  <>
                    <Separator />

                    <div className="space-y-4">
                      <h4 className="font-medium text-foreground">Saudações</h4>
                      
                      <div className="space-y-2">
                        <Label>Saudação para Cliente Novo</Label>
                        <Textarea
                          value={chatbotSettings.greetingNewClient}
                          onChange={(e) => setChatbotSettings(prev => ({ ...prev, greetingNewClient: e.target.value }))}
                          placeholder="Olá! Bem-vindo à nossa barbearia! Como posso ajudar?"
                          className="min-h-[80px]"
                          data-testid="input-greeting-new"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Saudação para Cliente que Volta</Label>
                        <Textarea
                          value={chatbotSettings.greetingReturningClient}
                          onChange={(e) => setChatbotSettings(prev => ({ ...prev, greetingReturningClient: e.target.value }))}
                          placeholder="Olá {clientName}! Que bom ver você de volta. Vai ser corte ou mais algum serviço?"
                          className="min-h-[80px]"
                          data-testid="input-greeting-returning"
                        />
                        <p className="text-xs text-muted-foreground">Use {'{clientName}'} para incluir o nome do cliente</p>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-4">
                      <h4 className="font-medium text-foreground">Opção de Espera</h4>
                      
                      <div className="flex items-center justify-between p-4 rounded-lg bg-background/50 border border-border">
                        <div>
                          <p className="font-medium">Permitir Espera</p>
                          <p className="text-sm text-muted-foreground">Perguntar se cliente quer esperar ou agendar</p>
                        </div>
                        <Switch 
                          checked={chatbotSettings.waitingOptionEnabled}
                          onCheckedChange={(v) => setChatbotSettings(prev => ({ ...prev, waitingOptionEnabled: v }))}
                          data-testid="switch-waiting-option"
                        />
                      </div>

                      {chatbotSettings.waitingOptionEnabled && (
                        <div className="space-y-2">
                          <Label>Mensagem sobre Espera</Label>
                          <Textarea
                            value={chatbotSettings.waitingPrompt}
                            onChange={(e) => setChatbotSettings(prev => ({ ...prev, waitingPrompt: e.target.value }))}
                            placeholder="Prefere agendar um horário ou pode vir e aguardar?"
                            className="min-h-[60px]"
                            data-testid="input-waiting-prompt"
                          />
                        </div>
                      )}
                    </div>

                    <Separator />

                    <div className="space-y-4">
                      <h4 className="font-medium text-foreground">Regras de Agendamento</h4>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Antecedência Mínima (minutos)</Label>
                          <Input
                            type="number"
                            value={chatbotSettings.minAdvanceMinutes}
                            onChange={(e) => setChatbotSettings(prev => ({ ...prev, minAdvanceMinutes: parseInt(e.target.value) || 60 }))}
                            data-testid="input-min-advance"
                          />
                          <p className="text-xs text-muted-foreground">Mínimo de tempo antes do horário</p>
                        </div>

                        <div className="space-y-2">
                          <Label>Máximo de Dias para Agendar</Label>
                          <Input
                            type="number"
                            value={chatbotSettings.maxDaysAhead}
                            onChange={(e) => setChatbotSettings(prev => ({ ...prev, maxDaysAhead: parseInt(e.target.value) || 30 }))}
                            data-testid="input-max-days"
                          />
                          <p className="text-xs text-muted-foreground">Quantos dias no futuro pode agendar</p>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-4">
                      <h4 className="font-medium text-foreground">Comportamento da IA (Avançado)</h4>
                      
                      <div className="space-y-2">
                        <Label>Prompt do Sistema</Label>
                        <Textarea
                          value={chatbotSettings.systemPrompt}
                          onChange={(e) => setChatbotSettings(prev => ({ ...prev, systemPrompt: e.target.value }))}
                          placeholder="Você é um assistente virtual de uma barbearia. Seja educado e objetivo..."
                          className="min-h-[120px] font-mono text-sm"
                          data-testid="input-system-prompt"
                        />
                        <p className="text-xs text-muted-foreground">Instruções gerais para o comportamento do chatbot</p>
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                <div className="flex justify-end">
                  <Button 
                    onClick={handleSaveChatbot}
                    disabled={chatbotMutation.isPending}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                    data-testid="button-save-chatbot"
                  >
                    {chatbotMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Salvar Configurações do Chatbot
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="whatsapp">
            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle className="font-serif flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-green-500" />
                  Integração WhatsApp
                </CardTitle>
                <CardDescription>
                  Conecte o número da barbearia para enviar avisos (lembretes, confirmações) e usar o chatbot. A conexão funciona independente do chatbot estar ativado.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 rounded-lg bg-muted/50 border border-border space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Status da Conexão</span>
                  </div>

                  {chatbotSettings.whatsappConnected ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-sm font-medium text-green-600">Conectado</span>
                      </div>
                      {chatbotSettings.whatsappPhone && (
                        <p className="text-sm text-muted-foreground">
                          Número: {chatbotSettings.whatsappPhone.replace(/^55/, '+55 ').replace(/(\+55\s?)(\d{2})(\d{5})(\d{4})/, '+55 ($2) $3-$4')}
                        </p>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => whatsappDisconnectMutation.mutate()}
                        disabled={whatsappDisconnectMutation.isPending}
                      >
                        {whatsappDisconnectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Desconectar
                      </Button>
                    </div>
                  ) : whatsappConnecting || (chatbotSettings.uazapiInstanceName && !chatbotSettings.whatsappConnected) ? (
                    <div className="space-y-4">
                      {whatsappQrcode ? (
                        <div className="flex flex-col items-center gap-3">
                          <p className="text-sm font-medium text-center">Escaneie o QR code com o WhatsApp</p>
                          <img
                            src={typeof whatsappQrcode === 'string' && whatsappQrcode.startsWith('data:') ? whatsappQrcode : `data:image/png;base64,${whatsappQrcode}`}
                            alt="QR Code WhatsApp"
                            className="w-56 h-56 object-contain border rounded-xl bg-white p-2 shadow-sm"
                          />
                          <div className="text-xs text-muted-foreground text-center space-y-1">
                            <p>1. Abra o WhatsApp no celular</p>
                            <p>2. Toque em ⋮ → Dispositivos conectados</p>
                            <p>3. Toque em "Conectar dispositivo"</p>
                            <p>4. Aponte a câmera para o código acima</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-3 py-4">
                          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">Aguardando QR code...</p>
                        </div>
                      )}
                      <div className="flex justify-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => whatsappDisconnectMutation.mutate()}
                          disabled={whatsappDisconnectMutation.isPending}
                        >
                          {whatsappDisconnectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-muted-foreground/50" />
                        <span className="text-sm font-medium">Desconectado</span>
                      </div>
                      <Button
                        type="button"
                        onClick={() => whatsappConnectMutation.mutate()}
                        disabled={whatsappConnectMutation.isPending}
                      >
                        {whatsappConnectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Conectar WhatsApp
                      </Button>
                    </div>
                  )}

                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={() => chatbotMutation.mutate(chatbotSettings)}
                    disabled={chatbotMutation.isPending}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                    data-testid="button-save-whatsapp"
                  >
                    {chatbotMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Salvar Configurações
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
