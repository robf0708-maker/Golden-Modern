import { useState } from "react";
import { Link } from "wouter";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Users, 
  DollarSign, 
  CalendarCheck, 
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Plus,
  Scissors,
  Link as LinkIcon,
  Copy,
  Check,
  ExternalLink,
  AlertTriangle
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useDashboardStats, useAuth } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

export default function Dashboard() {
  const { data: stats, isLoading } = useDashboardStats();
  const { data: authData } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data: allSubscriptions = [], isError: subscriptionsError } = useQuery<any[]>({
    queryKey: ["/api/subscriptions"],
    queryFn: async () => {
      const res = await fetch("/api/subscriptions");
      if (!res.ok) throw new Error("Erro ao carregar assinaturas");
      return res.json();
    },
  });

  const inadimplentSubscriptions = allSubscriptions.filter((s: any) => s.status === "past_due");

  const bookingLink = authData?.user?.barbershopId 
    ? `${window.location.origin}/agendar/${authData.user.barbershopId}`
    : '';

  const copyBookingLink = async () => {
    if (bookingLink) {
      await navigator.clipboard.writeText(bookingLink);
      setCopied(true);
      toast({
        title: "Link copiado!",
        description: "Compartilhe com seus clientes para agendamento online.",
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  const {
    todayRevenue = 0,
    todayAppointments = 0,
    activeClients = 0,
    pendingCommissions = 0,
    upcomingAppointments = []
  } = stats || {};

  return (
    <Layout>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground">Bem-vindo de volta! Aqui está o resumo de hoje.</p>
          </div>
          <div className="flex items-center gap-2 bg-card p-2 rounded-lg border border-border">
            <span className="text-sm font-medium px-2">
              {format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}
            </span>
          </div>
        </div>

        {inadimplentSubscriptions.length > 0 && (
          <Alert variant="destructive" className="border-red-500/50 bg-red-500/10">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Assinaturas Inadimplentes</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>
                {inadimplentSubscriptions.length} assinatura(s) com pagamento pendente. Os créditos estão bloqueados até a regularização.
              </span>
              <Link href="/subscriptions">
                <Button variant="outline" size="sm" className="ml-4 border-red-500/50 text-red-400 hover:bg-red-500/10">
                  Ver Assinaturas
                </Button>
              </Link>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard 
            title="Faturamento Hoje" 
            value={`R$ ${todayRevenue.toFixed(2)}`} 
            icon={DollarSign}
            testId="text-today-revenue"
          />
          <KpiCard 
            title="Agendamentos" 
            value={todayAppointments.toString()} 
            icon={CalendarCheck}
            testId="text-today-appointments"
          />
          <KpiCard 
            title="Clientes Cadastrados" 
            value={activeClients.toString()} 
            icon={Users}
            testId="text-active-clients"
          />
          <KpiCard 
            title="Comissões Pendentes" 
            value={`R$ ${pendingCommissions.toFixed(2)}`} 
            icon={TrendingUp}
            className="border-l-4 border-l-primary"
            testId="text-pending-commissions"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Card className="lg:col-span-2 border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="font-serif">Próximos Agendamentos</CardTitle>
              <Link href="/schedule">
                <Button variant="ghost" size="sm" className="text-primary" data-testid="link-schedule">
                  Ver Agenda
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-80">
                {upcomingAppointments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
                    <CalendarCheck className="h-12 w-12 opacity-50 mb-4" />
                    <p className="text-center">Nenhum agendamento para hoje.</p>
                    <Link href="/schedule">
                      <Button variant="outline" size="sm" className="mt-4" data-testid="button-new-appointment">
                        <Plus className="h-4 w-4 mr-2" />
                        Criar Agendamento
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {upcomingAppointments.map((apt: any) => (
                      <div 
                        key={apt.id} 
                        className="flex items-center justify-between p-4 rounded-lg bg-background/50 border border-border hover:border-primary/50 transition-colors group"
                        data-testid={`appointment-${apt.id}`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex flex-col items-center justify-center w-14 h-14 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                            <Clock className="h-4 w-4" />
                            <span className="text-lg font-bold">{apt.time}</span>
                          </div>
                          <div>
                            <h4 className="font-medium text-foreground">{apt.clientName}</h4>
                            <p className="text-sm text-muted-foreground">{apt.serviceName}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            apt.status === 'confirmed' ? 'bg-green-500/20 text-green-400' : 
                            apt.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' : 
                            apt.status === 'completed' ? 'bg-blue-500/20 text-blue-400' : 
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {apt.status === 'confirmed' ? 'Confirmado' : 
                             apt.status === 'pending' ? 'Pendente' : 
                             apt.status === 'completed' ? 'Concluído' : 'Cancelado'}
                          </span>
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 justify-end">
                            <Scissors className="h-3 w-3" />
                            {apt.barberName}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-border/50 bg-gradient-to-br from-card to-background">
              <CardHeader>
                <CardTitle className="font-serif">Acesso Rápido</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <QuickActionButton icon={CalendarCheck} label="Nova Agenda" href="/schedule" />
                <QuickActionButton icon={Users} label="Novo Cliente" href="/clients" />
                <QuickActionButton icon={DollarSign} label="Abrir Caixa" href="/finance" />
                <QuickActionButton icon={TrendingUp} label="Comissões" href="/comissoes" />
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle className="font-serif text-lg">Resumo do Dia</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                  <span className="text-sm text-muted-foreground">Faturamento</span>
                  <span className="font-bold text-green-500" data-testid="summary-revenue">
                    R$ {todayRevenue.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                  <span className="text-sm text-muted-foreground">Atendimentos</span>
                  <span className="font-bold text-blue-500" data-testid="summary-appointments">
                    {todayAppointments}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                  <span className="text-sm text-muted-foreground">Comissões Pend.</span>
                  <span className="font-bold text-yellow-500" data-testid="summary-commissions">
                    R$ {pendingCommissions.toFixed(2)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/30 bg-gradient-to-br from-primary/10 to-card" data-testid="card-booking-link">
              <CardHeader className="pb-2">
                <CardTitle className="font-serif text-lg flex items-center gap-2">
                  <LinkIcon className="h-5 w-5 text-primary" />
                  Link de Agendamento
                </CardTitle>
                <CardDescription>
                  Compartilhe este link para seus clientes agendarem online
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input 
                    value={bookingLink}
                    readOnly
                    className="text-xs bg-background/50"
                    data-testid="input-booking-link"
                  />
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={copyBookingLink}
                    className="shrink-0"
                    data-testid="button-copy-link"
                  >
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => window.open(bookingLink, '_blank')}
                  data-testid="button-preview-link"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Visualizar Página
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function KpiCard({ title, value, icon: Icon, className, testId }: any) {
  return (
    <Card className={`border-border/50 bg-card/50 backdrop-blur-sm hover:shadow-lg transition-all duration-300 ${className}`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between space-y-0 pb-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex items-end justify-between mt-2">
          <div className="text-2xl font-bold font-sans" data-testid={testId}>{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function QuickActionButton({ icon: Icon, label, href }: any) {
  return (
    <Link href={href}>
      <button 
        className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg bg-background border border-border hover:border-primary/50 hover:bg-primary/5 transition-all group w-full"
        data-testid={`button-quick-${label.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <div className="p-2 rounded-full bg-secondary text-secondary-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-xs font-medium text-center">{label}</span>
      </button>
    </Link>
  );
}
