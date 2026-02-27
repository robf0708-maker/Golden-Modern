import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { ClientCombobox } from "@/components/ClientCombobox";
import { PackageCombobox } from "@/components/PackageCombobox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Plus, Search, RefreshCw, Loader2, User, Package, Calendar, 
  CreditCard, Banknote, AlertCircle, CheckCircle, XCircle, Clock,
  MoreVertical, History, DollarSign, Trash2, AlertTriangle
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface Subscription {
  id: string;
  clientId: string;
  packageId: string;
  status: string;
  paymentMethod: string;
  stripeCustomerId: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  nextBillingDate: string;
  lastPaymentDate: string | null;
  lastPaymentAmount: string | null;
  notes: string | null;
  createdAt: string;
}

interface SubscriptionPayment {
  id: string;
  subscriptionId: string;
  comandaId: string | null;
  amount: string;
  paymentMethod: string;
  status: string;
  receivedByUserId: string | null;
  receivedByBarberId: string | null;
  cashRegisterId: string | null;
  paidAt: string | null;
  periodStart: string;
  periodEnd: string;
  notes: string | null;
  createdAt: string;
  receivedByName?: string;
}

export default function Subscriptions() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRenewDialogOpen, setIsRenewDialogOpen] = useState(false);
  const [isPaymentsDialogOpen, setIsPaymentsDialogOpen] = useState(false);
  const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);
  const [formData, setFormData] = useState({
    clientId: "",
    packageId: "",
    paymentMethod: "cash",
    notes: "",
  });
  const [renewData, setRenewData] = useState({
    paymentMethod: "cash",
    notes: "",
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: subscriptions = [], isLoading } = useQuery<Subscription[]>({
    queryKey: ["/api/subscriptions"],
    queryFn: async () => {
      const res = await fetch("/api/subscriptions");
      if (!res.ok) throw new Error("Erro ao carregar assinaturas");
      return res.json();
    },
  });

  const { data: clients = [] } = useQuery<any[]>({
    queryKey: ["/api/clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients");
      if (!res.ok) throw new Error("Erro ao carregar clientes");
      return res.json();
    },
  });

  const { data: packages = [] } = useQuery<any[]>({
    queryKey: ["/api/packages"],
    queryFn: async () => {
      const res = await fetch("/api/packages");
      if (!res.ok) throw new Error("Erro ao carregar pacotes");
      return res.json();
    },
  });

  const { data: payments = [] } = useQuery<SubscriptionPayment[]>({
    queryKey: ["/api/subscriptions", selectedSubscription?.id, "payments"],
    queryFn: async () => {
      if (!selectedSubscription) return [];
      const res = await fetch(`/api/subscriptions/${selectedSubscription.id}/payments`);
      if (!res.ok) throw new Error("Erro ao carregar pagamentos");
      return res.json();
    },
    enabled: !!selectedSubscription && isPaymentsDialogOpen,
  });

  const recurringPackages = packages.filter((p: any) => p.isRecurring && p.active);

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao criar assinatura");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscriptions"] });
      toast({ title: "Assinatura criada com sucesso!" });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const renewMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; paymentMethod: string; notes: string }) => {
      const res = await fetch(`/api/subscriptions/${id}/renew`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao renovar assinatura");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscriptions"] });
      toast({ title: "Assinatura renovada com sucesso!" });
      setIsRenewDialogOpen(false);
      setSelectedSubscription(null);
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const activateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/subscriptions/${id}/activate`, {
        method: "POST",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Erro ao ativar assinatura");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/client-packages"] });
      toast({ title: "Sucesso", description: "Assinatura ativada! Créditos liberados." });
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/subscriptions/${id}/cancel`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Erro ao cancelar assinatura");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscriptions"] });
      toast({ title: "Assinatura cancelada" });
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/subscriptions/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Erro ao excluir assinatura");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscriptions"] });
      toast({ title: "Assinatura excluída com sucesso" });
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({ clientId: "", packageId: "", paymentMethod: "cash", notes: "" });
  };

  const handleSetupCard = async (subscriptionId: string) => {
    try {
      const res = await fetch(`/api/subscriptions/${subscriptionId}/setup-card`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao iniciar cadastro de cartão");
      }
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank');
        toast({ 
          title: "Aba aberta", 
          description: "Complete o pagamento na nova aba. Depois, atualize esta página para ver a assinatura ativa." 
        });
      }
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleChargeCard = async (subscriptionId: string) => {
    try {
      toast({ title: "Processando...", description: "Cobrando cartão do cliente" });
      const res = await fetch(`/api/subscriptions/${subscriptionId}/charge-card`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao cobrar cartão");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/subscriptions"] });
      toast({ title: "Sucesso!", description: "Pagamento realizado e créditos renovados" });
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const getClientName = (clientId: string) => {
    const client = clients.find((c: any) => c.id === clientId);
    return client?.name || "Cliente não encontrado";
  };

  const getPackageName = (packageId: string) => {
    const pkg = packages.find((p: any) => p.id === packageId);
    return pkg?.name || "Pacote não encontrado";
  };

  const getPackagePrice = (packageId: string) => {
    const pkg = packages.find((p: any) => p.id === packageId);
    return pkg?.price || "0";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle className="w-3 h-3 mr-1" /> Ativa</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><Clock className="w-3 h-3 mr-1" /> Aguardando Pagamento</Badge>;
      case "past_due":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><AlertCircle className="w-3 h-3 mr-1" /> Pagamento em Atraso</Badge>;
      case "expired":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><AlertCircle className="w-3 h-3 mr-1" /> Vencida</Badge>;
      case "cancelled":
        return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30"><XCircle className="w-3 h-3 mr-1" /> Cancelada</Badge>;
      case "paused":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><Clock className="w-3 h-3 mr-1" /> Pausada</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getPaymentMethodIcon = (method: string) => {
    switch (method) {
      case "card":
        return <CreditCard className="w-4 h-4" />;
      case "pix":
      case "cash":
        return <Banknote className="w-4 h-4" />;
      default:
        return <DollarSign className="w-4 h-4" />;
    }
  };

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case "card": return "Cartão";
      case "pix": return "PIX";
      case "cash": return "Dinheiro";
      default: return method;
    }
  };

  const formatDate = (date: string) => {
    return format(new Date(date), "dd/MM/yyyy", { locale: ptBR });
  };

  const isExpiringSoon = (nextBillingDate: string) => {
    const billing = new Date(nextBillingDate);
    const now = new Date();
    const daysUntil = Math.ceil((billing.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntil <= 3 && daysUntil >= 0;
  };

  const isExpired = (nextBillingDate: string) => {
    return new Date(nextBillingDate) < new Date();
  };

  const pendingSubscriptions = subscriptions.filter(s => s.status === "pending");
  const activeSubscriptions = subscriptions.filter(s => s.status === "active");
  const pastDueSubscriptions = subscriptions.filter(s => s.status === "past_due");
  const expiredSubscriptions = subscriptions.filter(s => s.status === "expired" || (s.status === "active" && isExpired(s.nextBillingDate)));
  const cancelledSubscriptions = subscriptions.filter(s => s.status === "cancelled");

  const filteredSubscriptions = subscriptions.filter((s: Subscription) => {
    const clientName = getClientName(s.clientId).toLowerCase();
    const packageName = getPackageName(s.packageId).toLowerCase();
    return clientName.includes(searchTerm.toLowerCase()) || packageName.includes(searchTerm.toLowerCase());
  });

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
        {pastDueSubscriptions.length > 0 && (
          <Alert variant="destructive" className="border-red-500/50 bg-red-500/10">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Assinaturas Inadimplentes</AlertTitle>
            <AlertDescription>
              <p>
                {pastDueSubscriptions.length} assinatura(s) com pagamento pendente. 
                <strong> Os créditos dessas assinaturas estão bloqueados</strong> até que o pagamento seja regularizado.
              </p>
              <ul className="mt-2 text-sm list-disc list-inside">
                {pastDueSubscriptions.map(sub => (
                  <li key={sub.id}>
                    {getClientName(sub.clientId)} - {getPackageName(sub.packageId)}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Assinaturas</h1>
            <p className="text-muted-foreground">Gerencie planos recorrentes dos clientes.</p>
          </div>

          <Button 
            data-testid="button-new-subscription" 
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => window.location.href = '/pos'}
          >
            <Plus className="mr-2 h-4 w-4" /> Nova Assinatura
          </Button>
          
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>Criar Assinatura pelo PDV</DialogTitle>
                <DialogDescription>
                  Para criar uma nova assinatura, vá ao PDV, selecione o cliente e adicione um plano da aba "Assinaturas".
                  Ao fechar a comanda, a assinatura será criada automaticamente com o pagamento registrado no caixa.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button onClick={() => window.location.href = '/pos'}>
                  Ir para o PDV
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{pendingSubscriptions.length}</p>
                  <p className="text-xs text-muted-foreground">Aguardando Pagamento</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center text-green-400">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{activeSubscriptions.length}</p>
                  <p className="text-xs text-muted-foreground">Ativas</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-400">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{pastDueSubscriptions.length}</p>
                  <p className="text-xs text-muted-foreground">Em Atraso</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400">
                  <XCircle className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{expiredSubscriptions.length + cancelledSubscriptions.length}</p>
                  <p className="text-xs text-muted-foreground">Canceladas/Vencidas</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    R$ {activeSubscriptions.reduce((sum, s) => sum + parseFloat(getPackagePrice(s.packageId)), 0).toFixed(0)}
                  </p>
                  <p className="text-xs text-muted-foreground">Receita Recorrente</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente ou plano..."
            className="pl-10 bg-card border-border"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="space-y-4">
          {filteredSubscriptions.map((sub: Subscription) => {
            const expiringSoon = isExpiringSoon(sub.nextBillingDate);
            const expired = isExpired(sub.nextBillingDate) && sub.status === "active";
            
            return (
              <Card 
                key={sub.id} 
                className={`bg-card/50 ${expiringSoon ? "border-yellow-500/50" : expired ? "border-red-500/50" : ""}`}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <User className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg">{getClientName(sub.clientId)}</h3>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Package className="w-3 h-3" />
                          {getPackageName(sub.packageId)}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-3">
                      {getStatusBadge(expired ? "expired" : sub.status)}
                      
                      <div className="flex items-center gap-1 text-sm">
                        {getPaymentMethodIcon(sub.paymentMethod)}
                        <span>{getPaymentMethodLabel(sub.paymentMethod)}</span>
                      </div>
                      
                      <div className="text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Vence: {formatDate(sub.nextBillingDate)}
                        </span>
                      </div>
                      
                      <span className="text-lg font-bold text-primary">
                        R$ {parseFloat(getPackagePrice(sub.packageId)).toFixed(2)}
                      </span>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-card border-border">
                          {sub.status === "pending" && sub.paymentMethod !== "card" && (
                            <DropdownMenuItem 
                              onClick={() => {
                                if (confirm("Confirma que recebeu o pagamento e deseja ativar esta assinatura?")) {
                                  activateMutation.mutate(sub.id);
                                }
                              }}
                              className="text-green-500"
                            >
                              <CheckCircle className="w-4 h-4 mr-2" /> Ativar (Pagamento Recebido)
                            </DropdownMenuItem>
                          )}
                          {sub.status === "active" && (
                            <DropdownMenuItem onClick={() => {
                              setSelectedSubscription(sub);
                              setRenewData({ paymentMethod: sub.paymentMethod, notes: "" });
                              setIsRenewDialogOpen(true);
                            }}>
                              <RefreshCw className="w-4 h-4 mr-2" /> Renovar
                            </DropdownMenuItem>
                          )}
                          {sub.paymentMethod === "card" && (
                            <>
                              {sub.status === "pending" ? (
                                <DropdownMenuItem onClick={() => handleSetupCard(sub.id)}>
                                  <CreditCard className="w-4 h-4 mr-2" /> Reenviar Link de Pagamento
                                </DropdownMenuItem>
                              ) : !sub.stripeCustomerId ? (
                                <DropdownMenuItem onClick={() => handleSetupCard(sub.id)}>
                                  <CreditCard className="w-4 h-4 mr-2" /> Cadastrar Cartão
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => handleChargeCard(sub.id)}>
                                  <CreditCard className="w-4 h-4 mr-2" /> Cobrar Cartão
                                </DropdownMenuItem>
                              )}
                            </>
                          )}
                          <DropdownMenuItem onClick={() => {
                            setSelectedSubscription(sub);
                            setIsPaymentsDialogOpen(true);
                          }}>
                            <History className="w-4 h-4 mr-2" /> Histórico
                          </DropdownMenuItem>
                          {sub.status === "active" && (
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={() => {
                                if (confirm("Tem certeza que deseja cancelar esta assinatura?")) {
                                  cancelMutation.mutate(sub.id);
                                }
                              }}
                            >
                              <XCircle className="w-4 h-4 mr-2" /> Cancelar
                            </DropdownMenuItem>
                          )}
                          {(sub.status === "pending" || sub.status === "cancelled") && (
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={() => {
                                if (confirm("Tem certeza que deseja excluir esta assinatura? Esta ação não pode ser desfeita.")) {
                                  deleteMutation.mutate(sub.id);
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4 mr-2" /> Excluir
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  
                  {(expiringSoon || expired) && sub.status === "active" && (
                    <div className={`mt-3 p-2 rounded ${expired ? "bg-red-500/10 text-red-400" : "bg-yellow-500/10 text-yellow-400"} text-sm flex items-center gap-2`}>
                      <AlertCircle className="w-4 h-4" />
                      {expired ? "Assinatura vencida! Renove para liberar créditos." : "Assinatura vence em breve!"}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {filteredSubscriptions.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <RefreshCw className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma assinatura cadastrada.</p>
            <p className="text-sm mt-1">Crie planos recorrentes em Pacotes e depois cadastre assinaturas aqui.</p>
          </div>
        )}

        <Dialog open={isRenewDialogOpen} onOpenChange={setIsRenewDialogOpen}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle>Renovar Assinatura</DialogTitle>
              <DialogDescription>
                Registre o pagamento e renove os créditos do cliente.
              </DialogDescription>
            </DialogHeader>
            {selectedSubscription && (
              <div className="space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="font-medium">{getClientName(selectedSubscription.clientId)}</p>
                  <p className="text-sm text-muted-foreground">{getPackageName(selectedSubscription.packageId)}</p>
                  <p className="text-lg font-bold text-primary mt-2">
                    R$ {parseFloat(getPackagePrice(selectedSubscription.packageId)).toFixed(2)}
                  </p>
                </div>
                <div>
                  <Label>Forma de Pagamento</Label>
                  <Select
                    value={renewData.paymentMethod}
                    onValueChange={(value) => setRenewData({ ...renewData, paymentMethod: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Dinheiro</SelectItem>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="card">Cartão</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Observações</Label>
                  <Input
                    value={renewData.notes}
                    onChange={(e) => setRenewData({ ...renewData, notes: e.target.value })}
                    placeholder="Observações opcionais..."
                  />
                </div>
                <DialogFooter>
                  <Button 
                    onClick={() => renewMutation.mutate({ id: selectedSubscription.id, ...renewData })}
                    disabled={renewMutation.isPending}
                  >
                    {renewMutation.isPending ? "Renovando..." : "Confirmar Renovação"}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={isPaymentsDialogOpen} onOpenChange={setIsPaymentsDialogOpen}>
          <DialogContent className="bg-card border-border max-w-2xl">
            <DialogHeader>
              <DialogTitle>Histórico de Pagamentos</DialogTitle>
              <DialogDescription>
                {selectedSubscription && `${getClientName(selectedSubscription.clientId)} - ${getPackageName(selectedSubscription.packageId)}`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {payments.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhum pagamento registrado.</p>
              ) : (
                payments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      {getPaymentMethodIcon(payment.paymentMethod)}
                      <div>
                        <p className="font-medium">R$ {parseFloat(payment.amount).toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">
                          {payment.paidAt ? formatDate(payment.paidAt) : "Pendente"} • {getPaymentMethodLabel(payment.paymentMethod)}
                        </p>
                        {payment.receivedByName && (
                          <p className="text-xs text-muted-foreground">
                            Recebido por: {payment.receivedByName}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge className={payment.status === "paid" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}>
                      {payment.status === "paid" ? "Pago" : "Pendente"}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
