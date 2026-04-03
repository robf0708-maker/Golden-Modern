import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, PiggyBank, TrendingUp, Percent } from "lucide-react";
import type { DreSummary } from "@/types/dre";

interface DreExecutiveCardsProps {
  summary: DreSummary;
}

export function DreExecutiveCards({ summary }: DreExecutiveCardsProps) {
  const gross = summary.grossTotal || 0;
  const totalOut =
    (summary.totalFees || 0) + (summary.totalCommissions || 0) + (summary.fixedExpenses || 0);
  const net = summary.netRealBalance ?? 0;
  const marginPct = gross > 0 ? (net / gross) * 100 : 0;

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Visão executiva
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Faturamento, saídas (taxas + comissões + despesas fixas proporcionais), lucro líquido e margem sobre o bruto.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4 text-green-500" />
              Faturamento
            </div>
            <p
              className="text-2xl font-bold text-green-600 dark:text-green-400"
              data-testid="text-gross-total"
            >
              R$ {gross.toFixed(2)}
            </p>
          </div>
          <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <PiggyBank className="h-4 w-4 text-orange-500" />
              Despesas / saídas
            </div>
            <p className="text-2xl font-bold text-orange-500" data-testid="text-dre-total-out">
              R$ {totalOut.toFixed(2)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1 leading-tight">
              Taxas + comissões + despesas fixas (período)
            </p>
          </div>
          <div
            className={`p-4 rounded-lg border ${
              net >= 0
                ? "bg-emerald-500/10 border-emerald-500/20"
                : "bg-red-500/10 border-red-500/20"
            }`}
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              Lucro líquido
            </div>
            <p
              className={`text-2xl font-bold ${net >= 0 ? "text-emerald-500" : "text-red-500"}`}
              data-testid="text-net-real-balance"
            >
              R$ {net.toFixed(2)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1 leading-tight">
              Saldo líquido real (bruto − taxas − comissões)
            </p>
          </div>
          <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Percent className="h-4 w-4 text-primary" />
              Margem
            </div>
            <p className="text-2xl font-bold text-primary">{marginPct.toFixed(1)}%</p>
            <p className="text-[10px] text-muted-foreground mt-1 leading-tight">
              Lucro líquido ÷ faturamento bruto
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-border/60 text-xs">
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">(-) Taxas administrativas</span>
            <span className="font-medium text-orange-500" data-testid="text-total-fees">
              R$ {(summary.totalFees || 0).toFixed(2)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">(-) Comissões</span>
            <span className="font-medium text-purple-500" data-testid="text-total-commissions">
              R$ {(summary.totalCommissions || 0).toFixed(2)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">(-) Despesas fixas (período)</span>
            <span className="font-medium text-amber-600">
              R$ {(summary.fixedExpenses || 0).toFixed(2)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Resultado (após despesas fixas)</span>
            <span className="font-medium text-foreground" data-testid="text-dre-result">
              R$ {(summary.result || 0).toFixed(2)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
