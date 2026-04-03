import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Scissors } from "lucide-react";
import type { DreServiceRevenueRow } from "@/types/dre";

interface DreServiceRevenueProps {
  rows: DreServiceRevenueRow[];
}

export function DreServiceRevenue({ rows }: DreServiceRevenueProps) {
  if (!rows?.length) {
    return (
      <Card className="border-border/50 bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Scissors className="h-5 w-5 text-primary" />
            Receita por serviço
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhuma receita de serviço agregada no período.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Scissors className="h-5 w-5 text-primary" />
          Receita por serviço
        </CardTitle>
        <p className="text-sm text-muted-foreground">Serviços e usos de pacote atribuídos ao serviço do pacote</p>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[min(280px,40vh)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-2 font-medium text-muted-foreground">Serviço</th>
                <th className="text-right py-2 px-2 font-medium text-muted-foreground">Valor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.serviceId} className="border-b border-border/50">
                  <td className="py-2 px-2 font-medium">{row.name}</td>
                  <td className="py-2 px-2 text-right text-green-600 dark:text-green-400">
                    R$ {row.total.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
