import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserPlus, UserCheck, Repeat, Crown, UserX } from "lucide-react";
import type { DreFunnelSnapshot } from "@/types/dre";

interface DreFunnelStripProps {
  funnel: DreFunnelSnapshot;
}

export function DreFunnelStrip({ funnel }: DreFunnelStripProps) {
  const c = funnel.counts || {};
  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Funil de clientes (visão rápida)
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Taxa de retorno: <span className="font-semibold text-foreground">{funnel.returnRate}%</span>
          <span className="text-xs ml-1">(clientes que voltaram pelo menos uma vez)</span>
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 p-3">
            <UserPlus className="h-4 w-4 text-blue-500 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Novos</p>
              <p className="text-lg font-bold">{c.novo_cliente ?? 0}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 p-3">
            <UserCheck className="h-4 w-4 text-cyan-500 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Ativos</p>
              <p className="text-lg font-bold">{c.cliente_ativo ?? 0}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 p-3">
            <Repeat className="h-4 w-4 text-emerald-500 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Recorrentes</p>
              <p className="text-lg font-bold">{c.cliente_recorrente ?? 0}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 p-3">
            <Crown className="h-4 w-4 text-amber-500 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Plano</p>
              <p className="text-lg font-bold">{c.cliente_plano ?? 0}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 p-3">
            <UserX className="h-4 w-4 text-red-500 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Inativos</p>
              <p className="text-lg font-bold">{c.cliente_inativo ?? 0}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
