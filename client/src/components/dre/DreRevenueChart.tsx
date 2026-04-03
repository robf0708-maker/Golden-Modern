import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DreChartPoint } from "@/types/dre";

interface DreRevenueChartProps {
  points: DreChartPoint[];
}

function formatDayLabel(dateStr: string) {
  try {
    return format(parseISO(dateStr), "dd/MM", { locale: ptBR });
  } catch {
    return dateStr;
  }
}

export function DreRevenueChart({ points }: DreRevenueChartProps) {
  if (!points.length) {
    return null;
  }

  const data = points.map((p) => ({
    ...p,
    label: formatDayLabel(p.date),
  }));

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Faturamento no período
        </CardTitle>
        <p className="text-sm text-muted-foreground">Bruto por dia (mesma base do relatório)</p>
      </CardHeader>
      <CardContent className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="dreGrossFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" />
            <YAxis
              tick={{ fontSize: 11 }}
              className="text-muted-foreground"
              tickFormatter={(v) =>
                v >= 1000 ? `R$ ${(v / 1000).toFixed(1)}k` : `R$ ${v}`
              }
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
              }}
              formatter={(value: number | string) => [
                `R$ ${Number(value).toFixed(2)}`,
                "Bruto",
              ]}
              labelFormatter={(label) => String(label)}
            />
            <Area
              type="monotone"
              dataKey="gross"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#dreGrossFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
