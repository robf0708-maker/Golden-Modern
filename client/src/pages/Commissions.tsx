import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { 
  DollarSign,
  Filter,
  CheckCircle,
  Clock,
  Users,
  TrendingUp,
  Scissors,
  Calendar,
  ChevronDown,
  ChevronRight,
  CreditCard,
  History,
  Wallet,
  ShoppingBag,
  AlertCircle,
  RefreshCw,
  Package
} from "lucide-react";
import { format, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toZonedTime, format as formatTz } from "date-fns-tz";
import { useCommissions, usePayCommission, useBarbers, useBarberPurchases, useCloseCommissions, useCommissionPayments, fetchAPI } from "@/lib/api";

const BRAZIL_TIMEZONE = "America/Sao_Paulo";

const formatBrazilDate = (dateString: string, formatStr: string) => {
  const date = new Date(dateString);
  const brazilTime = toZonedTime(date, BRAZIL_TIMEZONE);
  return formatTz(brazilTime, formatStr, { locale: ptBR, timeZone: BRAZIL_TIMEZONE });
};

const getBrazilNow = () => toZonedTime(new Date(), BRAZIL_TIMEZONE);

export default function Commissions() {
  const [dateRange, setDateRange] = useState<'today' | '15days' | '30days' | 'custom'>('today');
  const [startDate, setStartDate] = useState(() => format(getBrazilNow(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(() => format(getBrazilNow(), 'yyyy-MM-dd'));
  const [customStartDate, setCustomStartDate] = useState(() => format(getBrazilNow(), 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState(() => format(getBrazilNow(), 'yyyy-MM-dd'));
  const [selectedBarber, setSelectedBarber] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [expandedPayments, setExpandedPayments] = useState<string[]>([]);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [closeBarber, setCloseBarber] = useState<string>("");
  const [closeStartDate, setCloseStartDate] = useState(() => {
    const now = getBrazilNow();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return format(thirtyDaysAgo, 'yyyy-MM-dd');
  });
  const [closeEndDate, setCloseEndDate] = useState(() => format(getBrazilNow(), 'yyyy-MM-dd'));
  const [closeCommissionsData, setCloseCommissionsData] = useState<any[]>([]);
  const [closeDeductionsData, setCloseDeductionsData] = useState<any[]>([]);
  const [closePurchaseDeductions, setClosePurchaseDeductions] = useState(0);
  const [closeDataLoaded, setCloseDataLoaded] = useState(false);
  const [expandedBarbers, setExpandedBarbers] = useState<string[]>([]);
  const { toast } = useToast();

  const { data: barbers = [] } = useBarbers();
  const activeBarbers = barbers.filter((b: any) => b.active);
  const { data: commissions = [], isLoading } = useCommissions(
    startDate,
    endDate,
    selectedBarber !== "all" ? selectedBarber : undefined
  );
  const { data: barberPurchases = [] } = useBarberPurchases(
    startDate,
    endDate,
    selectedBarber !== "all" ? selectedBarber : undefined
  );
  const { data: commissionPayments = [] } = useCommissionPayments(
    selectedBarber !== "all" ? selectedBarber : undefined
  );

  /** Compra já entrou em algum fechamento de comissão (mesmo barbeiro e data dentro do período). */
  const isPurchaseCoveredByCommissionClose = (
    barberId: string | undefined,
    purchaseDateRaw: string | Date | null | undefined
  ) => {
    if (!barberId || !purchaseDateRaw) return false;
    try {
      const purchaseDate = toZonedTime(new Date(purchaseDateRaw), BRAZIL_TIMEZONE);
      return commissionPayments.some((pay: any) => {
        if (String(pay.barberId) !== String(barberId)) return false;
        const periodStart = toZonedTime(new Date(pay.periodStart), BRAZIL_TIMEZONE);
        const periodEnd = toZonedTime(new Date(pay.periodEnd), BRAZIL_TIMEZONE);
        return purchaseDate >= startOfDay(periodStart) && purchaseDate <= endOfDay(periodEnd);
      });
    } catch {
      return false;
    }
  };

  const payMutation = usePayCommission();
  const closeCommissionsMutation = useCloseCommissions();
  
  const totalBarberPurchases = barberPurchases.reduce((acc: number, p: any) => acc + parseFloat(p.total || 0), 0);
  
  // Separar comissões positivas das deduções
  // Excluir: deduções, compras do barbeiro, vendas de pacote (package/package_sale) - comissão é apenas sobre USO de pacote
  const positiveCommissions = commissions.filter((c: any) => 
    c.originalType !== 'deduction' && 
    !c.isBarberPurchase && 
    c.type !== 'package' &&
    c.type !== 'package_sale' &&
    parseFloat(c.amount || 0) >= 0
  );
  
  // Deduções de compra de produto do profissional
  const productPurchaseDeductions = commissions.filter((c: any) => 
    c.originalType === 'deduction' || c.isBarberPurchase || 
    (c.type === 'deduction' && parseFloat(c.amount || 0) < 0)
  );
  
  // Deduções de taxa (fee) - valores negativos que NÃO são compras de produto (fee_deduction)
  const feeDeductions = commissions.filter((c: any) => 
    (c.type === 'fee_deduction' || c.originalType === 'fee_deduction') ||
    (parseFloat(c.amount || 0) < 0 && 
    c.originalType !== 'deduction' &&
    !c.isBarberPurchase &&
    c.type !== 'package' &&
    c.type !== 'package_use' &&
    c.type !== 'package_sale')
  );
  
  // Calcular valor líquido para cada comissão positiva
  const positiveCommissionsWithNet = positiveCommissions.map((c: any) => {
    if (c.type === 'service' || c.type === 'package_use' || c.type === 'product') {
      const relatedDeduction = feeDeductions.find((d: any) => 
        d.comandaItemId === c.comandaItemId
      );
      const deductionAmount = relatedDeduction ? Math.abs(parseFloat(relatedDeduction.amount || 0)) : 0;
      return { ...c, netAmount: parseFloat(c.amount || 0) - deductionAmount, hasDeduction: deductionAmount > 0 };
    }
    return { ...c, netAmount: parseFloat(c.amount || 0), hasDeduction: false };
  });
  
  const deductionCommissions = productPurchaseDeductions;
  const totalDeductionsFromCommissions = Math.abs(deductionCommissions.reduce((acc: number, c: any) => acc + parseFloat(c.amount || 0), 0));

  const handleDateRangeChange = (range: 'today' | '15days' | '30days' | 'custom') => {
    setDateRange(range);
    const today = getBrazilNow();
    
    switch (range) {
      case 'today':
        setStartDate(format(today, 'yyyy-MM-dd'));
        setEndDate(format(today, 'yyyy-MM-dd'));
        break;
      case '15days':
        const fifteenDaysAgo = new Date(today);
        fifteenDaysAgo.setDate(today.getDate() - 14);
        setStartDate(format(fifteenDaysAgo, 'yyyy-MM-dd'));
        setEndDate(format(today, 'yyyy-MM-dd'));
        break;
      case '30days':
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(today.getDate() - 29);
        setStartDate(format(thirtyDaysAgo, 'yyyy-MM-dd'));
        setEndDate(format(today, 'yyyy-MM-dd'));
        break;
      case 'custom':
        break;
    }
  };

  const applyCustomFilter = () => {
    setStartDate(customStartDate);
    setEndDate(customEndDate);
  };

  const resetCloseModalData = () => {
    setCloseDataLoaded(false);
    setCloseCommissionsData([]);
    setCloseDeductionsData([]);
    setClosePurchaseDeductions(0);
  };

  const applyCloseFilter = async () => {
    if (!closeBarber) {
      toast({ title: "Selecione um profissional", variant: "destructive" });
      return;
    }
    try {
      const params = new URLSearchParams();
      params.append("startDate", closeStartDate);
      params.append("endDate", closeEndDate);
      params.append("barberId", closeBarber);
      
      const [allCommissions, allPurchases] = await Promise.all([
        fetchAPI(`/commissions?${params.toString()}`),
        fetchAPI(`/barber-purchases?${params.toString()}`)
      ]);
      
      const feeDeductionsClose = allCommissions.filter((c: any) => 
        (c.type === 'fee_deduction' || c.originalType === 'fee_deduction') ||
        (parseFloat(c.amount || 0) < 0 && c.originalType !== 'deduction' && !c.isBarberPurchase && c.type !== 'package' && c.type !== 'package_use' && c.type !== 'package_sale')
      );
      
      const positiveClose = allCommissions.filter((c: any) => 
        c.originalType !== 'deduction' && !c.isBarberPurchase && 
        c.type !== 'package' && c.type !== 'package_sale' &&
        parseFloat(c.amount || 0) >= 0 && !c.paid
      ).map((c: any) => {
        if (c.type === 'service' || c.type === 'package_use' || c.type === 'product') {
          const relatedDed = feeDeductionsClose.find((d: any) => d.comandaItemId === c.comandaItemId);
          const dedAmt = relatedDed ? Math.abs(parseFloat(relatedDed.amount || 0)) : 0;
          return { ...c, netAmount: parseFloat(c.amount || 0) - dedAmt, hasDeduction: dedAmt > 0 };
        }
        return { ...c, netAmount: parseFloat(c.amount || 0), hasDeduction: false };
      });
      
      const deductionsClose = allCommissions.filter((c: any) => 
        (c.originalType === 'deduction' || c.isBarberPurchase || (c.type === 'deduction' && parseFloat(c.amount || 0) < 0)) && !c.paid
      );
      
      const purchasesTotal = allPurchases
        .filter((p: any) => p.barberId === closeBarber)
        .reduce((acc: number, p: any) => acc + parseFloat(p.total || 0), 0);
      
      setCloseCommissionsData(positiveClose);
      setCloseDeductionsData(deductionsClose);
      setClosePurchaseDeductions(purchasesTotal);
      setCloseDataLoaded(true);
    } catch (error: any) {
      toast({ title: "Erro ao carregar dados", description: error.message, variant: "destructive" });
    }
  };

  const handlePayCommission = async (id: number) => {
    try {
      await payMutation.mutateAsync(id);
      toast({ title: "Comissão marcada como paga!" });
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  // Listas separadas: pendentes e pagas (sem incluir deduções nas listas normais)
  const pendingCommissionsList = positiveCommissionsWithNet.filter((c: any) => !c.paid);
  const paidCommissionsList = positiveCommissionsWithNet.filter((c: any) => c.paid);
  const pendingDeductionsList = deductionCommissions.filter((c: any) => !c.paid);
  const pendingUnsettledBarberPurchases = barberPurchases.filter(
    (p: any) => !isPurchaseCoveredByCommissionClose(p.barberId, p.date)
  );

  // Agrupar somente comissões positivas por barbeiro (usando valores líquidos)
  const commissionsByBarber = positiveCommissionsWithNet.reduce((acc: any, c: any) => {
    const barberId = c.barberId;
    if (!acc[barberId]) {
      acc[barberId] = { 
        barber: barbers.find((b: any) => b.id === barberId), 
        total: 0, 
        paid: 0, 
        pending: 0,
        commissions: [],
        purchases: [],
        deductions: [] // compras de produtos (não taxas de serviço)
      };
    }
    acc[barberId].total += c.netAmount;
    if (c.paid) {
      acc[barberId].paid += c.netAmount;
    } else {
      acc[barberId].pending += c.netAmount;
    }
    acc[barberId].commissions.push(c);
    return acc;
  }, {});
  
  // Adicionar apenas compras de produtos (não taxas de serviço)
  deductionCommissions.forEach((d: any) => {
    if (commissionsByBarber[d.barberId]) {
      commissionsByBarber[d.barberId].deductions.push(d);
    } else {
      // Criar entrada para barbeiro que só tem deduções
      commissionsByBarber[d.barberId] = { 
        barber: barbers.find((b: any) => b.id === d.barberId), 
        total: 0, 
        paid: 0, 
        pending: 0,
        commissions: [],
        purchases: [],
        deductions: [d]
      };
    }
  });

  barberPurchases.forEach((p: any) => {
    if (commissionsByBarber[p.barberId]) {
      commissionsByBarber[p.barberId].purchases.push(p);
    }
  });

  const getBarberDeductions = (barberId: string) => {
    const purchaseDeductions = barberPurchases
      .filter(
        (p: any) =>
          p.barberId === barberId && !isPurchaseCoveredByCommissionClose(p.barberId, p.date)
      )
      .reduce((acc: number, p: any) => acc + parseFloat(p.total || 0), 0);
    const commissionDeductions = Math.abs(
      deductionCommissions
        .filter((c: any) => c.barberId === barberId && !c.paid)
        .reduce((acc: number, c: any) => acc + parseFloat(c.amount || 0), 0)
    );
    return purchaseDeductions + commissionDeductions;
  };

  const toggleBarberExpanded = (barberId: string) => {
    setExpandedBarbers(prev => 
      prev.includes(barberId) 
        ? prev.filter(id => id !== barberId)
        : [...prev, barberId]
    );
  };

  const togglePaymentExpanded = (paymentId: string) => {
    setExpandedPayments(prev => 
      prev.includes(paymentId) 
        ? prev.filter(id => id !== paymentId)
        : [...prev, paymentId]
    );
  };

  const getCommissionsForPayment = (payment: any) => {
    const byPaymentId = paidCommissionsList.filter((c: any) => c.paymentId === payment.id);
    if (byPaymentId.length > 0) {
      return byPaymentId;
    }
    return paidCommissionsList.filter((c: any) => {
      if (!c.paidAt || !payment.paidAt) return false;
      const commPaidAt = toZonedTime(new Date(c.paidAt), BRAZIL_TIMEZONE);
      const paymentDate = toZonedTime(new Date(payment.paidAt), BRAZIL_TIMEZONE);
      const periodStart = toZonedTime(new Date(payment.periodStart), BRAZIL_TIMEZONE);
      const periodEnd = toZonedTime(new Date(payment.periodEnd), BRAZIL_TIMEZONE);
      periodEnd.setHours(23, 59, 59, 999);
      const commCreatedAt = toZonedTime(new Date(c.createdAt), BRAZIL_TIMEZONE);
      
      return c.barberId === payment.barberId &&
        commCreatedAt >= periodStart &&
        commCreatedAt <= periodEnd &&
        Math.abs(commPaidAt.getTime() - paymentDate.getTime()) < 60000;
    });
  };

  const handleCloseCommissions = async () => {
    if (closeCommissionsData.length === 0 && closeDeductionsData.length === 0) {
      toast({ title: "Erro", description: "Não há comissões pendentes para fechar", variant: "destructive" });
      return;
    }

    // Calcular comissões positivas (usando valores líquidos)
    const totalComm = closeCommissionsData.reduce((acc: number, c: any) => acc + (c.netAmount || parseFloat(c.amount || 0)), 0);
    const deductions = Math.abs(closeDeductionsData.reduce((acc: number, c: any) => acc + parseFloat(c.amount || 0), 0)) + closePurchaseDeductions;
    const net = totalComm - deductions;

    // Incluir tanto comissões positivas quanto deduções para marcar como pagas
    const allCommissionIds = [
      ...closeCommissionsData.map((c: any) => c.id),
      ...closeDeductionsData.map((c: any) => c.id)
    ];

    try {
      await closeCommissionsMutation.mutateAsync({
        barberId: closeBarber,
        startDate: closeStartDate,
        endDate: closeEndDate,
        commissionIds: allCommissionIds,
        totalCommissions: totalComm,
        totalDeductions: deductions,
        netAmount: net
      });
      toast({ title: "Comissões fechadas com sucesso!", description: `Valor pago: R$ ${net.toFixed(2)}` });
      setIsCloseModalOpen(false);
      setCloseBarber("");
      resetCloseModalData();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const commissionValues = Object.values(commissionsByBarber) as Array<{ pending: number }>;
  const totalPending = commissionValues.reduce((acc, b) => acc + b.pending, 0);
  const totalDeductions = activeBarbers.reduce((acc: number, b: any) => acc + getBarberDeductions(b.id), 0);
  const totalNet = totalPending - totalDeductions;

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Comissões</h1>
            <p className="text-muted-foreground">Gerencie as comissões dos profissionais.</p>
          </div>
          <Button 
            onClick={() => setIsCloseModalOpen(true)}
            className="bg-green-600 hover:bg-green-700 text-white"
            data-testid="button-close-commissions"
          >
            <Wallet className="h-4 w-4 mr-2" />
            Fechar Comissões
          </Button>
        </div>

        <Card className="border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Período</Label>
                <Select value={dateRange} onValueChange={(v: any) => handleDateRangeChange(v)}>
                  <SelectTrigger data-testid="select-date-range">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Hoje</SelectItem>
                    <SelectItem value="15days">15 Dias</SelectItem>
                    <SelectItem value="30days">30 Dias</SelectItem>
                    <SelectItem value="custom">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {dateRange === 'custom' && (
                <>
                  <div className="space-y-2">
                    <Label>Data Inicial</Label>
                    <Input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      data-testid="input-start-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data Final</Label>
                    <Input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      data-testid="input-end-date"
                    />
                  </div>
                  <div className="space-y-2 flex items-end">
                    <Button onClick={applyCustomFilter} className="bg-primary hover:bg-primary/90" data-testid="button-apply-filter">
                      Aplicar
                    </Button>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label>Barbeiro</Label>
                <Select value={selectedBarber} onValueChange={setSelectedBarber}>
                  <SelectTrigger data-testid="select-barber-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Barbeiros</SelectItem>
                    {activeBarbers.map((barber: any) => (
                      <SelectItem key={barber.id} value={barber.id.toString()}>
                        {barber.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-yellow-500/20 bg-gradient-to-br from-yellow-500/10 to-transparent">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-500" />
                Pendentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-yellow-500" data-testid="text-pending-commissions">
                R$ {totalPending.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {pendingCommissionsList.length} a pagar
              </p>
            </CardContent>
          </Card>

          <Card className="border-orange-500/20 bg-gradient-to-br from-orange-500/10 to-transparent">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-orange-500" />
                Descontos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-orange-500" data-testid="text-deductions">
                -R$ {totalDeductions.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {pendingDeductionsList.length + pendingUnsettledBarberPurchases.filter((p: any) => !pendingDeductionsList.some((d: any) => d.itemName === p.productName && d.barberId === p.barberId)).length} itens
              </p>
            </CardContent>
          </Card>

          <Card className={`${totalNet >= 0 ? 'border-green-500/20 bg-gradient-to-br from-green-500/10' : 'border-red-500/20 bg-gradient-to-br from-red-500/10'} to-transparent`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className={`h-4 w-4 ${totalNet >= 0 ? 'text-green-500' : 'text-red-500'}`} />
                Líquido
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${totalNet >= 0 ? 'text-green-500' : 'text-red-500'}`} data-testid="text-net-pending">
                R$ {totalNet.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Total a acertar
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pending" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Pendentes ({pendingCommissionsList.length + pendingDeductionsList.length})
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Histórico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4">
            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Comissões Pendentes por Profissional
                </CardTitle>
              </CardHeader>
              <CardContent>
                {Object.keys(commissionsByBarber).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 opacity-50 mb-2" />
                    <p>Nenhuma comissão no período</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {Object.values(commissionsByBarber).map((item: any) => {
                      const isExpanded = expandedBarbers.includes(item.barber?.id);
                      const deductions = getBarberDeductions(item.barber?.id);
                      const netBarber = item.pending - deductions;
                      const pendingItems = item.commissions.filter((c: any) => !c.paid);
                      const pendingDeductions = item.deductions?.filter((d: any) => !d.paid) || [];
                      
                      // Mostrar barbeiro se tiver comissões pendentes OU deduções pendentes
                      if (pendingItems.length === 0 && pendingDeductions.length === 0) return null;
                      
                      return (
                        <Collapsible key={item.barber?.id} open={isExpanded}>
                          <div className="bg-background/50 rounded-lg border border-border/50 overflow-hidden">
                            <CollapsibleTrigger 
                              className="w-full"
                              onClick={() => toggleBarberExpanded(item.barber?.id)}
                            >
                              <div className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                                <div className="flex items-center gap-3">
                                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                                    <Scissors className="h-5 w-5 text-primary" />
                                  </div>
                                  <div className="text-left">
                                    <p className="font-medium">{item.barber?.name || 'Desconhecido'}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {pendingItems.length > 0 ? `${pendingItems.length} comissões` : ''}
                                      {pendingItems.length > 0 && pendingDeductions.length > 0 ? ' + ' : ''}
                                      {pendingDeductions.length > 0 ? `${pendingDeductions.length} descontos` : ''}
                                      {pendingItems.length === 0 && pendingDeductions.length === 0 ? 'Sem pendências' : ' pendentes'}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4">
                                  <div className="text-right">
                                    <p className="font-bold text-yellow-500">R$ {item.pending.toFixed(2)}</p>
                                    {deductions > 0 && (
                                      <p className="text-xs text-orange-500">-R$ {deductions.toFixed(2)} desc.</p>
                                    )}
                                  </div>
                                  <div className="text-right">
                                    <p className={`font-bold ${netBarber >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                      R$ {netBarber.toFixed(2)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">líquido</p>
                                  </div>
                                </div>
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="border-t border-border/50 p-4 bg-muted/20 max-h-[calc(100vh-280px)] overflow-y-auto">
                                <div className="space-y-2">
                                    {pendingItems.map((c: any) => (
                                      <div 
                                        key={c.id}
                                        className="flex items-center justify-between p-3 bg-background/50 rounded-lg border border-yellow-500/20"
                                      >
                                        <div className="flex flex-col gap-1">
                                          <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="text-xs">
                                              {c.type === 'service' ? 'Serviço' : c.type === 'product' ? 'Produto' : c.type === 'package_use' ? 'Uso de Pacote' : 'Serviço'}
                                            </Badge>
                                            <span className="text-sm font-medium">
                                              {c.itemName || (c.type === 'service' ? 'Serviço' : c.type === 'product' ? 'Produto' : c.type === 'package_use' ? 'Uso de Pacote' : 'Serviço')}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <Calendar className="h-3 w-3" />
                                            <span>
                                              {formatBrazilDate(c.comandaDate || c.createdAt, "dd/MM/yyyy HH:mm")}
                                            </span>
                                            {c.clientName && (
                                              <>
                                                <span>•</span>
                                                <span>{c.clientName}</span>
                                              </>
                                            )}
                                          </div>
                                        </div>
                                        <span className="font-bold text-yellow-500">
                                          R$ {(c.netAmount || parseFloat(c.amount)).toFixed(2)}
                                        </span>
                                      </div>
                                    ))}
                                    {/* Compras de produtos (não taxas de serviço) */}
                                    {item.deductions && item.deductions.length > 0 && (
                                      <>
                                        <div className="text-sm font-medium text-orange-500 mt-4 mb-2 flex items-center gap-2">
                                          <ShoppingBag className="h-4 w-4" />
                                          Compras do Profissional (Descontos)
                                        </div>
                                        {item.deductions.map((d: any) => (
                                          <div 
                                            key={d.id}
                                            className="flex items-center justify-between p-3 bg-background/50 rounded-lg border border-orange-500/20"
                                          >
                                            <div className="flex flex-col gap-1">
                                              <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="text-xs border-orange-500/50 text-orange-500">
                                                  Compra
                                                </Badge>
                                                <span className="text-sm font-medium">
                                                  {d.itemName || 'Produto'}
                                                </span>
                                              </div>
                                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Calendar className="h-3 w-3" />
                                                <span>
                                                  {formatBrazilDate(d.comandaDate || d.createdAt, "dd/MM/yyyy HH:mm")}
                                                </span>
                                              </div>
                                            </div>
                                            <span className="font-bold text-orange-500">
                                              -R$ {Math.abs(parseFloat(d.amount)).toFixed(2)}
                                            </span>
                                          </div>
                                        ))}
                                      </>
                                    )}
                                    {/* Compras do sistema antigo */}
                                    {item.purchases && item.purchases.length > 0 && (
                                      <>
                                        <div className="text-sm font-medium text-orange-500 mt-4 mb-2 flex items-center gap-2">
                                          <ShoppingBag className="h-4 w-4" />
                                          Compras Anteriores (Descontos)
                                        </div>
                                        {item.purchases.map((p: any) => (
                                          <div 
                                            key={p.id}
                                            className="flex items-center justify-between p-3 bg-background/50 rounded-lg border border-orange-500/20"
                                          >
                                            <div className="flex flex-col gap-1">
                                              <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="text-xs border-orange-500/50 text-orange-500">
                                                  Compra
                                                </Badge>
                                                <span className="text-sm font-medium">
                                                  {p.productName}
                                                </span>
                                              </div>
                                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Calendar className="h-3 w-3" />
                                                <span>
                                                  {formatBrazilDate(p.date, "dd/MM/yyyy")}
                                                </span>
                                              </div>
                                            </div>
                                            <span className="font-bold text-orange-500">
                                              -R$ {parseFloat(p.total).toFixed(2)}
                                            </span>
                                          </div>
                                        ))}
                                      </>
                                    )}
                                  </div>
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Histórico de Fechamentos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[500px]">
                  {commissionPayments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <History className="h-12 w-12 opacity-50 mb-2" />
                      <p>Nenhum fechamento realizado</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {commissionPayments.map((payment: any) => {
                        const barber = barbers.find((b: any) => b.id === payment.barberId);
                        const isExpanded = expandedPayments.includes(payment.id);
                        const paymentCommissions = getCommissionsForPayment(payment);
                        
                        return (
                          <Collapsible key={payment.id} open={isExpanded}>
                            <div className="bg-background/50 rounded-lg border border-border/50 overflow-hidden">
                              <CollapsibleTrigger 
                                className="w-full"
                                onClick={() => togglePaymentExpanded(payment.id)}
                              >
                                <div className="p-4 hover:bg-muted/50 transition-colors">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                      <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                                        <CreditCard className="h-5 w-5 text-green-500" />
                                      </div>
                                      <div className="text-left">
                                        <p className="font-medium">{barber?.name || 'Desconhecido'}</p>
                                        <p className="text-xs text-muted-foreground">
                                          Pago em {formatBrazilDate(payment.paidAt, "dd/MM/yyyy HH:mm")}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <p className="font-bold text-green-500 text-lg">
                                        R$ {parseFloat(payment.netAmount).toFixed(2)}
                                      </p>
                                      <p className="text-xs text-muted-foreground">valor pago</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between text-sm text-muted-foreground pt-2 border-t border-border/50">
                                    <div className="flex items-center gap-2">
                                      <Calendar className="h-4 w-4" />
                                      <span>
                                        {formatBrazilDate(payment.periodStart, "dd/MM/yyyy")} - {formatBrazilDate(payment.periodEnd, "dd/MM/yyyy")}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                      <span>Comissões: R$ {parseFloat(payment.totalCommissions).toFixed(2)}</span>
                                      {parseFloat(payment.totalDeductions) > 0 && (
                                        <span className="text-orange-500">
                                          Descontos: -R$ {parseFloat(payment.totalDeductions).toFixed(2)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="border-t border-border/50 p-4 bg-muted/20">
                                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-green-500" />
                                    Comissões deste Fechamento ({paymentCommissions.length})
                                  </h4>
                                  {paymentCommissions.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-4">
                                      Detalhes das comissões não disponíveis
                                    </p>
                                  ) : (
                                    <ScrollArea className="max-h-48">
                                      <div className="space-y-2">
                                        {paymentCommissions.map((c: any) => (
                                          <div 
                                            key={c.id}
                                            className="flex items-center justify-between p-3 bg-green-500/5 rounded-lg border border-green-500/20"
                                          >
                                            <div className="flex items-center gap-2">
                                              <Calendar className="h-4 w-4 text-muted-foreground" />
                                              <span className="text-sm">
                                                {formatBrazilDate(c.createdAt, "dd/MM/yyyy HH:mm")}
                                              </span>
                                              <Badge variant="outline" className="text-xs">
                                                {c.type === 'service' ? 'Serviço' : c.type === 'product' ? 'Produto' : c.type === 'deduction' ? 'Desconto' : c.type === 'package_use' ? 'Uso de Pacote' : 'Serviço'}
                                              </Badge>
                                            </div>
                                            <span className={`font-bold ${parseFloat(c.amount) >= 0 ? 'text-green-500' : 'text-orange-500'}`}>
                                              {parseFloat(c.amount) >= 0 ? 'R$' : '-R$'} {Math.abs(parseFloat(c.amount)).toFixed(2)}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </ScrollArea>
                                  )}
                                </div>
                              </CollapsibleContent>
                            </div>
                          </Collapsible>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={isCloseModalOpen} onOpenChange={setIsCloseModalOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl flex items-center gap-2">
              <Wallet className="h-6 w-6 text-green-500" />
              Fechar Comissões
            </DialogTitle>
            <DialogDescription>
              Selecione o profissional e o período para fechar as comissões pendentes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Profissional</Label>
              <Select value={closeBarber} onValueChange={(v) => { setCloseBarber(v); resetCloseModalData(); }}>
                <SelectTrigger data-testid="select-close-barber">
                  <SelectValue placeholder="Selecione um profissional" />
                </SelectTrigger>
                <SelectContent>
                  {activeBarbers.map((barber: any) => (
                    <SelectItem key={barber.id} value={barber.id}>
                      {barber.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data Inicial</Label>
                <Input
                  type="date"
                  value={closeStartDate}
                  onChange={(e) => { setCloseStartDate(e.target.value); resetCloseModalData(); }}
                  data-testid="input-close-start-date"
                />
              </div>
              <div className="space-y-2">
                <Label>Data Final</Label>
                <Input
                  type="date"
                  value={closeEndDate}
                  onChange={(e) => { setCloseEndDate(e.target.value); resetCloseModalData(); }}
                  data-testid="input-close-end-date"
                />
              </div>
            </div>

            <Button 
              onClick={applyCloseFilter} 
              className="w-full bg-primary hover:bg-primary/90"
              data-testid="button-apply-close-filter"
            >
              Aplicar Período
            </Button>

            {closeDataLoaded && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Resumo do Fechamento
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Comissões Pendentes</p>
                    <p className="font-bold text-lg text-yellow-500">
                      R$ {closeCommissionsData.reduce((acc: number, c: any) => acc + (c.netAmount || parseFloat(c.amount || 0)), 0).toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {closeCommissionsData.length} registros
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Descontos</p>
                    <p className="font-bold text-lg text-orange-500">
                      -R$ {(Math.abs(closeDeductionsData.reduce((acc: number, c: any) => acc + parseFloat(c.amount || 0), 0)) + closePurchaseDeductions).toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {closePurchaseDeductions > 0 && `Compras: R$ ${closePurchaseDeductions.toFixed(2)}`}
                      {closePurchaseDeductions > 0 && closeDeductionsData.length > 0 && ' | '}
                      {closeDeductionsData.length > 0 && `Outros: ${closeDeductionsData.length} registros`}
                    </p>
                  </div>
                </div>
                <div className="pt-3 border-t border-border">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Valor Líquido a Pagar</span>
                    <span className={`font-bold text-xl ${(closeCommissionsData.reduce((acc: number, c: any) => acc + (c.netAmount || parseFloat(c.amount || 0)), 0) - Math.abs(closeDeductionsData.reduce((acc: number, c: any) => acc + parseFloat(c.amount || 0), 0)) - closePurchaseDeductions) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      R$ {(closeCommissionsData.reduce((acc: number, c: any) => acc + (c.netAmount || parseFloat(c.amount || 0)), 0) - Math.abs(closeDeductionsData.reduce((acc: number, c: any) => acc + parseFloat(c.amount || 0), 0)) - closePurchaseDeductions).toFixed(2)}
                    </span>
                  </div>
                </div>
                {closeCommissionsData.length === 0 && (
                  <div className="flex items-center gap-2 text-yellow-500 text-sm">
                    <AlertCircle className="h-4 w-4" />
                    <span>Não há comissões pendentes neste período</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCloseModalOpen(false); resetCloseModalData(); }}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCloseCommissions}
              disabled={!closeDataLoaded || closeCommissionsData.length === 0 || closeCommissionsMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-confirm-close"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
