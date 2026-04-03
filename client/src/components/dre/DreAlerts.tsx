import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Info } from "lucide-react";
import type { DreAlert as DreAlertT } from "@/types/dre";

interface DreAlertsProps {
  alerts: DreAlertT[];
}

export function DreAlerts({ alerts }: DreAlertsProps) {
  if (!alerts?.length) return null;

  return (
    <div className="space-y-2">
      {alerts.map((a, i) => (
        <Alert
          key={`${a.type}-${i}`}
          variant={a.severity === "warning" ? "destructive" : "default"}
          className={
            a.severity === "info"
              ? "border-primary/30 bg-primary/5 text-foreground"
              : undefined
          }
        >
          {a.severity === "warning" ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <Info className="h-4 w-4 text-primary" />
          )}
          <AlertTitle className="text-sm">Insight</AlertTitle>
          <AlertDescription>{a.message}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
