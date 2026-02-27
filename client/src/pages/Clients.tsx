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
  Gift,
  Users,
  AlertCircle,
  Clock,
  Scissors,
  ShoppingBag,
  X,
  ChevronRight,
  UserX,
  Calendar
} from "lucide-react";
import { useClients, useCreateClient, useDeleteClient, usePackages, useCreateClientPackage, useClientPackages, useClientHistory } from "@/lib/api";
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

  const { data: clients = [], isLoading } = useClients();
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
      const comandasForClient = clientPackages.filter((cp: any) => cp.clientId === client.id);
      
      let lastVisit: Date | null = null;
      let totalSpent = 0;
      
      return {
        ...client,
        activePackages: packages,
        hasActivePackages: packages.length > 0,
        totalPackageUses: packages.reduce((acc: number, p: any) => acc + p.quantityRemaining, 0),
        lastVisit,
        totalSpent,
        isInactive: false
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
    const inactive = 0;

    return { total, withPackages, expiringPackages, inactive };
  }, [clientsWithMetrics, clientPackages]);

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
            <p className="text-muted-foreground">Gerencie sua base de clientes, pacotes e histórico.</p>
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card/50 border-border hover:border-primary/30 transition-colors cursor-pointer" onClick={() => setFilterTab("all")} data-testid="stat-total-clients">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Total de Clientes</p>
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
                <div>
                  <p className="text-2xl font-bold text-green-500">{stats.withPackages}</p>
                  <p className="text-xs text-muted-foreground">Com Pacotes Ativos</p>
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
                <div>
                  <p className="text-2xl font-bold text-amber-500">{stats.expiringPackages}</p>
                  <p className="text-xs text-muted-foreground">Pacotes Expirando</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-card/50 border-border hover:border-red-500/30 transition-colors cursor-pointer" onClick={() => setFilterTab("inactive")} data-testid="stat-inactive">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/10">
                  <UserX className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-500">{stats.inactive}</p>
                  <p className="text-xs text-muted-foreground">Clientes Inativos</p>
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
            
            <Tabs value={filterTab} onValueChange={setFilterTab} className="w-auto">
              <TabsList className="bg-background/50">
                <TabsTrigger value="all" data-testid="tab-all">Todos</TabsTrigger>
                <TabsTrigger value="with_packages" data-testid="tab-with-packages">Com Pacotes</TabsTrigger>
                <TabsTrigger value="inactive" data-testid="tab-inactive">Inativos</TabsTrigger>
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
                      <Badge variant="secondary" className="bg-green-500/10 text-green-500 border-green-500/30">
                        Ativo
                      </Badge>
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
      </div>

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
