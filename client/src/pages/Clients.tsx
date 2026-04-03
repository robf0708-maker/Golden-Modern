import { useState, useMemo } from "react";
import Layout from "@/components/Layout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Plus,
  Filter,
  MoreHorizontal,
  Phone,
  Mail,
  CalendarDays,
  Loader2,
  Package,
  PackageX,
  Gift,
  Users,
  AlertCircle,
  AlertTriangle,
  Clock,
  Scissors,
  ShoppingBag,
  X,
  ChevronRight,
  UserX,
  UserMinus,
  UserCheck,
  Calendar,
  CalendarX,
  CalendarClock,
  TrendingUp,
  Repeat2,
  Star,
  Zap,
  MessageCircle,
  BarChart3,
  List,
} from "lucide-react";

const CLIENT_ABSENCE_DAYS = 30;
import { useClients, useCreateClient, useDeleteClient, usePackages, useCreateClientPackage, useClientPackages, useClientHistory, useClientsFunnelDashboard } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format, differenceInDays, subDays, isWithinInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";

export default function Clients() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPackageDialogOpen, setIsPackageDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailClient, setDetailClient] = useState<any>(null);
  const [filterTab, setFilterTab] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [inactiveDays, setInactiveDays] = useState(30);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    notes: "",
  });
  const [mainTab, setMainTab] = useState("funil");
  const [funnelSheet, setFunnelSheet] = useState<{ open: boolean; title: string; clients: any[] }>({
    open: false,
    title: "",
    clients: [],
  });

  const { data: clients = [], isLoading } = useClients();
  const { data: funnelDashboard, isLoading: loadingFunnel } = useClientsFunnelDashboard();
  const { data: packages = [] } = usePackages();
  const { data: clientPackages = [] } = useClientPackages();
  const { data: clientHistory = [], isLoading: loadingHistory } = useClientHistory(detailClient?.id);
  const createMutation = useCreateClient();
  const deleteMutation = useDeleteClient();
  const createClientPackageMutation = useCreateClientPackage();
  const { toast } = useToast();

  const activePackages = packages.filter((p: any) => p.active);

  const getClientActivePackages = (clientId: string) => {
    return clientPackages.filter((cp: any) => 
      cp.clientId === clientId && 
      cp.quantityRemaining > 0 && 
      new Date(cp.expiresAt) > new Date()
    );
  };

  const getLastVisitDate = (clientId: string) => {
    const clientVisits = clientHistory.filter((h: any) => h.clientId === clientId);
    if (clientVisits.length === 0) return null;
    return new Date(Math.max(...clientVisits.map((h: any) => new Date(h.date).getTime())));
  };

  const clientsWithMetrics = useMemo(() => {
    return clients.map((client: any) => {
      const packages = getClientActivePackages(client.id);
      
      return {
        ...client,
        activePackages: packages,
        hasActivePackages: packages.length > 0,
        totalPackageUses: packages.reduce((acc: number, p: any) => acc + (p.quantityRemaining || 0), 0),
        lastVisit: client.lastVisitAt ? new Date(client.lastVisitAt) : null,
        totalSpent: parseFloat(client.totalSpent || '0'),
        isInactive: client.clientStatus === 'cliente_inativo',
        clientStatus: client.clientStatus || 'novo_cliente',
        totalVisits: client.totalVisits || 0,
        hasNoLastVisit: !client.lastVisitAt,
        hasLongAbsence: (() => {
          if (!client.lastVisitAt || client.clientStatus === 'cliente_plano') return false;
          const lv = new Date(client.lastVisitAt);
          return differenceInDays(new Date(), lv) > CLIENT_ABSENCE_DAYS;
        })(),
      };
    });
  }, [clients, clientPackages]);

  const stats = useMemo(() => {
    const total = clientsWithMetrics.length;
    const withPackages = clientsWithMetrics.filter((c: any) => c.hasActivePackages).length;
    const expiringPackages = clientPackages.filter((cp: any) => {
      const daysToExpire = differenceInDays(new Date(cp.expiresAt), new Date());
      return daysToExpire <= 7 && daysToExpire > 0 && cp.quantityRemaining > 0;
    }).length;
    const inactive = clientsWithMetrics.filter((c: any) => c.isInactive).length;
    const noLastVisit = clientsWithMetrics.filter((c: any) => c.hasNoLastVisit).length;
    const longAbsence = clientsWithMetrics.filter((c: any) => c.hasLongAbsence).length;
    const staleStatus = clientsWithMetrics.filter(
      (c: any) => c.hasLongAbsence && c.clientStatus !== 'cliente_inativo'
    ).length;

    return { total, withPackages, expiringPackages, inactive, noLastVisit, longAbsence, staleStatus };
  }, [clientsWithMetrics, clientPackages]);

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; className: string }> = {
      novo_cliente:      { label: 'Novo',       className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
      cliente_ativo:     { label: 'Ativo',      className: 'bg-green-500/20 text-green-400 border-green-500/30' },
      cliente_recorrente: { label: 'Recorrente', className: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
      cliente_plano:     { label: 'Plano',      className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
      cliente_inativo:   { label: 'Inativo',    className: 'bg-red-500/20 text-red-400 border-red-500/30' },
    };
    const s = map[status] || map['novo_cliente'];
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${s.className}`}>
        {s.label}
      </span>
    );
  };

  const filteredClients = useMemo(() => {
    let result = clientsWithMetrics;

    if (searchTerm) {
      result = result.filter((c: any) => 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        c.phone.includes(searchTerm)
      );
    }

    if (filterTab === "with_packages") {
      result = result.filter((c: any) => c.hasActivePackages);
    } else if (filterTab === "inactive") {
      result = result.filter((c: any) => c.isInactive);
    } else if (filterTab === "no_last_visit") {
      result = result.filter((c: any) => c.hasNoLastVisit);
    } else if (filterTab === "long_absence") {
      result = result.filter((c: any) => c.hasLongAbsence);
    }

    return result;
  }, [clientsWithMetrics, searchTerm, filterTab]);

  const handleSellPackage = async () => {
    if (!selectedClient || !selectedPackageId) return;
    try {
      await createClientPackageMutation.mutateAsync({
        clientId: selectedClient.id,
        packageId: selectedPackageId
      });
      toast({ title: "Pacote vendido com sucesso!", description: `Pacote adicionado para ${selectedClient.name}` });
      setIsPackageDialogOpen(false);
      setSelectedClient(null);
      setSelectedPackageId("");
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMutation.mutateAsync(formData);
      toast({ title: "Cliente criado com sucesso!" });
      setIsDialogOpen(false);
      setFormData({ name: "", phone: "", email: "", notes: "" });
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const openClientDetail = (client: any) => {
    setDetailClient(client);
    setIsDetailOpen(true);
  };

  const openFunnelGroup = (title: string, clients: any[]) => {
    setFunnelSheet({ open: true, title, clients });
  };

  const whatsappLink = (phone: string) => {
    const digits = phone.replace(/\D/g, "");
    const number = digits.startsWith("55") ? digits : `55${digits}`;
    return `https://wa.me/${number}`;
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
      <div className="flex flex-col gap-6 h-[calc(100vh-8rem)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Clientes</h1>
            <p className="text-muted-foreground max-w-2xl">
              Gerencie sua base de clientes, pacotes e histórico. O status do funil e a última visita atualizam com
              atendimentos concluídos na agenda e comandas fechadas; use &quot;Recalcular&quot; no painel se os números estiverem defasados.
            </p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="button-new-client">
                <Plus className="mr-2 h-4 w-4" /> Novo Cliente
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>Cadastrar Novo Cliente</DialogTitle>
                <DialogDescription>Adicione um novo cliente à sua base.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-new-client">
                <div>
                  <Label htmlFor="name">Nome Completo</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="João Silva"
                    required
                    data-testid="input-client-name"
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(11) 99999-9999"
                    required
                    data-testid="input-client-phone"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email (opcional)</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="cliente@email.com"
                    data-testid="input-client-email"
                  />
                </div>
                <div>
                  <Label htmlFor="notes">Observações (opcional)</Label>
                  <Input
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Preferências, alergias, etc."
                    data-testid="input-client-notes"
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-client">
                    {createMutation.isPending ? "Cadastrando..." : "Cadastrar Cliente"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs value={mainTab} onValueChange={setMainTab} className="flex flex-col flex-1 overflow-hidden gap-4">
          <TabsList className="bg-background/50 w-fit">
            <TabsTrigger value="funil" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Funil
            </TabsTrigger>
            <TabsTrigger value="lista" className="flex items-center gap-2">
              <List className="h-4 w-4" /> Lista
            </TabsTrigger>
          </TabsList>

          {/* ============ FUNIL TAB ============ */}
          <TabsContent value="funil" className="flex-1 overflow-auto space-y-6 mt-0">
            {loadingFunnel ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {/* Zona Azul — Base Saudável */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-1 w-6 rounded-full bg-blue-500" />
                    <h2 className="text-sm font-semibold text-blue-400 uppercase tracking-wider">Base Saudável</h2>
                    <p className="text-xs text-muted-foreground">— dinheiro entrando</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      {
                        key: "ativos",
                        label: "Clientes Ativos",
                        sub: "últimos 30 dias",
                        icon: TrendingUp,
                      },
                      {
                        key: "recorrentes",
                        label: "Recorrentes",
                        sub: "3+ visitas",
                        icon: Repeat2,
                      },
                      {
                        key: "comPlano",
                        label: "Com Plano Ativo",
                        sub: "assinantes",
                        icon: Star,
                      },
                    ].map(({ key, label, sub, icon: Icon }) => {
                      const group = funnelDashboard?.[key as keyof typeof funnelDashboard] as any;
                      return (
                        <Card
                          key={key}
                          className="bg-blue-500/5 border-blue-500/20 hover:border-blue-500/50 transition-colors cursor-pointer"
                          onClick={() => openFunnelGroup(label, group?.clients ?? [])}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-3xl font-bold text-blue-400">{group?.count ?? 0}</p>
                                <p className="text-sm font-medium">{label}</p>
                                <p className="text-xs text-muted-foreground">{sub}</p>
                              </div>
                              <div className="p-3 rounded-full bg-blue-500/10">
                                <Icon className="h-6 w-6 text-blue-400" />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>

                {/* Zona Amarela — Oportunidade */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-1 w-6 rounded-full bg-amber-500" />
                    <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wider">Oportunidade</h2>
                    <p className="text-xs text-muted-foreground">— onde está o crescimento agora</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      {
                        key: "devemVoltar",
                        label: "Devem Voltar",
                        sub: "15–25 dias sem visita",
                        icon: Clock,
                        color: "amber",
                      },
                      {
                        key: "emRisco",
                        label: "Em Risco",
                        sub: "25–35 dias sem visita",
                        icon: AlertTriangle,
                        color: "amber",
                      },
                      {
                        key: "elegiveisPlano",
                        label: "Elegíveis para Plano",
                        sub: "frequentes sem plano",
                        icon: Zap,
                        color: "amber",
                      },
                    ].map(({ key, label, sub, icon: Icon }) => {
                      const group = funnelDashboard?.[key as keyof typeof funnelDashboard] as any;
                      return (
                        <Card
                          key={key}
                          className="bg-amber-500/5 border-amber-500/20 hover:border-amber-500/50 transition-colors cursor-pointer"
                          onClick={() => openFunnelGroup(label, group?.clients ?? [])}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-3xl font-bold text-amber-400">{group?.count ?? 0}</p>
                                <p className="text-sm font-medium">{label}</p>
                                <p className="text-xs text-muted-foreground">{sub}</p>
                              </div>
                              <div className="p-3 rounded-full bg-amber-500/10">
                                <Icon className="h-6 w-6 text-amber-400" />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>

                {/* Zona Vermelha — Problema */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-1 w-6 rounded-full bg-red-500" />
                    <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wider">Problema</h2>
                    <p className="text-xs text-muted-foreground">— dinheiro perdido</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      {
                        key: "inativos30d",
                        label: "Inativos 30d+",
                        sub: "mais de 30 dias sem vir",
                        icon: UserMinus,
                      },
                      {
                        key: "inativos45d",
                        label: "Inativos 45d+",
                        sub: "mais de 45 dias sem vir",
                        icon: UserX,
                      },
                      {
                        key: "pacotesExpirados",
                        label: "Pacotes Expirados",
                        sub: "expirou sem usar tudo",
                        icon: PackageX,
                      },
                    ].map(({ key, label, sub, icon: Icon }) => {
                      const group = funnelDashboard?.[key as keyof typeof funnelDashboard] as any;
                      return (
                        <Card
                          key={key}
                          className="bg-red-500/5 border-red-500/20 hover:border-red-500/50 transition-colors cursor-pointer"
                          onClick={() => openFunnelGroup(label, group?.clients ?? [])}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-3xl font-bold text-red-400">{group?.count ?? 0}</p>
                                <p className="text-sm font-medium">{label}</p>
                                <p className="text-xs text-muted-foreground">{sub}</p>
                              </div>
                              <div className="p-3 rounded-full bg-red-500/10">
                                <Icon className="h-6 w-6 text-red-400" />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          {/* ============ LISTA TAB ============ */}
          <TabsContent value="lista" className="flex flex-col flex-1 overflow-hidden mt-0">

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="bg-card/50 border-border hover:border-primary/30 transition-colors cursor-pointer" onClick={() => setFilterTab("all")} data-testid="stat-total-clients">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-xs text-muted-foreground leading-tight">Total de Clientes</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-card/50 border-border hover:border-green-500/30 transition-colors cursor-pointer" onClick={() => setFilterTab("with_packages")} data-testid="stat-with-packages">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Package className="h-5 w-5 text-green-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold text-green-500">{stats.withPackages}</p>
                  <p className="text-xs text-muted-foreground leading-tight">Com Pacotes Ativos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-card/50 border-border hover:border-amber-500/30 transition-colors" data-testid="stat-expiring-packages">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold text-amber-500">{stats.expiringPackages}</p>
                  <p className="text-xs text-muted-foreground leading-tight">Pacotes Expirando</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card
            className="bg-card/50 border-border hover:border-red-500/30 transition-colors cursor-pointer"
            onClick={() => setFilterTab("inactive")}
            title="Clientes com status Inativo no funil (gravado no cadastro)"
            data-testid="stat-inactive"
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/10">
                  <UserX className="h-5 w-5 text-red-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold text-red-500">{stats.inactive}</p>
                  <p className="text-xs text-muted-foreground leading-tight">Inativos (funil)</p>
                  <p className="text-[10px] text-muted-foreground/80 leading-tight mt-0.5">Status no sistema</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card
            className="bg-card/50 border-border hover:border-orange-500/30 transition-colors cursor-pointer"
            onClick={() => setFilterTab("no_last_visit")}
            title="Cadastros sem data de última visita registrada"
            data-testid="stat-no-last-visit"
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <CalendarX className="h-5 w-5 text-orange-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold text-orange-500">{stats.noLastVisit}</p>
                  <p className="text-xs text-muted-foreground leading-tight">Sem última visita</p>
                  <p className="text-[10px] text-muted-foreground/80 leading-tight mt-0.5">Dado ausente</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card
            className="bg-card/50 border-border hover:border-rose-500/30 transition-colors cursor-pointer"
            onClick={() => setFilterTab("long_absence")}
            title={`Última visita há mais de ${CLIENT_ABSENCE_DAYS} dias (exceto plano). Inclui quem o funil ainda não marcou como inativo.`}
            data-testid="stat-long-absence"
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-rose-500/10">
                  <CalendarClock className="h-5 w-5 text-rose-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold text-rose-500">{stats.longAbsence}</p>
                  <p className="text-xs text-muted-foreground leading-tight">Sem visita {CLIENT_ABSENCE_DAYS}+ dias</p>
                  {stats.staleStatus > 0 ? (
                    <p className="text-[10px] text-amber-500/90 leading-tight mt-0.5">
                      {stats.staleStatus} com status divergente — recalcule no painel
                    </p>
                  ) : (
                    <p className="text-[10px] text-muted-foreground/80 leading-tight mt-0.5">Por data registrada</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="bg-card border border-border rounded-lg flex flex-col flex-1 overflow-hidden">
          <div className="p-4 border-b border-border flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar por nome ou telefone..." 
                className="pl-10 bg-background/50"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-search-clients"
              />
            </div>
            
            <Tabs value={filterTab} onValueChange={setFilterTab} className="w-auto max-w-full overflow-x-auto">
              <TabsList className="bg-background/50 flex-wrap h-auto gap-1 py-1">
                <TabsTrigger value="all" data-testid="tab-all">Todos</TabsTrigger>
                <TabsTrigger value="with_packages" data-testid="tab-with-packages">Com Pacotes</TabsTrigger>
                <TabsTrigger value="inactive" data-testid="tab-inactive">Inativos (funil)</TabsTrigger>
                <TabsTrigger value="no_last_visit" data-testid="tab-no-last-visit">Sem últ. visita</TabsTrigger>
                <TabsTrigger value="long_absence" data-testid="tab-long-absence">{CLIENT_ABSENCE_DAYS}+ dias</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Cliente</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Pacotes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead title="Atendimentos concluídos na agenda">Visitas (agenda)</TableHead>
                  <TableHead title="Última data registrada (agenda ou comanda)">Última visita</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client: any) => (
                  <TableRow 
                    key={client.id} 
                    className="hover:bg-primary/5 transition-colors group cursor-pointer"
                    onClick={() => openClientDetail(client)}
                    data-testid={`client-row-${client.id}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 border border-border">
                          <AvatarFallback className="bg-primary/10 text-primary font-bold">
                            {client.name.substring(0,2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <span className="font-medium">{client.name}</span>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            Desde {format(new Date(client.createdAt), "MMM yyyy", { locale: ptBR })}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {client.phone}</span>
                        {client.email && <span className="flex items-center gap-1 text-xs"><Mail className="h-3 w-3" /> {client.email}</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {client.hasActivePackages ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="bg-green-500/10 text-green-500 border-green-500/30">
                            <Package className="h-3 w-3 mr-1" />
                            {client.totalPackageUses} usos
                          </Badge>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Nenhum</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(client.clientStatus)}
                    </TableCell>
                    <TableCell className="text-center">
                      {client.totalVisits}
                    </TableCell>
                    <TableCell>
                      {client.lastVisit 
                        ? format(client.lastVisit, "dd/MM/yyyy", { locale: ptBR })
                        : <span className="text-muted-foreground text-xs">—</span>
                      }
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-card border-border">
                          <DropdownMenuLabel>Ações</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => openClientDetail(client)}>
                            Ver Detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem>Novo Agendamento</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => {
                              setSelectedClient(client);
                              setIsPackageDialogOpen(true);
                            }}
                            data-testid={`sell-package-${client.id}`}
                          >
                            <Gift className="mr-2 h-4 w-4" /> Vender Pacote
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => {
                              if (confirm(`Excluir ${client.name}?`)) {
                                deleteMutation.mutate(client.id);
                              }
                            }}
                          >
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Sheet: Funil Group Detail */}
      <Sheet open={funnelSheet.open} onOpenChange={(open) => setFunnelSheet(s => ({ ...s, open }))}>
        <SheetContent className="w-full sm:max-w-lg bg-card border-border overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{funnelSheet.title}</SheetTitle>
            <SheetDescription>{funnelSheet.clients.length} cliente{funnelSheet.clients.length !== 1 ? "s" : ""} neste grupo</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {funnelSheet.clients.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Nenhum cliente neste grupo</p>
              </div>
            ) : (
              funnelSheet.clients.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-background/30 gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-9 w-9 border border-border shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs">
                        {c.name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {c.phone}
                      </p>
                      {c.daysSinceLastVisit !== null && (
                        <p className="text-xs text-muted-foreground">
                          {c.daysSinceLastVisit === 0 ? "Hoje" : `${c.daysSinceLastVisit}d sem visita`}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <a href={whatsappLink(c.phone)} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-green-500 hover:text-green-400 hover:bg-green-500/10" title="WhatsApp">
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    </a>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-primary hover:bg-primary/10"
                      title="Vender Pacote"
                      onClick={() => {
                        setSelectedClient(c);
                        setIsPackageDialogOpen(true);
                      }}
                    >
                      <Gift className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <SheetContent className="w-full sm:max-w-lg bg-card border-border overflow-y-auto">
          {detailClient && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16 border-2 border-primary">
                    <AvatarFallback className="bg-primary/10 text-primary font-bold text-xl">
                      {detailClient.name.substring(0,2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <SheetTitle className="text-2xl">{detailClient.name}</SheetTitle>
                    <SheetDescription className="flex items-center gap-2">
                      <Phone className="h-3 w-3" /> {detailClient.phone}
                      {detailClient.email && <span className="ml-2"><Mail className="h-3 w-3 inline" /> {detailClient.email}</span>}
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>
              
              <div className="mt-6 space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                    <Package className="h-4 w-4" /> Pacotes Ativos
                  </h3>
                  {getClientActivePackages(detailClient.id).length > 0 ? (
                    <div className="space-y-2">
                      {getClientActivePackages(detailClient.id).map((cp: any) => {
                        const daysToExpire = differenceInDays(new Date(cp.expiresAt), new Date());
                        const isExpiringSoon = daysToExpire <= 7;
                        
                        return (
                          <div 
                            key={cp.id} 
                            className={`p-3 rounded-lg border ${isExpiringSoon ? 'bg-amber-500/5 border-amber-500/30' : 'bg-green-500/5 border-green-500/30'}`}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-medium">{cp.packageName}</p>
                                <p className="text-sm text-muted-foreground">
                                  {cp.quantityRemaining} de {cp.quantityOriginal} usos restantes
                                </p>
                              </div>
                              <Badge variant="secondary" className={isExpiringSoon ? 'bg-amber-500/20 text-amber-500' : 'bg-green-500/20 text-green-500'}>
                                {isExpiringSoon ? (
                                  <><AlertCircle className="h-3 w-3 mr-1" /> {daysToExpire}d</>
                                ) : (
                                  <><Calendar className="h-3 w-3 mr-1" /> {format(new Date(cp.expiresAt), "dd/MM/yy")}</>
                                )}
                              </Badge>
                            </div>
                            <div className="mt-2 w-full bg-background/50 rounded-full h-2">
                              <div 
                                className={`h-2 rounded-full ${isExpiringSoon ? 'bg-amber-500' : 'bg-green-500'}`}
                                style={{ width: `${(cp.quantityRemaining / cp.quantityOriginal) * 100}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-4 border border-dashed border-border rounded-lg text-center text-muted-foreground">
                      <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Nenhum pacote ativo</p>
                      <Button 
                        variant="link" 
                        size="sm" 
                        className="mt-1"
                        onClick={() => {
                          setSelectedClient(detailClient);
                          setIsPackageDialogOpen(true);
                        }}
                      >
                        Vender um pacote
                      </Button>
                    </div>
                  )}
                </div>

                <Separator />

                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                    <Clock className="h-4 w-4" /> Histórico de Visitas
                  </h3>
                  {loadingHistory ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : clientHistory.length > 0 ? (
                    <div className="space-y-3">
                      {clientHistory.map((visit: any) => (
                        <div key={visit.id} className="p-3 rounded-lg border border-border bg-background/30">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <p className="text-sm font-medium">
                                {format(new Date(visit.date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                              </p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Scissors className="h-3 w-3" /> {visit.barberName}
                              </p>
                            </div>
                            <Badge variant="outline" className="text-primary border-primary/30">
                              R$ {parseFloat(visit.total).toFixed(2)}
                            </Badge>
                          </div>
                          <div className="space-y-1">
                            {visit.items.map((item: any, idx: number) => (
                              <div key={idx} className="flex justify-between text-xs">
                                <span className="text-muted-foreground flex items-center gap-1">
                                  {item.type === 'service' || item.type === 'package_use' ? (
                                    <Scissors className="h-3 w-3" />
                                  ) : item.type === 'product' ? (
                                    <ShoppingBag className="h-3 w-3" />
                                  ) : (
                                    <Package className="h-3 w-3" />
                                  )}
                                  {item.itemName}
                                  {item.type === 'package_use' && (
                                    <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0 bg-green-500/20 text-green-500">
                                      Pacote
                                    </Badge>
                                  )}
                                </span>
                                <span>
                                  {item.quantity > 1 && `${item.quantity}x `}
                                  R$ {parseFloat(item.total).toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 border border-dashed border-border rounded-lg text-center text-muted-foreground">
                      <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Nenhuma visita registrada</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={isPackageDialogOpen} onOpenChange={setIsPackageDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Vender Pacote</DialogTitle>
            <DialogDescription>
              Venda um pacote para {selectedClient?.name}
            </DialogDescription>
          </DialogHeader>
          
          {selectedClient && (
            <div className="space-y-4">
              {getClientActivePackages(selectedClient.id).length > 0 && (
                <div className="bg-primary/10 p-3 rounded-lg">
                  <p className="text-sm font-medium text-primary mb-2">Pacotes Ativos</p>
                  {getClientActivePackages(selectedClient.id).map((cp: any) => (
                    <div key={cp.id} className="flex justify-between text-sm">
                      <span>{cp.packageName}</span>
                      <Badge variant="secondary">{cp.quantityRemaining} usos restantes</Badge>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <Label>Selecione o Pacote</Label>
                <Select value={selectedPackageId} onValueChange={setSelectedPackageId}>
                  <SelectTrigger className="bg-background/50">
                    <SelectValue placeholder="Escolha um pacote..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activePackages.length === 0 ? (
                      <SelectItem value="" disabled>Nenhum pacote cadastrado</SelectItem>
                    ) : (
                      activePackages.map((pkg: any) => (
                        <SelectItem key={pkg.id} value={pkg.id}>
                          {pkg.name} - R$ {parseFloat(pkg.price).toFixed(2)} ({pkg.quantity} usos)
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {selectedPackageId && (
                <div className="bg-muted/50 p-3 rounded-lg text-sm">
                  {(() => {
                    const pkg = activePackages.find((p: any) => p.id === selectedPackageId);
                    return pkg ? (
                      <>
                        <p><strong>Quantidade de usos:</strong> {pkg.quantity}</p>
                        <p><strong>Validade:</strong> {pkg.validityDays} dias</p>
                        <p><strong>Valor unitário por uso:</strong> R$ {(parseFloat(pkg.price) / pkg.quantity).toFixed(2)}</p>
                      </>
                    ) : null;
                  })()}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPackageDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSellPackage} 
              disabled={!selectedPackageId || createClientPackageMutation.isPending}
              data-testid="confirm-sell-package"
            >
              {createClientPackageMutation.isPending ? "Vendendo..." : "Confirmar Venda"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
