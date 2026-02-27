import { useState } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  DollarSign,
  Plus,
  Minus,
  Lock,
  Unlock,
  Banknote,
  CreditCard,
  QrCode,
  ArrowUpCircle,
  ArrowDownCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  History,
  Calendar,
  ChevronDown,
  ChevronUp,
  User,
  Scissors,
  Package,
  ShoppingBag,
  FileText,
  Wallet,
  Receipt,
  PiggyBank,
  Trash2,
  Edit,
  Building,
  Zap,
  Droplet,
  Wifi,
  CircleDollarSign,
  AlertCircle,
  AlertTriangle,
  ChevronRight
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  useCurrentCashRegister, 
  useOpenCashRegister, 
  useCloseCashRegister, 
  useCashTransactions, 
  useCreateCashTransaction, 
  useComandas, 
  useCashRegisterHistory,
  useOpenComandasCheck,
  useFixedExpenses,
  useCreateFixedExpense,
  useUpdateFixedExpense,
  useDeleteFixedExpense,
  useDREReport,
  useRefundComanda
} from "@/lib/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const EXPENSE_CATEGORIES = [
  { value: "aluguel", label: "Aluguel", icon: Building },
  { value: "agua", label: "Água", icon: Droplet },
  { value: "luz", label: "Luz/Energia", icon: Zap },
  { value: "internet", label: "Internet", icon: Wifi },
  { value: "salarios", label: "Salários", icon: CircleDollarSign },
  { value: "outros", label: "Outros", icon: Receipt },
];

function HistoryTransactions({ registerId }: { registerId: string }) {
  const { data: histTransactions = [], isLoading } = useCashTransactions(registerId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
      </div>
    );
  }

  const withdrawals = histTransactions.filter((t: any) => t.type === 'withdrawal');
  const depositsT = histTransactions.filter((t: any) => t.type === 'deposit');
  const refundsT = histTransactions.filter((t: any) => t.type === 'refund');

  const totalWithdrawals = withdrawals.reduce((acc: number, t: any) => acc + parseFloat(t.amount), 0);
  const totalDeposits = depositsT.reduce((acc: number, t: any) => acc + parseFloat(t.amount), 0);
  const totalRefunds = refundsT.reduce((acc: number, t: any) => acc + parseFloat(t.amount), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Receipt className="h-4 w-4" />
        Movimentações ({histTransactions.length})
      </div>

      {histTransactions.length > 0 && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="p-2 rounded bg-red-500/10 text-center">
            <p className="text-muted-foreground">Sangrias</p>
            <p className="font-bold text-red-500">R$ {totalWithdrawals.toFixed(2)}</p>
            <p className="text-muted-foreground">{withdrawals.length}x</p>
          </div>
          <div className="p-2 rounded bg-green-500/10 text-center">
            <p className="text-muted-foreground">Reforços</p>
            <p className="font-bold text-green-500">R$ {totalDeposits.toFixed(2)}</p>
            <p className="text-muted-foreground">{depositsT.length}x</p>
          </div>
          <div className="p-2 rounded bg-orange-500/10 text-center">
            <p className="text-muted-foreground">Estornos</p>
            <p className="font-bold text-orange-500">R$ {Math.abs(totalRefunds).toFixed(2)}</p>
            <p className="text-muted-foreground">{refundsT.length}x</p>
          </div>
        </div>
      )}

      {histTransactions.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">Nenhuma movimentação neste caixa</p>
      ) : (
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {histTransactions.map((t: any) => (
            <div 
              key={t.id} 
              className={`flex items-center justify-between p-2 rounded text-xs ${
                t.type === 'withdrawal' 
                  ? 'bg-red-500/5 border border-red-500/10' 
                  : t.type === 'deposit'
                  ? 'bg-green-500/5 border border-green-500/10'
                  : 'bg-orange-500/5 border border-orange-500/10'
              }`}
            >
              <div className="flex items-center gap-2">
                {t.type === 'withdrawal' ? (
                  <ArrowDownCircle className="h-3.5 w-3.5 text-red-500" />
                ) : t.type === 'deposit' ? (
                  <ArrowUpCircle className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <History className="h-3.5 w-3.5 text-orange-500" />
                )}
                <div>
                  <span className="font-medium">
                    {t.type === 'withdrawal' ? 'Sangria' : t.type === 'deposit' ? 'Reforço' : 'Estorno'}
                  </span>
                  {t.description && <span className="text-muted-foreground ml-1">- {t.description}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  {format(new Date(t.createdAt), "HH:mm", { locale: ptBR })}
                </span>
                <span className={`font-bold ${
                  t.type === 'withdrawal' ? 'text-red-500' : t.type === 'deposit' ? 'text-green-500' : 'text-orange-500'
                }`}>
                  {parseFloat(t.amount) < 0 ? '' : t.type === 'withdrawal' ? '-' : '+'}R$ {Math.abs(parseFloat(t.amount)).toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Finance() {
  const [activeTab, setActiveTab] = useState("caixa");
  const [isOpenDialogOpen, setIsOpenDialogOpen] = useState(false);
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
  const [isExpenseDialogOpen, setIsExpenseDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any>(null);
  const [transactionType, setTransactionType] = useState<'withdrawal' | 'deposit' | 'refund'>('withdrawal');
  const [openAmount, setOpenAmount] = useState("");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionDescription, setTransactionDescription] = useState("");
  const [historyDateFilter, setHistoryDateFilter] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [expandedRegisterId, setExpandedRegisterId] = useState<string | null>(null);
  
  const [dreFilter, setDreFilter] = useState<'today' | 'month' | 'custom'>('today');
  const [dreStartDate, setDreStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dreEndDate, setDreEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  
  const handleDreFilterChange = (filter: 'today' | 'month' | 'custom') => {
    setDreFilter(filter);
    const today = new Date();
    if (filter === 'today') {
      setDreStartDate(format(today, 'yyyy-MM-dd'));
      setDreEndDate(format(today, 'yyyy-MM-dd'));
    } else if (filter === 'month') {
      setDreStartDate(format(startOfMonth(today), 'yyyy-MM-dd'));
      setDreEndDate(format(endOfMonth(today), 'yyyy-MM-dd'));
    }
  };
  
  const [expenseName, setExpenseName] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("outros");
  const [expenseRecurrence, setExpenseRecurrence] = useState("monthly");
  const [expenseDueDay, setExpenseDueDay] = useState("");
  
  const { toast } = useToast();

  const { data: cashRegister, isLoading } = useCurrentCashRegister();
  const { data: transactions = [] } = useCashTransactions(cashRegister?.id?.toString() || "");
  const { data: comandas = [] } = useComandas("closed");
  const { data: cashRegisterHistory = [] } = useCashRegisterHistory();
  const { data: openComandasCheck } = useOpenComandasCheck();
  const { data: fixedExpenses = [] } = useFixedExpenses();
  const { data: dreData } = useDREReport(dreStartDate, dreEndDate);

  const hasOpenComandas = openComandasCheck?.hasOpenComandas || false;
  const openComandasList = openComandasCheck?.openComandas || [];

  const isOpenFromPreviousDay = (() => {
    if (!cashRegister) return false;
    const openedDate = new Date(cashRegister.openedAt);
    const today = new Date();
    return openedDate.toDateString() !== today.toDateString();
  })();

  const openMutation = useOpenCashRegister();
  const closeMutation = useCloseCashRegister();
  const transactionMutation = useCreateCashTransaction();
  const createExpenseMutation = useCreateFixedExpense();
  const updateExpenseMutation = useUpdateFixedExpense();
  const deleteExpenseMutation = useDeleteFixedExpense();
  const refundMutation = useRefundComanda();
  const [refundComandaId, setRefundComandaId] = useState<string | null>(null);
  const [showRefundDialog, setShowRefundDialog] = useState(false);

  const sessionComandas = comandas.filter((c: any) => {
    if (!cashRegister) return false;
    const comandaDate = new Date(c.createdAt);
    const registerOpenDate = new Date(cashRegister.openedAt);
    return comandaDate >= registerOpenDate;
  });

  const calculateSalesByMethod = () => {
    let cash = 0, pix = 0, card = 0;
    
    sessionComandas.forEach((c: any) => {
      const total = parseFloat(c.total || 0);
      
      if (c.paymentMethod === 'split' && c.paymentDetails?.split) {
        c.paymentDetails.split.forEach((p: any) => {
          if (p.method === 'cash') cash += p.amount;
          else if (p.method === 'pix') pix += p.amount;
          else if (p.method === 'card') card += p.amount;
        });
      } else if (c.paymentMethod === 'cash') {
        cash += total;
      } else if (c.paymentMethod === 'pix') {
        pix += total;
      } else if (c.paymentMethod === 'card') {
        card += total;
      }
    });
    
    return { cash, pix, card };
  };

  const salesByMethod = calculateSalesByMethod();
  const totalSales = salesByMethod.cash + salesByMethod.pix + salesByMethod.card;

  // Sangrias manuais (saídas do caixa físico)
  const withdrawals = transactions.filter((t: any) => t.type === 'withdrawal').reduce((acc: number, t: any) => acc + parseFloat(t.amount), 0);
  // Suprimentos/Reforços (entradas no caixa físico)
  const deposits = transactions.filter((t: any) => t.type === 'deposit').reduce((acc: number, t: any) => acc + parseFloat(t.amount), 0);
  // Estornos (correções - armazenados como valores NEGATIVOS para auditoria)
  const refunds = transactions.filter((t: any) => t.type === 'refund').reduce((acc: number, t: any) => acc + parseFloat(t.amount), 0);

  // Saldo Esperado = Abertura + Vendas em Dinheiro + Suprimentos - Sangrias + Estornos
  // NOTA: Taxas de cartão/PIX NÃO afetam o caixa físico - são invisíveis para o operador
  // Vendas em cartão/PIX vão direto para a conta bancária, não para o caixa
  // Estornos são armazenados como valores NEGATIVOS para manter rastro de auditoria
  const expectedCashBalance = cashRegister 
    ? parseFloat(cashRegister.openingAmount || 0) + salesByMethod.cash - withdrawals + deposits + refunds
    : 0;

  const handleOpenCashRegister = async () => {
    try {
      await openMutation.mutateAsync({ openingAmount: openAmount || "0" });
      toast({ title: "Caixa aberto com sucesso!" });
      setIsOpenDialogOpen(false);
      setOpenAmount("");
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleCloseCashRegister = async (force: boolean = false) => {
    if (!cashRegister) return;
    
    try {
      await closeMutation.mutateAsync({
        id: cashRegister.id,
        closingAmount: expectedCashBalance.toFixed(2),
        expectedAmount: expectedCashBalance.toFixed(2),
        difference: "0.00",
        status: 'closed',
        closedAt: new Date().toISOString(),
        forceClose: force
      });
      toast({ title: "Caixa fechado com sucesso!" });
      setIsCloseDialogOpen(false);
    } catch (error: any) {
      const errorMsg = error.message || "Erro ao fechar o caixa";
      toast({ title: "Erro", description: errorMsg, variant: "destructive" });
    }
  };

  const handleAddTransaction = async () => {
    if (!cashRegister) return;
    
    try {
      await transactionMutation.mutateAsync({
        cashRegisterId: cashRegister.id,
        type: transactionType,
        amount: transactionAmount || "0",
        description: transactionDescription
      });
      const toastMessages: Record<string, string> = {
        'withdrawal': "Sangria registrada!",
        'deposit': "Reforço registrado!",
        'refund': "Estorno registrado!"
      };
      toast({ title: toastMessages[transactionType] });
      setIsTransactionDialogOpen(false);
      setTransactionAmount("");
      setTransactionDescription("");
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleSaveExpense = async () => {
    try {
      const data = {
        name: expenseName,
        amount: expenseAmount,
        category: expenseCategory,
        recurrence: expenseRecurrence,
        dueDay: expenseDueDay ? parseInt(expenseDueDay) : null,
        active: true
      };
      
      if (editingExpense) {
        await updateExpenseMutation.mutateAsync({ id: editingExpense.id, ...data });
        toast({ title: "Despesa atualizada!" });
      } else {
        await createExpenseMutation.mutateAsync(data);
        toast({ title: "Despesa cadastrada!" });
      }
      
      resetExpenseForm();
      setIsExpenseDialogOpen(false);
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteExpense = async (id: string) => {
    try {
      await deleteExpenseMutation.mutateAsync(id);
      toast({ title: "Despesa removida!" });
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const resetExpenseForm = () => {
    setExpenseName("");
    setExpenseAmount("");
    setExpenseCategory("outros");
    setExpenseRecurrence("monthly");
    setExpenseDueDay("");
    setEditingExpense(null);
  };

  const openEditExpense = (expense: any) => {
    setEditingExpense(expense);
    setExpenseName(expense.name);
    setExpenseAmount(expense.amount);
    setExpenseCategory(expense.category);
    setExpenseRecurrence(expense.recurrence);
    setExpenseDueDay(expense.dueDay?.toString() || "");
    setIsExpenseDialogOpen(true);
  };

  const openWithdrawalDialog = () => {
    setTransactionType('withdrawal');
    setIsTransactionDialogOpen(true);
  };

  const openDepositDialog = () => {
    setTransactionType('deposit');
    setIsTransactionDialogOpen(true);
  };

  const openRefundDialog = () => {
    setTransactionType('refund');
    setIsTransactionDialogOpen(true);
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

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Financeiro</h1>
            <p className="text-muted-foreground">Controle de caixa, relatórios e despesas.</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="caixa" className="flex items-center gap-2" data-testid="tab-caixa">
              <Wallet className="h-4 w-4" />
              <span className="hidden sm:inline">Caixa</span>
            </TabsTrigger>
            <TabsTrigger value="dre" className="flex items-center gap-2" data-testid="tab-dre">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Relatório DRE</span>
            </TabsTrigger>
            <TabsTrigger value="despesas" className="flex items-center gap-2" data-testid="tab-despesas">
              <PiggyBank className="h-4 w-4" />
              <span className="hidden sm:inline">Despesas Fixas</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB: CAIXA */}
          <TabsContent value="caixa" className="space-y-6">
            {cashRegister && isOpenFromPreviousDay && (
              <Alert variant="destructive" className="border-destructive/50 bg-destructive/10 animate-pulse" data-testid="alert-previous-day">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>CAIXA VENCIDO (Aberto desde {format(new Date(cashRegister.openedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })})</AlertTitle>
                <AlertDescription>
                  Este caixa foi aberto em um dia anterior. Por segurança, o sistema bloqueou novas vendas. 
                  Você deve **fechar este caixa** e abrir um novo para hoje para continuar operando.
                </AlertDescription>
              </Alert>
            )}

            {cashRegister && hasOpenComandas && (
              <Alert variant="destructive" data-testid="alert-open-comandas">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{openComandasList.length} comanda(s) aberta(s)</AlertTitle>
                <AlertDescription>
                  Existem comandas não finalizadas. O caixa não poderá ser fechado até que todas sejam finalizadas ou canceladas.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end">
              {!cashRegister ? (
                <Button 
                  onClick={() => setIsOpenDialogOpen(true)}
                  className="bg-primary text-primary-foreground"
                  data-testid="button-open-register"
                >
                  <Unlock className="mr-2 h-4 w-4" /> Abrir Caixa
                </Button>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" onClick={openWithdrawalDialog} data-testid="button-withdrawal">
                    <ArrowDownCircle className="mr-2 h-4 w-4 text-red-500" /> Sangria
                  </Button>
                  <Button variant="outline" onClick={openDepositDialog} data-testid="button-deposit">
                    <ArrowUpCircle className="mr-2 h-4 w-4 text-green-500" /> Reforço
                  </Button>
                  <Button variant="outline" onClick={openRefundDialog} data-testid="button-refund">
                    <History className="mr-2 h-4 w-4 text-orange-500" /> Estorno
                  </Button>
                  <Button 
                    variant="destructive" 
                    onClick={() => setIsCloseDialogOpen(true)}
                    data-testid="button-close-register"
                  >
                    <Lock className="mr-2 h-4 w-4" /> Fechar Caixa
                    {hasOpenComandas && (
                      <Badge variant="destructive" className="ml-2 text-xs">{openComandasList.length}</Badge>
                    )}
                  </Button>
                </div>
              )}
            </div>

            {!cashRegister ? (
              <Card className="border-border/50 bg-card/50 p-12 text-center">
                <div className="flex flex-col items-center gap-4 text-muted-foreground">
                  <Lock className="h-16 w-16 opacity-50" />
                  <h2 className="text-xl font-semibold">Caixa Fechado</h2>
                  <p>Abra o caixa para iniciar as operações do dia.</p>
                </div>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card className="border-primary/20 bg-gradient-to-br from-primary/10 to-transparent">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Unlock className="h-4 w-4 text-primary" />
                        Abertura
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-foreground" data-testid="text-opening-balance">
                        R$ {parseFloat(cashRegister.openingAmount || 0).toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(cashRegister.openedAt), "dd/MM HH:mm", { locale: ptBR })}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border-green-500/20 bg-gradient-to-br from-green-500/10 to-transparent">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-500" />
                        Vendas do Dia
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-green-500" data-testid="text-total-sales">
                        R$ {totalSales.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {sessionComandas.length} comandas fechadas
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border-red-500/20 bg-gradient-to-br from-red-500/10 to-transparent">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <ArrowDownCircle className="h-4 w-4 text-red-500" />
                        Sangrias
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-red-500" data-testid="text-withdrawals">
                        R$ {withdrawals.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {transactions.filter((t: any) => t.type === 'withdrawal').length} operações
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-transparent">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-blue-500" />
                        Saldo Esperado
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-blue-500" data-testid="text-expected-balance">
                        R$ {expectedCashBalance.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Apenas dinheiro
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card className="border-border/50 bg-card/50">
                    <CardHeader>
                      <CardTitle className="text-lg">Vendas por Forma de Pagamento</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-green-500/10 rounded-lg border border-green-500/20">
                        <div className="flex items-center gap-3">
                          <Banknote className="h-6 w-6 text-green-500" />
                          <span className="font-medium">Dinheiro</span>
                        </div>
                        <span className="text-xl font-bold text-green-500" data-testid="text-cash-sales">
                          R$ {salesByMethod.cash.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
                        <div className="flex items-center gap-3">
                          <QrCode className="h-6 w-6 text-blue-500" />
                          <span className="font-medium">Pix</span>
                        </div>
                        <span className="text-xl font-bold text-blue-500" data-testid="text-pix-sales">
                          R$ {salesByMethod.pix.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-purple-500/10 rounded-lg border border-purple-500/20">
                        <div className="flex items-center gap-3">
                          <CreditCard className="h-6 w-6 text-purple-500" />
                          <span className="font-medium">Cartão</span>
                        </div>
                        <span className="text-xl font-bold text-purple-500" data-testid="text-card-sales">
                          R$ {salesByMethod.card.toFixed(2)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-border/50 bg-card/50">
                    <CardHeader>
                      <CardTitle className="text-lg">Movimentações do Caixa</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-64">
                        {transactions.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                            <Clock className="h-12 w-12 opacity-50 mb-2" />
                            <p>Nenhuma movimentação registrada</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {transactions.map((t: any) => (
                              <div 
                                key={t.id} 
                                className={`flex items-center justify-between p-3 rounded-lg border ${
                                  t.type === 'withdrawal' 
                                    ? 'bg-red-500/5 border-red-500/20' 
                                    : t.type === 'deposit'
                                    ? 'bg-green-500/5 border-green-500/20'
                                    : 'bg-orange-500/5 border-orange-500/20'
                                }`}
                                data-testid={`transaction-${t.id}`}
                              >
                                <div className="flex items-center gap-3">
                                  {t.type === 'withdrawal' ? (
                                    <ArrowDownCircle className="h-5 w-5 text-red-500" />
                                  ) : t.type === 'deposit' ? (
                                    <ArrowUpCircle className="h-5 w-5 text-green-500" />
                                  ) : (
                                    <History className="h-5 w-5 text-orange-500" />
                                  )}
                                  <div>
                                    <p className="font-medium text-sm">
                                      {t.type === 'withdrawal' ? 'Sangria' : t.type === 'deposit' ? 'Reforço' : 'Estorno'}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {t.description || 'Sem descrição'}
                                    </p>
                                  </div>
                                </div>
                                <span className={`font-bold ${
                                  t.type === 'withdrawal' ? 'text-red-500' : t.type === 'deposit' ? 'text-green-500' : 'text-orange-500'
                                }`}>
                                  {parseFloat(t.amount) < 0 ? '' : t.type === 'withdrawal' ? '-' : '+'}R$ {Math.abs(parseFloat(t.amount)).toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>
                {sessionComandas.length > 0 && (
                  <Card className="border-border/50 bg-card/50">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Receipt className="h-5 w-5 text-primary" />
                        Comandas da Sessão ({sessionComandas.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-64">
                        <div className="space-y-2">
                          {sessionComandas.map((c: any) => (
                            <div
                              key={c.id}
                              className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-background/50"
                              data-testid={`comanda-session-${c.id}`}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {c.clientName || 'Cliente não identificado'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(c.createdAt), "HH:mm", { locale: ptBR })} • {c.paymentMethod === 'cash' ? 'Dinheiro' : c.paymentMethod === 'pix' ? 'PIX' : c.paymentMethod === 'card' ? 'Cartão' : c.paymentMethod === 'split' ? 'Dividido' : c.paymentMethod}
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-bold text-green-500">
                                  R$ {parseFloat(c.total || 0).toFixed(2)}
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-red-500 border-red-500/30 hover:bg-red-500/10 hover:text-red-600 text-xs h-7 px-2"
                                  data-testid={`button-refund-comanda-${c.id}`}
                                  onClick={() => {
                                    setRefundComandaId(c.id);
                                    setShowRefundDialog(true);
                                  }}
                                >
                                  Estornar
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            <Dialog open={showRefundDialog} onOpenChange={setShowRefundDialog}>
              <DialogContent data-testid="dialog-refund-confirm">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-red-500">
                    <AlertTriangle className="h-5 w-5" />
                    Confirmar Estorno
                  </DialogTitle>
                  <DialogDescription>
                    Esta ação irá reverter completamente a comanda, incluindo:
                    comissões, estoque, pacotes e transações do caixa.
                    Esta ação não pode ser desfeita.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2">
                  <Button
                    variant="outline"
                    data-testid="button-cancel-refund"
                    onClick={() => {
                      setShowRefundDialog(false);
                      setRefundComandaId(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="destructive"
                    data-testid="button-confirm-refund"
                    disabled={refundMutation.isPending}
                    onClick={() => {
                      if (refundComandaId) {
                        refundMutation.mutate(refundComandaId, {
                          onSuccess: () => {
                            toast({
                              title: "Estorno realizado",
                              description: "A comanda foi estornada com sucesso.",
                            });
                            setShowRefundDialog(false);
                            setRefundComandaId(null);
                          },
                          onError: (error: any) => {
                            toast({
                              title: "Erro ao estornar",
                              description: error.message || "Não foi possível estornar a comanda.",
                              variant: "destructive",
                            });
                          },
                        });
                      }
                    }}
                  >
                    {refundMutation.isPending ? "Estornando..." : "Confirmar Estorno"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Card className="border-border/50 bg-card/50" data-testid="card-cash-register-history">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <History className="h-5 w-5 text-primary" />
                    Histórico de Caixas
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={historyDateFilter}
                      onChange={(e) => setHistoryDateFilter(e.target.value)}
                      className="w-40 h-8 text-sm"
                      data-testid="input-history-date"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {(() => {
                      const filterDate = new Date(historyDateFilter + 'T00:00:00');
                      const filteredHistory = cashRegisterHistory.filter((register: any) => {
                        const registerDate = new Date(register.openedAt);
                        return registerDate.toDateString() === filterDate.toDateString();
                      });
                      
                      if (filteredHistory.length === 0) {
                        return (
                          <div className="text-center py-8 text-muted-foreground">
                            <History className="h-12 w-12 mx-auto mb-2 opacity-30" />
                            <p>Nenhum caixa encontrado nesta data</p>
                          </div>
                        );
                      }
                      
                      return filteredHistory.map((register: any) => {
                        const openingAmount = parseFloat(register.openingAmount || 0);
                        const closingAmount = parseFloat(register.closingAmount || 0);
                        const expectedAmount = parseFloat(register.expectedAmount || 0);
                        const difference = parseFloat(register.difference || 0);
                        const isExpanded = expandedRegisterId === register.id;
                        
                        return (
                          <div 
                            key={register.id} 
                            className="rounded-lg border border-border/50 bg-background/50 overflow-hidden"
                            data-testid={`history-register-${register.id}`}
                          >
                            <div 
                              className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                              onClick={() => setExpandedRegisterId(isExpanded ? null : register.id)}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-1 text-muted-foreground">
                                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2 text-sm font-medium">
                                      <Clock className="h-3.5 w-3.5 text-primary" />
                                      {format(new Date(register.openedAt), "HH:mm", { locale: ptBR })}
                                      <span className="text-muted-foreground">→</span>
                                      {register.closedAt ? format(new Date(register.closedAt), "HH:mm", { locale: ptBR }) : "—"}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {format(new Date(register.openedAt), "dd 'de' MMMM", { locale: ptBR })}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-bold text-foreground">
                                    R$ {closingAmount.toFixed(2)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">Fechamento</p>
                                </div>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="border-t border-border/50 p-4 space-y-4 bg-muted/10">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                                    <p className="text-xs text-muted-foreground">Abertura</p>
                                    <p className="text-lg font-bold text-foreground">R$ {openingAmount.toFixed(2)}</p>
                                    <p className="text-xs text-muted-foreground">{format(new Date(register.openedAt), "HH:mm", { locale: ptBR })}</p>
                                  </div>
                                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                                    <p className="text-xs text-muted-foreground">Fechamento</p>
                                    <p className="text-lg font-bold text-green-500">R$ {closingAmount.toFixed(2)}</p>
                                    <p className="text-xs text-muted-foreground">{register.closedAt ? format(new Date(register.closedAt), "HH:mm", { locale: ptBR }) : "—"}</p>
                                  </div>
                                  <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                                    <p className="text-xs text-muted-foreground">Saldo Esperado</p>
                                    <p className="text-lg font-bold text-blue-500">R$ {expectedAmount.toFixed(2)}</p>
                                  </div>
                                  <div className={`p-3 rounded-lg border ${difference >= 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                                    <p className="text-xs text-muted-foreground">Diferença</p>
                                    <p className={`text-lg font-bold ${difference >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                      {difference >= 0 ? '+' : ''}R$ {difference.toFixed(2)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {difference === 0 ? 'Sem diferença' : difference > 0 ? 'Sobra' : 'Falta'}
                                    </p>
                                  </div>
                                </div>

                                <HistoryTransactions registerId={register.id} />
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB: DRE */}
          <TabsContent value="dre" className="space-y-6">
            {/* Filtros Rápidos */}
            <Card className="border-border/50 bg-card/50">
              <CardContent className="pt-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Button
                      variant={dreFilter === 'today' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleDreFilterChange('today')}
                      data-testid="button-filter-today"
                    >
                      <Calendar className="h-4 w-4 mr-1" />
                      Hoje
                    </Button>
                    <Button
                      variant={dreFilter === 'month' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleDreFilterChange('month')}
                      data-testid="button-filter-month"
                    >
                      <Calendar className="h-4 w-4 mr-1" />
                      Este Mês
                    </Button>
                    <Button
                      variant={dreFilter === 'custom' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setDreFilter('custom')}
                      data-testid="button-filter-custom"
                    >
                      <Calendar className="h-4 w-4 mr-1" />
                      Personalizado
                    </Button>
                  </div>
                  {dreFilter === 'custom' && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="date"
                        value={dreStartDate}
                        onChange={(e) => setDreStartDate(e.target.value)}
                        className="w-36 h-8 text-sm"
                        data-testid="input-dre-start"
                      />
                      <span className="text-muted-foreground">até</span>
                      <Input
                        type="date"
                        value={dreEndDate}
                        onChange={(e) => setDreEndDate(e.target.value)}
                        className="w-36 h-8 text-sm"
                        data-testid="input-dre-end"
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {dreData?.summary ? (
              <>
                {/* RESUMO FINANCEIRO - Os 4 números principais */}
                <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-primary" />
                      Resumo Financeiro
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                        <p className="text-xs text-muted-foreground">(+) Faturamento Bruto</p>
                        <p className="text-2xl font-bold text-green-500" data-testid="text-gross-total">
                          R$ {(dreData.summary.grossTotal || 0).toFixed(2)}
                        </p>
                      </div>
                      <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
                        <p className="text-xs text-muted-foreground">(-) Taxas Administrativas</p>
                        <p className="text-2xl font-bold text-orange-500" data-testid="text-total-fees">
                          R$ {(dreData.summary.totalFees || 0).toFixed(2)}
                        </p>
                      </div>
                      <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                        <p className="text-xs text-muted-foreground">(-) Total Comissões</p>
                        <p className="text-2xl font-bold text-purple-500" data-testid="text-total-commissions">
                          R$ {(dreData.summary.totalCommissions || 0).toFixed(2)}
                        </p>
                      </div>
                      <div className={`p-4 rounded-lg border ${(dreData.summary.netRealBalance || 0) >= 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                        <p className="text-xs text-muted-foreground">(=) Saldo Líquido Real</p>
                        <p className={`text-2xl font-bold ${(dreData.summary.netRealBalance || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`} data-testid="text-net-real-balance">
                          R$ {(dreData.summary.netRealBalance || 0).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* PAINEL DE BARBEIROS */}
                <Card className="border-border/50 bg-card/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <User className="h-5 w-5 text-primary" />
                      Painel de Barbeiros (Comissões)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {dreData.barberPanel && dreData.barberPanel.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-3 px-2 font-medium text-muted-foreground">Barbeiro</th>
                              <th className="text-right py-3 px-2 font-medium text-muted-foreground">Total Produzido</th>
                              <th className="text-right py-3 px-2 font-medium text-muted-foreground">Qtd Serviços</th>
                              <th className="text-right py-3 px-2 font-medium text-muted-foreground">Comissão a Pagar</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dreData.barberPanel.map((barber: any, idx: number) => (
                              <tr key={idx} className="border-b border-border/50 hover:bg-muted/30" data-testid={`barber-row-${idx}`}>
                                <td className="py-3 px-2 font-medium">{barber.name}</td>
                                <td className="py-3 px-2 text-right text-green-500">R$ {barber.totalProduced.toFixed(2)}</td>
                                <td className="py-3 px-2 text-right">{barber.serviceCount}</td>
                                <td className="py-3 px-2 text-right text-primary font-medium">R$ {barber.commission.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-6 text-muted-foreground">
                        <User className="h-10 w-10 mx-auto mb-2 opacity-50" />
                        <p>Nenhum dado de barbeiros no período</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* PAINEL DE PRODUTOS */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Vendas de Produtos */}
                  <Card className="border-border/50 bg-card/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <ShoppingBag className="h-5 w-5 text-green-500" />
                        Produtos Vendidos
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {dreData.productSalesPanel && dreData.productSalesPanel.length > 0 ? (
                        <ScrollArea className="h-48">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border">
                                <th className="text-left py-2 px-1 font-medium text-muted-foreground text-xs">Produto</th>
                                <th className="text-right py-2 px-1 font-medium text-muted-foreground text-xs">Qtd</th>
                                <th className="text-right py-2 px-1 font-medium text-muted-foreground text-xs">Valor</th>
                                <th className="text-right py-2 px-1 font-medium text-muted-foreground text-xs">Comissão</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dreData.productSalesPanel.map((product: any, idx: number) => (
                                <tr key={idx} className="border-b border-border/50" data-testid={`product-sale-row-${idx}`}>
                                  <td className="py-2 px-1">{product.name}</td>
                                  <td className="py-2 px-1 text-right">{product.qtySold}</td>
                                  <td className="py-2 px-1 text-right text-green-500">R$ {product.totalSold.toFixed(2)}</td>
                                  <td className="py-2 px-1 text-right text-purple-500">R$ {product.commission.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </ScrollArea>
                      ) : (
                        <div className="text-center py-6 text-muted-foreground">
                          <ShoppingBag className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">Nenhum produto vendido no período</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Estoque */}
                  <Card className="border-border/50 bg-card/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Package className="h-5 w-5 text-blue-500" />
                        Estoque Atual
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {dreData.stockPanel && dreData.stockPanel.length > 0 ? (
                        <ScrollArea className="h-48">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border">
                                <th className="text-left py-2 px-1 font-medium text-muted-foreground text-xs">Produto</th>
                                <th className="text-right py-2 px-1 font-medium text-muted-foreground text-xs">Qtd</th>
                                <th className="text-right py-2 px-1 font-medium text-muted-foreground text-xs">Saldo (R$)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dreData.stockPanel.map((product: any, idx: number) => (
                                <tr key={idx} className="border-b border-border/50" data-testid={`stock-row-${idx}`}>
                                  <td className="py-2 px-1">{product.name}</td>
                                  <td className="py-2 px-1 text-right">{product.stock}</td>
                                  <td className="py-2 px-1 text-right text-blue-500">R$ {product.stockValue.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t border-border bg-muted/30">
                                <td className="py-2 px-1 font-medium">Total em Estoque</td>
                                <td className="py-2 px-1 text-right font-medium">{dreData.stockPanel.reduce((sum: number, p: any) => sum + p.stock, 0)}</td>
                                <td className="py-2 px-1 text-right font-bold text-blue-500">R$ {dreData.stockPanel.reduce((sum: number, p: any) => sum + p.stockValue, 0).toFixed(2)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </ScrollArea>
                      ) : (
                        <div className="text-center py-6 text-muted-foreground">
                          <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">Nenhum produto em estoque</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Separator />

                {/* Receita por Forma de Pagamento */}
                <Card className="border-border/50 bg-card/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      Receita por Forma de Pagamento
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-lg border border-border/50 bg-background/50">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Banknote className="h-5 w-5 text-green-500" />
                              <span className="font-medium">Dinheiro</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div>
                              <p className="text-muted-foreground">Bruto</p>
                              <p className="font-medium">R$ {(dreData.byPaymentMethod?.cash?.gross || 0).toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Taxas</p>
                              <p className="font-medium text-orange-500">R$ {(dreData.byPaymentMethod?.cash?.fees || 0).toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Líquido</p>
                              <p className="font-medium text-green-500">R$ {(dreData.byPaymentMethod?.cash?.net || 0).toFixed(2)}</p>
                            </div>
                          </div>
                        </div>

                        <div className="p-4 rounded-lg border border-border/50 bg-background/50">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <QrCode className="h-5 w-5 text-blue-500" />
                              <span className="font-medium">PIX</span>
                            </div>
                            <span className="text-xs text-muted-foreground">Taxa: {dreData.feeRates?.pix || 0}%</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div>
                              <p className="text-muted-foreground">Bruto</p>
                              <p className="font-medium">R$ {(dreData.byPaymentMethod?.pix?.gross || 0).toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Taxas</p>
                              <p className="font-medium text-orange-500">R$ {(dreData.byPaymentMethod?.pix?.fees || 0).toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Líquido</p>
                              <p className="font-medium text-green-500">R$ {(dreData.byPaymentMethod?.pix?.net || 0).toFixed(2)}</p>
                            </div>
                          </div>
                        </div>

                        <div className="p-4 rounded-lg border border-border/50 bg-background/50">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <CreditCard className="h-5 w-5 text-purple-500" />
                              <span className="font-medium">Crédito</span>
                            </div>
                            <span className="text-xs text-muted-foreground">Taxa: {dreData.feeRates?.credit || 0}%</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div>
                              <p className="text-muted-foreground">Bruto</p>
                              <p className="font-medium">R$ {(dreData.byPaymentMethod?.credit?.gross || 0).toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Taxas</p>
                              <p className="font-medium text-orange-500">R$ {(dreData.byPaymentMethod?.credit?.fees || 0).toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Líquido</p>
                              <p className="font-medium text-green-500">R$ {(dreData.byPaymentMethod?.credit?.net || 0).toFixed(2)}</p>
                            </div>
                          </div>
                        </div>

                        <div className="p-4 rounded-lg border border-border/50 bg-background/50">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <CreditCard className="h-5 w-5 text-teal-500" />
                              <span className="font-medium">Débito</span>
                            </div>
                            <span className="text-xs text-muted-foreground">Taxa: {dreData.feeRates?.debit || 0}%</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div>
                              <p className="text-muted-foreground">Bruto</p>
                              <p className="font-medium">R$ {(dreData.byPaymentMethod?.debit?.gross || 0).toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Taxas</p>
                              <p className="font-medium text-orange-500">R$ {(dreData.byPaymentMethod?.debit?.fees || 0).toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Líquido</p>
                              <p className="font-medium text-green-500">R$ {(dreData.byPaymentMethod?.debit?.net || 0).toFixed(2)}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                  </CardContent>
                </Card>

                <Separator />

                {/* Transações */}
                <Card className="border-border/50 bg-card/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Receipt className="h-5 w-5" />
                      Transações ({dreData.transactionCount || 0} vendas)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-2">
                        {(dreData.transactions || []).map((t: any) => (
                          <div 
                            key={t.id} 
                            className="p-3 rounded-lg border border-border/50 bg-background/50"
                            data-testid={`dre-transaction-${t.id}`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 text-sm">
                                  <Clock className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-muted-foreground">
                                    {format(new Date(t.date), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                  </span>
                                </div>
                                <div className="flex items-center gap-4 mt-1 flex-wrap">
                                  <div className="flex items-center gap-1 text-sm">
                                    <User className="h-3 w-3" />
                                    <span>{t.clientName}</span>
                                  </div>
                                  {t.barberName && (
                                    <div className="flex items-center gap-1 text-sm text-primary">
                                      <Scissors className="h-3 w-3" />
                                      <span>{t.barberName}</span>
                                    </div>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">{t.items}</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div className="flex items-center gap-2 justify-end mb-1">
                                  <span className="text-xs px-2 py-0.5 rounded bg-muted">{t.paymentMethod}</span>
                                </div>
                                <div className="grid grid-cols-4 gap-2 text-xs">
                                  <div>
                                    <p className="text-muted-foreground">Bruto</p>
                                    <p className="font-medium">R$ {t.amount.toFixed(2)}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Taxa</p>
                                    <p className="font-medium text-orange-500">R$ {t.fee.toFixed(2)}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Comissão</p>
                                    <p className="font-medium text-blue-400">R$ {(t.commission || 0).toFixed(2)}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Líquido</p>
                                    <p className="font-medium text-green-500">R$ {t.net.toFixed(2)}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Consumos Internos dos Profissionais */}
                {dreData.internalConsumptions && dreData.internalConsumptions.length > 0 && (
                  <Card className="border-border/50 bg-card/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <ShoppingBag className="h-5 w-5 text-orange-500" />
                        Consumos Internos ({dreData.internalConsumptions.length})
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Produtos consumidos pelos profissionais (descontados da comissão)
                      </p>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {dreData.internalConsumptions.map((c: any) => (
                          <div 
                            key={c.id}
                            className="p-3 rounded-lg border border-orange-500/20 bg-orange-500/5"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 text-sm">
                                  <Clock className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-muted-foreground">
                                    {format(new Date(c.date), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                  </span>
                                </div>
                                <div className="flex items-center gap-4 mt-1">
                                  <div className="flex items-center gap-1 text-sm text-primary">
                                    <Scissors className="h-3 w-3" />
                                    <span>{c.barberName}</span>
                                  </div>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">{c.items}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-orange-500">-R$ {c.value.toFixed(2)}</p>
                                <p className="text-xs text-muted-foreground">desconto comissão</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 pt-4 border-t border-border/50 flex justify-between items-center">
                        <span className="text-sm font-medium">Total Consumos Internos:</span>
                        <span className="font-bold text-orange-500">-R$ {(dreData.internalConsumptionTotal || 0).toFixed(2)}</span>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            )}
          </TabsContent>

          {/* TAB: DESPESAS FIXAS */}
          <TabsContent value="despesas" className="space-y-6">
            <div className="flex justify-end">
              <Button 
                onClick={() => { resetExpenseForm(); setIsExpenseDialogOpen(true); }}
                data-testid="button-add-expense"
              >
                <Plus className="mr-2 h-4 w-4" /> Nova Despesa
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {fixedExpenses.length === 0 ? (
                <Card className="col-span-full border-border/50 bg-card/50 p-12 text-center">
                  <div className="flex flex-col items-center gap-4 text-muted-foreground">
                    <PiggyBank className="h-16 w-16 opacity-50" />
                    <h2 className="text-xl font-semibold">Nenhuma despesa cadastrada</h2>
                    <p>Cadastre suas despesas fixas para acompanhar seus custos.</p>
                  </div>
                </Card>
              ) : (
                fixedExpenses.map((expense: any) => {
                  const category = EXPENSE_CATEGORIES.find(c => c.value === expense.category) || EXPENSE_CATEGORIES[5];
                  const CategoryIcon = category.icon;
                  
                  return (
                    <Card 
                      key={expense.id} 
                      className={`border-border/50 ${expense.active ? 'bg-card/50' : 'bg-card/30 opacity-60'}`}
                      data-testid={`expense-card-${expense.id}`}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className="p-2 rounded-lg bg-primary/10">
                              <CategoryIcon className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <CardTitle className="text-base">{expense.name}</CardTitle>
                              <p className="text-xs text-muted-foreground">{category.label}</p>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditExpense(expense)}
                              data-testid={`button-edit-expense-${expense.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:text-red-600"
                              onClick={() => handleDeleteExpense(expense.id)}
                              data-testid={`button-delete-expense-${expense.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-foreground">
                          R$ {parseFloat(expense.amount).toFixed(2)}
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>
                            {expense.recurrence === 'monthly' ? 'Mensal' : 
                             expense.recurrence === 'weekly' ? 'Semanal' : 'Diário'}
                            {expense.dueDay && ` • Dia ${expense.dueDay}`}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>

            {fixedExpenses.length > 0 && (
              <Card className="border-primary/20 bg-gradient-to-br from-primary/10 to-transparent">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <PiggyBank className="h-8 w-8 text-primary" />
                      <div>
                        <p className="text-sm text-muted-foreground">Total Mensal em Despesas Fixas</p>
                        <p className="text-3xl font-bold text-foreground" data-testid="text-total-fixed-expenses">
                          R$ {fixedExpenses
                            .filter((e: any) => e.active)
                            .reduce((sum: number, e: any) => {
                              const amount = parseFloat(e.amount);
                              if (e.recurrence === 'monthly') return sum + amount;
                              if (e.recurrence === 'weekly') return sum + (amount * 4);
                              if (e.recurrence === 'daily') return sum + (amount * 30);
                              return sum + amount;
                            }, 0).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Dialogs */}
        <Dialog open={isOpenDialogOpen} onOpenChange={setIsOpenDialogOpen}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle>Abrir Caixa</DialogTitle>
              <DialogDescription>Informe o valor inicial do caixa para começar as operações.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="openAmount">Valor de Abertura (R$)</Label>
                <Input
                  id="openAmount"
                  type="number"
                  step="0.01"
                  value={openAmount}
                  onChange={(e) => setOpenAmount(e.target.value)}
                  placeholder="0,00"
                  data-testid="input-opening-amount"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOpenDialogOpen(false)} data-testid="button-cancel-open">Cancelar</Button>
              <Button 
                onClick={handleOpenCashRegister} 
                disabled={openMutation.isPending}
                data-testid="button-confirm-open"
              >
                {openMutation.isPending ? "Abrindo..." : "Abrir Caixa"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isCloseDialogOpen} onOpenChange={setIsCloseDialogOpen}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle>Fechar Caixa</DialogTitle>
              <DialogDescription>
                {hasOpenComandas ? (
                  <span className="text-destructive font-bold">
                    ATENÇÃO: Existem {openComandasList.length} comanda(s) aberta(s). 
                    Se você fechar o caixa agora, estas comandas serão contabilizadas no próximo caixa aberto.
                  </span>
                ) : (
                  "Revise os valores antes de fechar o caixa."
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-4 bg-background rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Abertura:</span>
                  <span className="font-medium">R$ {parseFloat(cashRegister?.openingAmount || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vendas (Dinheiro):</span>
                  <span className="font-medium text-green-500">+ R$ {salesByMethod.cash.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground ml-4">Vendas (Pix):</span>
                  <span className="font-medium text-blue-400">+ R$ {salesByMethod.pix.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground ml-4">Vendas (Cartão):</span>
                  <span className="font-medium text-purple-400">+ R$ {salesByMethod.card.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reforços:</span>
                  <span className="font-medium text-green-500">+ R$ {deposits.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sangrias:</span>
                  <span className="font-medium text-red-500">- R$ {withdrawals.toFixed(2)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Saldo Final (Dinheiro):</span>
                  <span className="text-primary">R$ {expectedCashBalance.toFixed(2)}</span>
                </div>
              </div>
              {hasOpenComandas && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <p className="text-xs text-destructive flex items-center gap-2">
                    <AlertTriangle className="h-3 w-3" />
                    Comandas abertas não serão perdidas, apenas movidas para o próximo período.
                  </p>
                </div>
              )}
              <div className="p-3 bg-primary/10 rounded-lg">
                <p className="text-sm text-center">
                  Total vendido hoje: <span className="font-bold">R$ {totalSales.toFixed(2)}</span>
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCloseDialogOpen(false)} data-testid="button-cancel-close">
                Cancelar
              </Button>
              <Button 
                variant={hasOpenComandas ? "destructive" : "default"}
                onClick={() => handleCloseCashRegister(hasOpenComandas)} 
                disabled={closeMutation.isPending}
                data-testid="button-confirm-close"
              >
                {closeMutation.isPending ? "Fechando..." : hasOpenComandas ? "Fechar mesmo assim" : "Confirmar Fechamento"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isTransactionDialogOpen} onOpenChange={setIsTransactionDialogOpen}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle>
                {transactionType === 'withdrawal' ? 'Registrar Sangria' : transactionType === 'deposit' ? 'Registrar Reforço' : 'Registrar Estorno'}
              </DialogTitle>
              <DialogDescription>
                {transactionType === 'withdrawal' 
                  ? 'Registre a retirada de dinheiro do caixa.' 
                  : transactionType === 'deposit'
                  ? 'Registre a entrada de dinheiro no caixa.'
                  : 'Registre um estorno para correção. Isso mantém o rastro de auditoria.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="transactionAmount">Valor (R$)</Label>
                <Input
                  id="transactionAmount"
                  type="number"
                  step="0.01"
                  value={transactionAmount}
                  onChange={(e) => setTransactionAmount(e.target.value)}
                  placeholder="0,00"
                  data-testid="input-transaction-amount"
                />
              </div>
              <div>
                <Label htmlFor="transactionDescription">Descrição (opcional)</Label>
                <Input
                  id="transactionDescription"
                  value={transactionDescription}
                  onChange={(e) => setTransactionDescription(e.target.value)}
                  placeholder="Motivo da movimentação"
                  data-testid="input-transaction-description"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsTransactionDialogOpen(false)} data-testid="button-cancel-transaction">
                Cancelar
              </Button>
              <Button 
                onClick={handleAddTransaction} 
                disabled={transactionMutation.isPending || !transactionAmount}
                data-testid="button-confirm-transaction"
                className={transactionType === 'withdrawal' ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}
              >
                {transactionMutation.isPending ? "Salvando..." : "Confirmar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isExpenseDialogOpen} onOpenChange={setIsExpenseDialogOpen}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle>{editingExpense ? 'Editar Despesa' : 'Nova Despesa Fixa'}</DialogTitle>
              <DialogDescription>
                Cadastre uma despesa recorrente para acompanhar seus custos fixos.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="expenseName">Nome da Despesa</Label>
                <Input
                  id="expenseName"
                  value={expenseName}
                  onChange={(e) => setExpenseName(e.target.value)}
                  placeholder="Ex: Aluguel do salão"
                  data-testid="input-expense-name"
                />
              </div>
              <div>
                <Label htmlFor="expenseAmount">Valor (R$)</Label>
                <Input
                  id="expenseAmount"
                  type="number"
                  step="0.01"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  placeholder="0,00"
                  data-testid="input-expense-amount"
                />
              </div>
              <div>
                <Label htmlFor="expenseCategory">Categoria</Label>
                <Select value={expenseCategory} onValueChange={setExpenseCategory}>
                  <SelectTrigger data-testid="select-expense-category">
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="expenseRecurrence">Recorrência</Label>
                <Select value={expenseRecurrence} onValueChange={setExpenseRecurrence}>
                  <SelectTrigger data-testid="select-expense-recurrence">
                    <SelectValue placeholder="Selecione a recorrência" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Mensal</SelectItem>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="daily">Diário</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {expenseRecurrence === 'monthly' && (
                <div>
                  <Label htmlFor="expenseDueDay">Dia do Vencimento (opcional)</Label>
                  <Input
                    id="expenseDueDay"
                    type="number"
                    min="1"
                    max="31"
                    value={expenseDueDay}
                    onChange={(e) => setExpenseDueDay(e.target.value)}
                    placeholder="Ex: 10"
                    data-testid="input-expense-due-day"
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsExpenseDialogOpen(false)} data-testid="button-cancel-expense">
                Cancelar
              </Button>
              <Button 
                onClick={handleSaveExpense} 
                disabled={createExpenseMutation.isPending || updateExpenseMutation.isPending || !expenseName || !expenseAmount}
                data-testid="button-save-expense"
              >
                {(createExpenseMutation.isPending || updateExpenseMutation.isPending) ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
