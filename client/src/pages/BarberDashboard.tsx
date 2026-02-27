import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Scissors, 
  LogOut, 
  Loader2, 
  TrendingUp, 
  ShoppingBag,
  DollarSign,
  Filter,
  Clock,
  CheckCircle,
  History,
  Package,
  CalendarDays,
  User,
  Phone,
  RefreshCw,
  Minus,
  AlertTriangle,
  X
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toZonedTime, fromZonedTime, format as formatTz } from "date-fns-tz";

const BRAZIL_TIMEZONE = "America/Sao_Paulo";

const formatBrazilTime = (dateString: string, formatStr: string) => {
  const date = new Date(dateString);
  const brazilTime = toZonedTime(date, BRAZIL_TIMEZONE);
  return formatTz(brazilTime, formatStr, { locale: ptBR, timeZone: BRAZIL_TIMEZONE });
};

const parseBrazilDate = (dateStr: string, timeStr: string = "12:00:00") => {
  return fromZonedTime(`${dateStr}T${timeStr}`, BRAZIL_TIMEZONE);
};

// Format time in UTC (appointments are stored as UTC)
const formatTimeUTC = (dateString: string): string => {
  const date = new Date(dateString);
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const mins = date.getUTCMinutes().toString().padStart(2, '0');
  return `${hours}:${mins}`;
};

type BarberInfo = {
  id: string;
  name: string;
  avatar?: string;
  barbershopId: string;
  barbershopName: string;
};

type Commission = {
  id: string;
  comandaItemId: string;
  amount: string;
  type: string;
  originalType: string;
  itemName: string;
  clientName?: string;
  createdAt: string;
  comandaDate?: string;
  paid: boolean;
  paidAt?: string;
};

type BarberAppointment = {
  id: string;
  clientName: string;
  clientPhone?: string;
  serviceName: string;
  duration: number;
  startTime: string;
  endTime: string;
  status: string;
  notes?: string;
};

type Purchase = {
  productName: string;
  quantity: number;
  originalPrice: string;
  totalPrice: string;
  comandaDate: string;
};

type PaymentHistory = {
  id: string;
  periodStart: string;
  periodEnd: string;
  totalCommissions: string;
  totalDeductions: string;
  netAmount: string;
  paidAt: string;
};

const getBrazilDate = () => {
  return toZonedTime(new Date(), BRAZIL_TIMEZONE);
};

export default function BarberDashboard() {
  const [, setLocation] = useLocation();
  const [barber, setBarber] = useState<BarberInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("comissoes");
  const [dateFilter, setDateFilter] = useState("today");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistory[]>([]);
  const [appointments, setAppointments] = useState<BarberAppointment[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [refundNotifications, setRefundNotifications] = useState<any[]>([]);
  
  const [agendaDate, setAgendaDate] = useState(() => {
    const today = getBrazilDate();
    return format(today, 'yyyy-MM-dd');
  });

  const getDateRange = () => {
    const now = getBrazilDate();
    switch (dateFilter) {
      case "today":
        return { start: startOfDay(now), end: endOfDay(now) };
      case "week":
        return { start: startOfWeek(now, { locale: ptBR }), end: endOfWeek(now, { locale: ptBR }) };
      case "month":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "custom":
        return { 
          start: customStartDate ? parseBrazilDate(customStartDate, "00:00:00") : subDays(now, 30),
          end: customEndDate ? parseBrazilDate(customEndDate, "23:59:59") : now
        };
      default:
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (barber) {
      loadData();
    }
  }, [barber, dateFilter, customStartDate, customEndDate]);

  useEffect(() => {
    if (barber && activeTab === "agenda") {
      loadAppointments();
    }
  }, [barber, agendaDate, activeTab]);

  useEffect(() => {
    if (!barber) return;
    
    const interval = setInterval(() => {
      if (activeTab === "agenda") {
        loadAppointments();
      } else {
        loadData();
      }
    }, 30000);
    
    return () => clearInterval(interval);
  }, [barber, activeTab, dateFilter, agendaDate]);

  const checkAuth = async () => {
    try {
      const response = await fetch("/api/barber/me");
      if (!response.ok) {
        setLocation("/barbeiro");
        return;
      }
      const data = await response.json();
      setBarber(data.barber);
    } catch (error) {
      setLocation("/barbeiro");
    } finally {
      setIsLoading(false);
    }
  };

  const loadData = async () => {
    if (!barber) return;
    setLoadingData(true);
    
    try {
      const { start, end } = getDateRange();
      const params = new URLSearchParams();
      params.append("startDate", start.toISOString());
      params.append("endDate", end.toISOString());

      const [commissionsRes, purchasesRes, historyRes, notificationsRes] = await Promise.all([
        fetch(`/api/barber/commissions?${params.toString()}&paid=false`),
        fetch(`/api/barber/purchases?${params.toString()}`),
        fetch("/api/barber/payment-history"),
        fetch("/api/refund-notifications")
      ]);

      if (commissionsRes.ok) {
        setCommissions(await commissionsRes.json());
      }
      if (purchasesRes.ok) {
        setPurchases(await purchasesRes.json());
      }
      if (historyRes.ok) {
        setPaymentHistory(await historyRes.json());
      }
      if (notificationsRes.ok) {
        setRefundNotifications(await notificationsRes.json());
      }
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoadingData(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/barber/logout", { method: "POST" });
    setLocation("/barbeiro");
  };

  const dismissRefundNotification = async (notificationId: string) => {
    try {
      await fetch(`/api/refund-notifications/${notificationId}/read`, { method: "PATCH" });
      setRefundNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error("Error dismissing notification:", error);
    }
  };

  const loadAppointments = async () => {
    if (!barber) return;
    setLoadingData(true);
    try {
      const res = await fetch(`/api/barber/appointments?date=${agendaDate}`);
      if (res.ok) {
        setAppointments(await res.json());
      }
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Error loading appointments:", error);
    } finally {
      setLoadingData(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Agendado</Badge>;
      case 'confirmed':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Confirmado</Badge>;
      case 'completed':
        return <Badge className="bg-primary/20 text-primary border-primary/30">Concluído</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Cancelado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const { serviceCommissionsWithNet, productSaleCommissionsWithNet, productPurchaseCommissions, packageCommissionsWithNet } = useMemo(() => {
    const services = commissions.filter(c => c.type === 'service' && c.originalType !== 'fee_deduction');
    const productSales = commissions.filter(c => c.type === 'product' && parseFloat(c.amount || "0") >= 0 && c.originalType !== 'fee_deduction');
    const packages = commissions.filter(c => c.type === 'package_use' && c.originalType !== 'fee_deduction');
    
    const feeDeductions = commissions.filter(c => c.originalType === 'fee_deduction');
    
    const productPurchases = commissions.filter(c => 
      (c.originalType === 'deduction' && c.itemName && 
        !services.some(s => s.comandaItemId === c.comandaItemId) &&
        !packages.some(p => p.comandaItemId === c.comandaItemId)
      ) || 
      (c.type === 'product' && parseFloat(c.amount || "0") < 0)
    );
    
    const servicesWithNet = services.map(s => {
      const relatedFee = feeDeductions.find(d => d.comandaItemId === s.comandaItemId);
      const feeAmount = relatedFee ? Math.abs(parseFloat(relatedFee.amount || "0")) : 0;
      const netAmount = parseFloat(s.amount || "0") - feeAmount;
      return { ...s, netAmount, hasDeduction: feeAmount > 0 };
    });
    
    const packagesWithNet = packages.map(p => {
      const relatedFee = feeDeductions.find(d => d.comandaItemId === p.comandaItemId);
      const feeAmount = relatedFee ? Math.abs(parseFloat(relatedFee.amount || "0")) : 0;
      const netAmount = parseFloat(p.amount || "0") - feeAmount;
      return { ...p, netAmount, hasDeduction: feeAmount > 0 };
    });
    
    const productSalesWithNet = productSales.map(p => {
      const relatedFee = feeDeductions.find(d => d.comandaItemId === p.comandaItemId);
      const feeAmount = relatedFee ? Math.abs(parseFloat(relatedFee.amount || "0")) : 0;
      const netAmount = parseFloat(p.amount || "0") - feeAmount;
      return { ...p, netAmount, hasDeduction: feeAmount > 0 };
    });
    
    return { 
      serviceCommissionsWithNet: servicesWithNet, 
      productSaleCommissionsWithNet: productSalesWithNet, 
      productPurchaseCommissions: productPurchases, 
      packageCommissionsWithNet: packagesWithNet 
    };
  }, [commissions]);

  const totalServiceCommissions = serviceCommissionsWithNet.reduce((acc, c) => acc + c.netAmount, 0);
  const totalProductCommissions = productSaleCommissionsWithNet.reduce((acc, c) => acc + c.netAmount, 0);
  const totalPackageCommissions = packageCommissionsWithNet.reduce((acc, c) => acc + c.netAmount, 0);
  // Compras do profissional (valores negativos do novo sistema)
  const totalProductPurchases = Math.abs(productPurchaseCommissions.reduce((acc, c) => acc + parseFloat(c.amount || "0"), 0));
  const totalCommissions = totalServiceCommissions + totalProductCommissions + totalPackageCommissions;
  // Total de compras = sistema antigo (purchases) + novo sistema (productPurchaseCommissions)
  const totalOldPurchases = purchases.reduce((acc, p) => acc + parseFloat(p.totalPrice || "0"), 0);
  const totalPurchases = totalOldPurchases + totalProductPurchases;
  const netAmount = totalCommissions - totalPurchases;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!barber) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-card/95 backdrop-blur border-b border-border">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border-2 border-primary/30">
              {barber.avatar && (
                <AvatarImage src={barber.avatar?.startsWith('/objects/') ? barber.avatar : `/objects/${barber.avatar}`} alt={barber.name} />
              )}
              <AvatarFallback className="bg-primary/20 text-primary font-bold">
                {barber.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="font-semibold text-foreground">{barber.name}</h1>
              <p className="text-xs text-muted-foreground">{barber.barbershopName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => activeTab === "agenda" ? loadAppointments() : loadData()}
              disabled={loadingData}
              data-testid="button-refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loadingData ? 'animate-spin' : ''}`} />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleLogout}
              data-testid="button-barber-logout"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {refundNotifications.length > 0 && (
          <div className="space-y-2">
            {refundNotifications.map((notification: any) => (
              <Alert
                key={notification.id}
                variant="destructive"
                className="border-red-500/30 bg-red-500/10"
                data-testid={`alert-refund-notification-${notification.id}`}
              >
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between">
                  <span>
                    Comanda estornada: {notification.clientName || 'Cliente'} - R$ {parseFloat(notification.amount || 0).toFixed(2)}
                    {notification.itemsDescription && ` - ${notification.itemsDescription}`}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 ml-2"
                    data-testid={`button-dismiss-refund-${notification.id}`}
                    onClick={() => dismissRefundNotification(notification.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </AlertDescription>
              </Alert>
            ))}
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            {["today", "week", "month", "custom"].map((filter) => (
              <Button
                key={filter}
                variant={dateFilter === filter ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  if (filter === "custom" && !customStartDate && !customEndDate) {
                    const today = format(new Date(), 'yyyy-MM-dd');
                    setCustomStartDate(today);
                    setCustomEndDate(today);
                  }
                  setDateFilter(filter);
                }}
                className={dateFilter === filter ? "bg-primary text-primary-foreground" : ""}
                data-testid={`button-filter-${filter}`}
              >
                {filter === "today" && "Hoje"}
                {filter === "week" && "Semana"}
                {filter === "month" && "Mês"}
                {filter === "custom" && <><Filter className="w-4 h-4 mr-1" /> Período</>}
              </Button>
            ))}
          </div>
          
          {dateFilter === "custom" && (
            <div className="flex gap-2 items-center">
              <Input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-36 bg-card"
                data-testid="input-custom-start"
              />
              <span className="text-muted-foreground">até</span>
              <Input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-36 bg-card"
                data-testid="input-custom-end"
              />
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-right">
          Atualizado: {format(lastUpdate, "HH:mm:ss", { locale: ptBR })}
        </p>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-card border border-border grid grid-cols-3 w-full">
            <TabsTrigger value="comissoes" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <DollarSign className="w-4 h-4 mr-1" /> <span className="hidden sm:inline">Comissões</span>
            </TabsTrigger>
            <TabsTrigger value="agenda" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <CalendarDays className="w-4 h-4 mr-1" /> <span className="hidden sm:inline">Agenda</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <History className="w-4 h-4 mr-1" /> <span className="hidden sm:inline">Histórico</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="comissoes" className="space-y-6">
            {loadingData ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card className="bg-gradient-to-br from-blue-500/10 to-card border-blue-500/20">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2">
                        <Scissors className="h-5 w-5 text-blue-500" />
                        <div>
                          <p className="text-xs text-muted-foreground">Serviços</p>
                          <p className="text-lg font-bold text-blue-500" data-testid="text-service-commissions">
                            R$ {totalServiceCommissions.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-gradient-to-br from-purple-500/10 to-card border-purple-500/20">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2">
                        <ShoppingBag className="h-5 w-5 text-purple-500" />
                        <div>
                          <p className="text-xs text-muted-foreground">Vendas</p>
                          <p className="text-lg font-bold text-purple-500" data-testid="text-product-commissions">
                            R$ {totalProductCommissions.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-gradient-to-br from-red-500/10 to-card border-red-500/20">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2">
                        <Minus className="h-5 w-5 text-red-500" />
                        <div>
                          <p className="text-xs text-muted-foreground">Suas Compras</p>
                          <p className="text-lg font-bold text-red-500" data-testid="text-total-purchases">
                            -R$ {totalPurchases.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className={`bg-gradient-to-br ${netAmount >= 0 ? 'from-primary/10 border-primary/20' : 'from-red-500/10 border-red-500/20'} to-card`}>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2">
                        <TrendingUp className={`h-5 w-5 ${netAmount >= 0 ? 'text-primary' : 'text-red-500'}`} />
                        <div>
                          <p className="text-xs text-muted-foreground">Líquido</p>
                          <p className={`text-lg font-bold ${netAmount >= 0 ? 'text-primary' : 'text-red-500'}`} data-testid="text-net-amount">
                            R$ {netAmount.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {commissions.length === 0 && purchases.length === 0 ? (
                  <Card className="bg-card/50">
                    <CardContent className="py-12 text-center text-muted-foreground">
                      <DollarSign className="w-12 h-12 mx-auto mb-4 opacity-30" />
                      <p>Nenhuma comissão no período selecionado.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {serviceCommissionsWithNet.length > 0 && (
                      <Card className="bg-card/50 border-blue-500/20">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2 text-blue-400">
                            <Scissors className="w-4 h-4" />
                            Comissões de Serviços ({serviceCommissionsWithNet.length})
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {serviceCommissionsWithNet.map((commission) => (
                              <div 
                                key={commission.id}
                                className="flex items-center justify-between p-3 rounded-lg bg-blue-500/5 border border-blue-500/10"
                                data-testid={`service-commission-${commission.id}`}
                              >
                                <div className="flex-1">
                                  <p className="font-medium text-sm">{commission.itemName}</p>
                                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {formatBrazilTime(commission.comandaDate || commission.createdAt, "dd/MM HH:mm")}
                                    </span>
                                    {commission.clientName && (
                                      <span className="flex items-center gap-1">
                                        <User className="w-3 h-3" />
                                        {commission.clientName}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <span className="font-bold text-green-500 text-sm">
                                  +R$ {commission.netAmount.toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {productSaleCommissionsWithNet.length > 0 && (
                      <Card className="bg-card/50 border-purple-500/20">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2 text-purple-400">
                            <ShoppingBag className="w-4 h-4" />
                            Comissões de Vendas de Produtos ({productSaleCommissionsWithNet.length})
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {productSaleCommissionsWithNet.map((commission) => (
                              <div 
                                key={commission.id}
                                className="flex items-center justify-between p-3 rounded-lg bg-purple-500/5 border border-purple-500/10"
                                data-testid={`product-commission-${commission.id}`}
                              >
                                <div className="flex-1">
                                  <p className="font-medium text-sm">{commission.itemName}</p>
                                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {formatBrazilTime(commission.comandaDate || commission.createdAt, "dd/MM HH:mm")}
                                    </span>
                                    {commission.clientName && (
                                      <span className="flex items-center gap-1">
                                        <User className="w-3 h-3" />
                                        {commission.clientName}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <span className="font-bold text-green-500 text-sm">
                                  +R$ {commission.netAmount.toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {packageCommissionsWithNet.length > 0 && (
                      <Card className="bg-card/50 border-amber-500/20">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2 text-amber-400">
                            <Package className="w-4 h-4" />
                            Comissões de Uso de Pacotes ({packageCommissionsWithNet.length})
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {packageCommissionsWithNet.map((commission) => (
                              <div 
                                key={commission.id}
                                className="flex items-center justify-between p-3 rounded-lg bg-amber-500/5 border border-amber-500/10"
                                data-testid={`package-commission-${commission.id}`}
                              >
                                <div className="flex-1">
                                  <p className="font-medium text-sm">{commission.itemName}</p>
                                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {formatBrazilTime(commission.comandaDate || commission.createdAt, "dd/MM HH:mm")}
                                    </span>
                                    {commission.clientName && (
                                      <span className="flex items-center gap-1">
                                        <User className="w-3 h-3" />
                                        {commission.clientName}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <span className="font-bold text-green-500 text-sm">
                                  +R$ {commission.netAmount.toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Compras do profissional - novo sistema */}
                    {productPurchaseCommissions.length > 0 && (
                      <Card className="bg-card/50 border-red-500/20">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2 text-red-400">
                            <Minus className="w-4 h-4" />
                            Suas Compras ({productPurchaseCommissions.length})
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {productPurchaseCommissions.map((commission) => (
                              <div 
                                key={commission.id}
                                className="flex items-center justify-between p-3 rounded-lg bg-red-500/5 border border-red-500/10"
                                data-testid={`purchase-commission-${commission.id}`}
                              >
                                <div className="flex-1">
                                  <p className="font-medium text-sm">{commission.itemName || 'Produto'}</p>
                                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {formatBrazilTime(commission.comandaDate || commission.createdAt, "dd/MM HH:mm")}
                                    </span>
                                  </div>
                                </div>
                                <span className="font-bold text-red-500 text-sm">
                                  -R$ {Math.abs(parseFloat(commission.amount)).toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                    
                    {/* Compras do sistema antigo */}
                    {purchases.length > 0 && (
                      <Card className="bg-card/50 border-red-500/20">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2 text-red-400">
                            <Minus className="w-4 h-4" />
                            Compras Anteriores ({purchases.length})
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {purchases.map((purchase, index) => (
                              <div 
                                key={index}
                                className="flex items-center justify-between p-3 rounded-lg bg-red-500/5 border border-red-500/10"
                                data-testid={`purchase-item-${index}`}
                              >
                                <div className="flex-1">
                                  <p className="font-medium text-sm">{purchase.productName}</p>
                                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                    <span>Qtd: {purchase.quantity}</span>
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {formatBrazilTime(purchase.comandaDate, "dd/MM HH:mm")}
                                    </span>
                                  </div>
                                </div>
                                <span className="font-bold text-red-500 text-sm">
                                  -R$ {parseFloat(purchase.totalPrice).toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="agenda" className="space-y-4">
            <div className="flex items-center gap-4">
              <Input
                type="date"
                value={agendaDate}
                onChange={(e) => setAgendaDate(e.target.value)}
                className="w-44 bg-card"
                data-testid="input-agenda-date"
              />
              <span className="text-sm text-muted-foreground">
                {formatTz(parseBrazilDate(agendaDate), "EEEE, dd 'de' MMMM", { locale: ptBR, timeZone: BRAZIL_TIMEZONE })}
              </span>
            </div>

            {loadingData ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : appointments.length === 0 ? (
              <Card className="bg-card/50">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <CalendarDays className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>Nenhum agendamento para esta data.</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CalendarDays className="w-5 h-5 text-primary" />
                    Agenda do Dia ({appointments.length} agendamentos)
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-visible">
                  <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                    {appointments.map((apt) => (
                        <div 
                          key={apt.id}
                          className="p-4 rounded-lg bg-background/50 border border-border/50"
                          data-testid={`appointment-${apt.id}`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-lg font-bold text-primary">
                                  {formatTimeUTC(apt.startTime)}
                                </span>
                                <span className="text-muted-foreground">-</span>
                                <span className="text-sm text-muted-foreground">
                                  {formatTimeUTC(apt.endTime)}
                                </span>
                                {getStatusBadge(apt.status)}
                              </div>
                              <p className="font-medium flex items-center gap-2">
                                <Scissors className="w-4 h-4 text-primary" />
                                {apt.serviceName}
                              </p>
                              <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                                <User className="w-4 h-4" />
                                {apt.clientName}
                              </p>
                              {apt.clientPhone && (
                                <p className="text-sm text-muted-foreground flex items-center gap-2">
                                  <Phone className="w-4 h-4" />
                                  {apt.clientPhone}
                                </p>
                              )}
                              {apt.notes && (
                                <p className="text-xs text-muted-foreground mt-2 italic">
                                  Obs: {apt.notes}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            {paymentHistory.length === 0 ? (
              <Card className="bg-card/50">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <History className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>Nenhum histórico de pagamento encontrado.</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <History className="w-5 h-5 text-primary" />
                    Histórico de Pagamentos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="max-h-[500px]">
                    <div className="space-y-3">
                      {paymentHistory.map((payment) => (
                        <div 
                          key={payment.id}
                          className="p-4 rounded-lg bg-green-500/5 border border-green-500/20"
                          data-testid={`payment-history-${payment.id}`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">
                              {formatBrazilTime(payment.periodStart, "dd/MM/yyyy")} - {formatBrazilTime(payment.periodEnd, "dd/MM/yyyy")}
                            </span>
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                              Pago em {formatBrazilTime(payment.paidAt, "dd/MM/yyyy")}
                            </Badge>
                          </div>
                          <Separator className="my-2" />
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Comissões</p>
                              <p className="font-bold text-green-500">R$ {parseFloat(payment.totalCommissions).toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Deduções</p>
                              <p className="font-bold text-red-500">-R$ {parseFloat(payment.totalDeductions).toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Líquido</p>
                              <p className="font-bold text-primary">R$ {parseFloat(payment.netAmount).toFixed(2)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
