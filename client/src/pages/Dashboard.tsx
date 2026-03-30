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
  AlertTriangle,
  UserCheck,
  UserX,
  UserPlus,
  Star,
  RefreshCw,
  ChevronRight
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useDashboardStats, useAuth, useFunnelStats, useRecalculateStats } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

export default function Dashboard() {
  const { data: stats, isLoading } = useDashboardStats();
  const { data: authData } = useAuth();
  const { data: funnelStats, isLoading: funnelLoading } = useFunnelStats();
  const recalculateMutation = useRecalculateStats();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleRecalculate = async () => {
    try {
      const result = await recalculateMutation.mutateAsync(undefined as any);
      toast({
        title: "Recálculo concluído!",
        description: result.message,
      });
    } catch {
      toast({ title: "Erro no recálculo", variant: "destructive" });
    }
  };

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

        {/* Funil de Clientes */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-serif font-bold text-foreground">Funil de Clientes</h2>
              <p className="text-sm text-muted-foreground">Visão geral do comportamento dos clientes</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRecalculate}
              disabled={recalculateMutation.isPending}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${recalculateMutation.isPending ? 'animate-spin' : ''}`} />
              {recalculateMutation.isPending ? 'Recalculando...' : 'Recalcular'}
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <FunnelStageCard
              label="Novos"
              count={funnelStats?.counts?.novo_cliente ?? 0}
              color="blue"
              icon={UserPlus}
              loading={funnelLoading}
            />
            <FunnelStageCard
              label="Ativos"
              count={funnelStats?.counts?.cliente_ativo ?? 0}
              color="green"
              icon={UserCheck}
              loading={funnelLoading}
            />
            <FunnelStageCard
              label="Recorrentes"
              count={funnelStats?.counts?.cliente_recorrente ?? 0}
              color="purple"
              icon={Star}
              loading={funnelLoading}
            />
            <FunnelStageCard
              label="Com Plano"
              count={funnelStats?.counts?.cliente_plano ?? 0}
              color="gold"
              icon={TrendingUp}
              loading={funnelLoading}
            />
            <FunnelStageCard
              label="Inativos"
              count={funnelStats?.counts?.cliente_inativo ?? 0}
              color="red"
              icon={UserX}
              loading={funnelLoading}
            />
          </div>

          {funnelStats && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4 text-primary" />
              Taxa de retorno: <span className="font-bold text-foreground">{funnelStats.returnRate}%</span>
              <span className="text-xs">(clientes que voltaram pelo menos uma vez)</span>
            </div>
          )}

          {funnelStats && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {funnelStats.toReactivate && funnelStats.toReactivate.length > 0 && (
                <Card className="border-red-500/30 bg-red-500/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <UserX className="h-4 w-4 text-red-400" />
                      Para Reativar
                      <span className="ml-auto bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded-full">
                        {funnelStats.toReactivate.length}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {funnelStats.toReactivate.slice(0, 3).map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between text-xs">
                        <span className="text-foreground font-medium">{c.name}</span>
                        <span className="text-muted-foreground">{c.daysSinceVisit}d sem vir</span>
                      </div>
                    ))}
                    {funnelStats.toReactivate.length > 3 && (
                      <p className="text-xs text-muted-foreground pt-1">
                        +{funnelStats.toReactivate.length - 3} outros
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {funnelStats.returningSoon && funnelStats.returningSoon.length > 0 && (
                <Card className="border-green-500/30 bg-green-500/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <CalendarCheck className="h-4 w-4 text-green-400" />
                      Voltam em Breve
                      <span className="ml-auto bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded-full">
                        {funnelStats.returningSoon.length}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {funnelStats.returningSoon.slice(0, 3).map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between text-xs">
                        <span className="text-foreground font-medium">{c.name}</span>
                        <span className="text-muted-foreground">
                          {c.daysUntilReturn === 0 ? 'Hoje' : `em ${c.daysUntilReturn}d`}
                        </span>
                      </div>
                    ))}
                    {funnelStats.returningSoon.length > 3 && (
                      <p className="text-xs text-muted-foreground pt-1">
                        +{funnelStats.returningSoon.length - 3} outros
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {funnelStats.planEligible && funnelStats.planEligible.length > 0 && (
                <Card className="border-yellow-500/30 bg-yellow-500/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Star className="h-4 w-4 text-yellow-400" />
                      Oferecer Plano
                      <span className="ml-auto bg-yellow-500/20 text-yellow-400 text-xs px-2 py-0.5 rounded-full">
                        {funnelStats.planEligible.length}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {funnelStats.planEligible.slice(0, 3).map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between text-xs">
                        <span className="text-foreground font-medium">{c.name}</span>
                        <span className="text-muted-foreground">{c.totalVisits} visitas</span>
                      </div>
                    ))}
                    {funnelStats.planEligible.length > 3 && (
                      <p className="text-xs text-muted-foreground pt-1">
                        +{funnelStats.planEligible.length - 3} outros
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>

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

function FunnelStageCard({ label, count, color, icon: Icon, loading }: {
  label: string;
  count: number;
  color: 'blue' | 'green' | 'purple' | 'gold' | 'red';
  icon: any;
  loading: boolean;
}) {
  const colorMap = {
    blue:   { bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   text: 'text-blue-400' },
    green:  { bg: 'bg-green-500/10',  border: 'border-green-500/30',  text: 'text-green-400' },
    purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400' },
    gold:   { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400' },
    red:    { bg: 'bg-red-500/10',    border: 'border-red-500/30', text: 'text-red-400' },
  };
  const c = colorMap[color];

  return (
    <Card className={`${c.border} ${c.bg} border`}>
      <CardContent className="p-4 flex flex-col items-center justify-center gap-1">
        <Icon className={`h-5 w-5 ${c.text}`} />
        {loading ? (
          <div className="h-7 w-8 animate-pulse bg-muted rounded" />
        ) : (
          <span className="text-2xl font-bold text-foreground">{count}</span>
        )}
        <span className="text-xs text-muted-foreground text-center">{label}</span>
      </CardContent>
    </Card>
  );
}
