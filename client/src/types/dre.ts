export interface DreChartPoint {
  date: string;
  gross: number;
}

export interface DreServiceRevenueRow {
  serviceId: string;
  name: string;
  total: number;
}

export interface DreAlert {
  type: string;
  severity: "warning" | "info";
  message: string;
}

export interface DreFunnelSnapshot {
  inactiveClients: number;
  returnRate: number;
  counts: {
    novo_cliente?: number;
    cliente_ativo?: number;
    cliente_recorrente?: number;
    cliente_plano?: number;
    cliente_inativo?: number;
  };
}

export interface DreSummary {
  grossTotal: number;
  totalFees: number;
  netTotal: number;
  fixedExpenses: number;
  fixedExpensesPaid?: number;
  fixedExpensesPending?: number;
  totalCommissions: number;
  serviceCommissions?: number;
  productCommissions?: number;
  netRealBalance: number;
  result: number;
}

export interface DreFixedExpensePendingRow {
  id: string;
  name: string;
  amount: number;
  category: string;
  dueDay: number | null;
}

export interface DreReportPayload {
  period: { start: string; end: string };
  summary: DreSummary;
  chart?: { points: DreChartPoint[] };
  serviceRevenue?: DreServiceRevenueRow[];
  alerts?: DreAlert[];
  previousPeriod?: { start: string; end: string; grossTotal: number };
  funnelSnapshot?: DreFunnelSnapshot;
  barberPanel?: Array<{
    name: string;
    totalProduced: number;
    serviceCount: number;
    commission: number;
  }>;
  productSalesPanel?: unknown[];
  stockPanel?: unknown[];
  byPaymentMethod?: {
    cash?: { gross: number; fees: number; net: number };
    pix?: { gross: number; fees: number; net: number };
    credit?: { gross: number; fees: number; net: number };
    debit?: { gross: number; fees: number; net: number };
  };
  feeRates?: { credit?: number; debit?: number; pix?: number };
  fixedExpensesList?: unknown[];
  fixedExpensesPendingList?: DreFixedExpensePendingRow[];
  transactions?: unknown[];
  transactionCount?: number;
  internalConsumptions?: unknown[];
  internalConsumptionTotal?: number;
}
