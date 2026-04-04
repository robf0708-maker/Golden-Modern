import { useState } from "react";
import {
  Megaphone, Plus, ArrowLeft, Send, Users, CheckCircle,
  XCircle, Clock, StopCircle, Loader2, ChevronRight, ChevronLeft,
  CheckCircle2, Filter, CalendarX, MousePointer, TrendingUp, MessageSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import Layout from "@/components/Layout";
import {
  useCampaigns, useCampaign, useCreateCampaign,
  useStopCampaign, useFilterClients, useClients
} from "@/lib/api";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ============ TIPOS ============

type ViewMode = 'list' | 'create' | 'detail';
type FilterMode = 'all' | 'funnel' | 'inactive' | 'manual';

const FUNNEL_LABELS: Record<string, { label: string; color: string }> = {
  novo_cliente:       { label: "Novo",        color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  cliente_ativo:      { label: "Ativo",       color: "bg-green-500/20 text-green-400 border-green-500/30" },
  cliente_recorrente: { label: "Recorrente",  color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  cliente_plano:      { label: "Plano",       color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  cliente_inativo:    { label: "Inativo",     color: "bg-red-500/20 text-red-400 border-red-500/30" },
};

// ============ COMPONENTE PRINCIPAL ============

export default function Campanhas() {
  const [view, setView] = useState<ViewMode>('list');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const { data: campaigns = [], isLoading } = useCampaigns();

  function openDetail(id: string) {
    setSelectedCampaignId(id);
    setView('detail');
  }

  return (
    <Layout>
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {view !== 'list' && (
            <Button variant="ghost" size="icon" onClick={() => setView('list')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          <Megaphone className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-serif font-bold">Campanhas</h1>
        </div>
        {view === 'list' && (
          <Button
            variant={!isLoading && campaigns.length === 0 ? "outline" : "default"}
            onClick={() => setView('create')}
          >
            <Plus className="w-4 h-4 mr-2" /> Nova Campanha
          </Button>
        )}
      </div>

      {/* Views */}
      {view === 'list' && (
        <CampaignList
          campaigns={campaigns}
          isLoading={isLoading}
          onSelect={openDetail}
          onNew={() => setView('create')}
        />
      )}
      {view === 'create' && (
        <CampaignWizard
          onDone={(id) => { setSelectedCampaignId(id); setView('detail'); }}
          onCancel={() => setView('list')}
        />
      )}
      {view === 'detail' && selectedCampaignId && (
        <CampaignDetail id={selectedCampaignId} />
      )}
    </div>
    </Layout>
  );
}

// ============ LISTA DE CAMPANHAS ============

function CampaignList({ campaigns, isLoading, onSelect, onNew }: {
  campaigns: any[];
  isLoading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Carregando campanhas...
      </div>
    );
  }

  // Métricas resumo
  const totalCampaigns = campaigns.length;
  const sendingCount = campaigns.filter((c: any) => c.status === 'sending').length;
  const doneCount = campaigns.filter((c: any) => c.status === 'done').length;
  const stoppedCount = campaigns.filter((c: any) => c.status === 'stopped').length;
  const totalSent = campaigns.reduce((acc: number, c: any) => acc + (c.sentCount || 0), 0);

  if (campaigns.length === 0) {
    const flowSteps = [
      { Icon: Users, title: "Destinatários", desc: "Quem recebe: todos, funil ou lista manual" },
      { Icon: MessageSquare, title: "Mensagem", desc: "Texto e variáveis como {{nome}}" },
      { Icon: Send, title: "Confirmar", desc: "Intervalos, limite diário e envio" },
    ];
    return (
      <div className="grid gap-6 lg:grid-cols-12 lg:items-stretch">
        <Card className="lg:col-span-7 border-border/80 overflow-hidden">
          <CardContent className="p-6 sm:p-8 flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                <Megaphone className="w-7 h-7 text-primary" />
              </div>
              <div className="space-y-2 min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Campanhas WhatsApp
                </p>
                <h2 className="text-xl sm:text-2xl font-serif font-bold leading-tight">
                  Nenhuma campanha ainda
                </h2>
                <p className="text-sm text-muted-foreground max-w-xl">
                  Envie mensagens em massa para seus clientes via WhatsApp em poucos passos — o mesmo fluxo
                  que você verá ao criar a primeira campanha.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {flowSteps.map(({ Icon, title, desc }) => (
                <div
                  key={title}
                  className="rounded-xl border border-border/80 bg-muted/20 px-3 py-3 sm:py-4 flex flex-col gap-2"
                >
                  <div className="flex items-center gap-2 text-primary">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-semibold">{title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug">{desc}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button onClick={onNew} size="lg" className="gap-2">
                <Plus className="w-4 h-4" /> Criar primeira campanha
              </Button>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Ou use &quot;Nova Campanha&quot; no topo
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-5 border-border/60 flex flex-col min-h-[280px]">
          <CardHeader className="pb-3 space-y-1">
            <CardTitle className="text-base font-semibold">Suas campanhas (preview)</CardTitle>
            <CardDescription className="text-xs">
              Assim que você criar campanhas, elas aparecerão aqui com progresso e status.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pt-0 flex flex-col">
            <div className="rounded-lg border border-border/60 overflow-hidden bg-muted/10">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border/60">
                    <TableHead className="text-xs h-9">Campanha</TableHead>
                    <TableHead className="text-xs h-9 hidden sm:table-cell">Progresso</TableHead>
                    <TableHead className="text-xs h-9">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[0, 1, 2].map((i) => (
                    <TableRow key={i} className="border-border/40 hover:bg-transparent">
                      <TableCell className="py-3">
                        <div className="space-y-2">
                          <div className="h-3.5 w-[min(100%,11rem)] rounded bg-muted/60 animate-pulse" />
                          <div className="h-2.5 w-24 rounded bg-muted/40 animate-pulse" />
                        </div>
                      </TableCell>
                      <TableCell className="py-3 hidden sm:table-cell">
                        <div className="space-y-2 max-w-[140px]">
                          <div className="h-2 rounded-full bg-muted/50 animate-pulse" />
                          <div className="h-2 w-16 rounded bg-muted/35 animate-pulse" />
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="h-6 w-20 rounded-full bg-muted/45 animate-pulse" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-[11px] text-muted-foreground mt-3 text-center sm:text-left">
              Ilustração — dados reais após a primeira campanha
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Cards de métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Megaphone className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{totalCampaigns}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center shrink-0">
              <Loader2 className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Enviando</p>
              <p className="text-2xl font-bold text-yellow-400">{sendingCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Concluídas</p>
              <p className="text-2xl font-bold text-green-400">{doneCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Msgs enviadas</p>
              <p className="text-2xl font-bold">{totalSent.toLocaleString('pt-BR')}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de campanhas */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campanha</TableHead>
              <TableHead>Progresso</TableHead>
              <TableHead>Resultados</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.map((c: any) => {
              const progress = c.totalRecipients > 0
                ? Math.round((c.sentCount / c.totalRecipients) * 100)
                : 0;
              return (
                <TableRow key={c.id} className="cursor-pointer hover:bg-muted/30" onClick={() => onSelect(c.id)}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{c.name || "Campanha sem nome"}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(c.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[160px]">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{c.sentCount}/{c.totalRecipients}</span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-1.5" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-green-400 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />{c.sentCount}
                      </span>
                      {c.failedCount > 0 && (
                        <span className="text-red-400 flex items-center gap-1">
                          <XCircle className="w-3 h-3" />{c.failedCount}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onSelect(c.id); }}>
                      Ver <ChevronRight className="w-3 h-3 ml-1" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// ============ WIZARD DE CRIAÇÃO ============

function CampaignWizard({ onDone, onCancel }: {
  onDone: (id: string) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(1);
  const { toast } = useToast();

  // Etapa 1 — filtros
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [funnelStatuses, setFunnelStatuses] = useState<string[]>([]);
  const [inactiveDays, setInactiveDays] = useState(30);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  // Etapa 2 — mensagem
  const [campaignName, setCampaignName] = useState('');
  const [message, setMessage] = useState('');

  // Etapa 3 — configurações
  const [delayMin, setDelayMin] = useState(15);
  const [delayMax, setDelayMax] = useState(45);
  const [dailyLimit, setDailyLimit] = useState(100);

  const { data: allClients = [] } = useClients();
  const filterMutation = useFilterClients();
  const createMutation = useCreateCampaign();

  async function updatePreview() {
    const filter = buildFilter();
    if (filter.mode === 'funnel' && (!filter.funnelStatuses || filter.funnelStatuses.length === 0)) {
      toast({
        title: "Selecione os status",
        description: "Marque pelo menos um status do funil ou escolha outro modo de seleção.",
        variant: "destructive",
      });
      return;
    }
    if (filter.mode === 'manual' && (!filter.clientIds || filter.clientIds.length === 0)) {
      toast({
        title: "Selecione destinatários",
        description: "Escolha pelo menos um cliente na lista.",
        variant: "destructive",
      });
      return;
    }
    if (filter.mode === 'inactive' && (!filter.inactiveDays || filter.inactiveDays < 1)) {
      toast({
        title: "Dias inválidos",
        description: "Informe quantos dias sem visita (mínimo 1).",
        variant: "destructive",
      });
      return;
    }
    try {
      const result = await filterMutation.mutateAsync(filter);
      setPreviewCount(result.count);
    } catch (e: any) {
      toast({
        title: "Não foi possível calcular",
        description: e?.message || "Verifique o filtro e tente de novo.",
        variant: "destructive",
      });
    }
  }

  function buildFilter() {
    if (filterMode === 'all') return { mode: 'all' };
    if (filterMode === 'funnel') return { mode: 'funnel', funnelStatuses };
    if (filterMode === 'inactive') return { mode: 'inactive', inactiveDays };
    return { mode: 'manual', clientIds: selectedClientIds };
  }

  function toggleFunnelStatus(status: string) {
    setFunnelStatuses(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  }

  function toggleClient(id: string) {
    setSelectedClientIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }

  function insertVariable(variable: string) {
    const textarea = document.getElementById('campaign-message') as HTMLTextAreaElement;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newMessage = message.slice(0, start) + variable + message.slice(end);
    setMessage(newMessage);
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = start + variable.length;
      textarea.focus();
    }, 0);
  }

  const firstClient = allClients[0] as any;
  const previewMessage = message
    .replace(/\{\{nome\}\}/gi, firstClient?.name ?? 'João Silva')
    .replace(/\{\{barbearia\}\}/gi, 'Barbearia Gold');

  const avgDelay = (delayMin + delayMax) / 2;
  const estimatedMinutes = previewCount ? Math.ceil((previewCount * avgDelay) / 60) : 0;

  const filteredClients = allClients.filter((c: any) =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.phone.includes(clientSearch)
  );

  async function handleSend() {
    if (!message.trim()) {
      toast({ title: "Erro", description: "Escreva a mensagem antes de enviar", variant: "destructive" });
      return;
    }
    const filter = buildFilter();
    if (filter.mode === 'funnel' && (!filter.funnelStatuses || filter.funnelStatuses.length === 0)) {
      toast({ title: "Filtro incompleto", description: "Selecione ao menos um status do funil na etapa de destinatários.", variant: "destructive" });
      setStep(1);
      return;
    }
    if (filter.mode === 'manual' && (!filter.clientIds || filter.clientIds.length === 0)) {
      toast({ title: "Filtro incompleto", description: "Selecione ao menos um cliente na etapa de destinatários.", variant: "destructive" });
      setStep(1);
      return;
    }
    if (filter.mode === 'inactive' && (!filter.inactiveDays || filter.inactiveDays < 1)) {
      toast({ title: "Filtro incompleto", description: "Informe os dias sem visita na etapa de destinatários.", variant: "destructive" });
      setStep(1);
      return;
    }
    try {
      const result = await createMutation.mutateAsync({
        name: campaignName || undefined,
        message,
        filter: buildFilter(),
        delayMinSeconds: delayMin,
        delayMaxSeconds: delayMax,
        dailyLimit,
      });
      onDone(result.id);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  }

  const steps = [
    { n: 1, label: 'Destinatários' },
    { n: 2, label: 'Mensagem' },
    { n: 3, label: 'Confirmar' },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Indicador de etapas melhorado */}
      <div className="flex items-start">
        {steps.map(({ n, label }, idx) => (
          <div key={n} className="flex items-start flex-1">
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-colors
                ${step === n ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30' :
                  step > n ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground'}`}>
                {step > n ? <CheckCircle className="w-4 h-4" /> : n}
              </div>
              <span className={`text-xs text-center leading-tight whitespace-nowrap
                ${step === n ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                {label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div className="flex-1 h-[1px] mt-[18px] mx-1 relative">
                <div className="absolute inset-0 bg-muted" />
                <div
                  className="absolute inset-0 bg-primary transition-all duration-300"
                  style={{ width: step > n ? '100%' : '0%' }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ===== ETAPA 1: Destinatários ===== */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Quem vai receber?</CardTitle>
            <CardDescription>Escolha como selecionar os destinatários da campanha</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  mode: 'all' as FilterMode,
                  label: 'Todos os clientes',
                  desc: 'Enviar para toda a base cadastrada',
                  icon: Users,
                },
                {
                  mode: 'funnel' as FilterMode,
                  label: 'Por status no funil',
                  desc: 'Novo, Ativo, Recorrente, Plano ou Inativo',
                  icon: Filter,
                },
                {
                  mode: 'inactive' as FilterMode,
                  label: 'Por dias sem visita',
                  desc: 'Última visita há mais de X dias (mais dias = menos pessoas)',
                  icon: CalendarX,
                },
                {
                  mode: 'manual' as FilterMode,
                  label: 'Seleção manual',
                  desc: 'Escolher cliente por cliente',
                  icon: MousePointer,
                },
              ].map(({ mode, label, desc, icon: Icon }) => (
                <button
                  key={mode}
                  onClick={() => {
                    setFilterMode(mode);
                    if (mode === 'funnel') {
                      setFunnelStatuses([]);
                    }
                  }}
                  className={`p-4 rounded-lg border text-left transition-all
                    ${filterMode === mode
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/50 hover:bg-muted/30'}`}
                >
                  <Icon className="w-5 h-5 mb-2" />
                  <p className="text-sm font-medium">{label}</p>
                  <p className={`text-xs mt-0.5 ${filterMode === mode ? 'text-primary/70' : 'text-muted-foreground'}`}>
                    {desc}
                  </p>
                </button>
              ))}
            </div>

            {filterMode === 'funnel' && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Selecione os status:</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(FUNNEL_LABELS).map(([status, { label, color }]) => (
                    <button
                      key={status}
                      onClick={() => toggleFunnelStatus(status)}
                      className={`px-3 py-1 rounded-full border text-xs font-medium transition-all
                        ${funnelStatuses.includes(status) ? color + ' scale-105' : 'border-border text-muted-foreground hover:border-muted-foreground'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {filterMode === 'inactive' && (
              <div className="space-y-2">
                <Label>Última visita há mais de:</Label>
                <p className="text-xs text-muted-foreground space-y-1.5">
                  <span className="block">
                    Só entra quem já tem data de última visita (agenda ou comanda). Quem nunca teve visita registrada fica de fora.
                  </span>
                  <span className="block">
                    O número é o mínimo de dias sem visita: com 30 entra quem está parado há mais de 30; com 90, só quem está parado há mais de 90. Quanto maior o valor, mais restrito o filtro e menos destinatários na prévia.
                  </span>
                </p>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    value={inactiveDays}
                    onChange={e => setInactiveDays(Number(e.target.value))}
                    min={1}
                    max={365}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">dias</span>
                </div>
              </div>
            )}

            {filterMode === 'manual' && (
              <div className="space-y-2">
                <Input
                  placeholder="Buscar cliente..."
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                />
                <ScrollArea className="h-48 border rounded-md p-2">
                  {filteredClients.map((c: any) => (
                    <div key={c.id} className="flex items-center gap-2 p-1 hover:bg-muted rounded cursor-pointer"
                      onClick={() => toggleClient(c.id)}>
                      <Checkbox checked={selectedClientIds.includes(c.id)} />
                      <span className="text-sm">{c.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{c.phone}</span>
                    </div>
                  ))}
                </ScrollArea>
                <p className="text-xs text-muted-foreground">{selectedClientIds.length} selecionados</p>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t">
              <Button variant="outline" size="sm" onClick={updatePreview} disabled={filterMutation.isPending}>
                {filterMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                Ver quantos serão atingidos
              </Button>
              {previewCount !== null && (
                <span className="text-sm font-semibold text-primary flex items-center gap-1">
                  <Users className="w-4 h-4" /> {previewCount} clientes
                </span>
              )}
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
              <Button onClick={() => setStep(2)}>
                Próximo <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== ETAPA 2: Mensagem ===== */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Escreva a mensagem</CardTitle>
            <CardDescription>Use variáveis para personalizar cada mensagem automaticamente</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Nome da campanha <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Input
                placeholder="Ex: Promoção de Semana Santa"
                value={campaignName}
                onChange={e => setCampaignName(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label htmlFor="campaign-message">Mensagem</Label>
                <span className={`text-xs ${message.length > 900 ? 'text-red-400' : 'text-muted-foreground'}`}>
                  {message.length}/1000
                </span>
              </div>
              <Textarea
                id="campaign-message"
                placeholder="Olá {{nome}}, temos uma novidade especial na {{barbearia}}..."
                value={message}
                onChange={e => setMessage(e.target.value)}
                maxLength={1000}
                rows={5}
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Inserir variável:</span>
              <Button variant="outline" size="sm" onClick={() => insertVariable('{{nome}}')}>
                {'{{nome}}'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => insertVariable('{{barbearia}}')}>
                {'{{barbearia}}'}
              </Button>
            </div>

            {/* Preview como bolha de WhatsApp */}
            {message.trim() && (
              <div className="rounded-lg border overflow-hidden">
                <div className="bg-[#075E54]/40 px-4 py-2 flex items-center gap-2 border-b border-border">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <p className="text-xs font-medium text-green-400">WhatsApp Preview</p>
                </div>
                <div className="bg-[#0B141A] p-4 min-h-[80px] flex justify-end">
                  <div className="max-w-[85%] bg-[#005C4B] rounded-lg rounded-tr-sm px-3 py-2 shadow-md">
                    <p className="text-sm whitespace-pre-wrap text-white leading-relaxed">{previewMessage}</p>
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className="text-[10px] text-white/60">
                        {format(new Date(), "HH:mm", { locale: ptBR })}
                      </span>
                      <span className="text-[10px] text-blue-300">✓✓</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
              </Button>
              <Button onClick={() => setStep(3)} disabled={!message.trim()}>
                Próximo <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== ETAPA 3: Confirmar ===== */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Confirmar envio</CardTitle>
            <CardDescription>Revise tudo antes de disparar a campanha</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 text-center">
                <p className="text-xs text-muted-foreground mb-1">Destinatários</p>
                <p className="text-3xl font-bold text-primary">{previewCount ?? '?'}</p>
                <p className="text-xs text-muted-foreground mt-1">clientes</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/30 border text-center">
                <p className="text-xs text-muted-foreground mb-1">Tempo estimado</p>
                <p className="text-3xl font-bold">~{estimatedMinutes}</p>
                <p className="text-xs text-muted-foreground mt-1">minutos</p>
              </div>
            </div>

            <div className="space-y-3 border rounded-lg p-4">
              <p className="text-sm font-medium flex items-center gap-2">
                🛡️ Proteção anti-bloqueio WhatsApp
              </p>
              <p className="text-xs text-muted-foreground">
                Intervalos aleatórios entre mensagens para proteger seu número.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Delay mínimo (seg)</Label>
                  <Input type="number" value={delayMin} onChange={e => setDelayMin(Number(e.target.value))} min={5} max={120} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Delay máximo (seg)</Label>
                  <Input type="number" value={delayMax} onChange={e => setDelayMax(Number(e.target.value))} min={10} max={120} className="mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Limite diário de mensagens</Label>
                <Input type="number" value={dailyLimit} onChange={e => setDailyLimit(Number(e.target.value))} min={1} max={500} className="mt-1" />
                <p className="text-xs text-muted-foreground mt-1">
                  Se atingir o limite hoje, o restante será enviado amanhã automaticamente.
                </p>
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(2)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
              </Button>
              <Button onClick={handleSend} disabled={createMutation.isPending} className="gap-2">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Enviar Campanha
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============ DETALHE DA CAMPANHA ============

function CampaignDetail({ id }: { id: string }) {
  const { data, isLoading } = useCampaign(id);
  const stopMutation = useStopCampaign();
  const { toast } = useToast();
  const [filterStatus, setFilterStatus] = useState<'all' | 'sent' | 'failed' | 'pending'>('all');

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Carregando campanha...
      </div>
    );
  }

  const progress = data.totalRecipients > 0
    ? Math.round((data.sentCount / data.totalRecipients) * 100)
    : 0;

  const recipients = data.recipients ?? [];
  const sentCount = recipients.filter((r: any) => r.status === 'sent').length;
  const failedCount = recipients.filter((r: any) => r.status === 'failed').length;
  const pendingCount = recipients.filter((r: any) => r.status === 'pending').length;

  const filteredRecipients = filterStatus === 'all'
    ? recipients
    : recipients.filter((r: any) => r.status === filterStatus);

  async function handleStop() {
    await stopMutation.mutateAsync(id);
    toast({ title: "Campanha parada", description: "O envio foi interrompido." });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{data.name || "Campanha sem nome"}</CardTitle>
              <CardDescription>
                Criada em {format(new Date(data.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={data.status} />
              {data.status === 'sending' && (
                <Button variant="destructive" size="sm" onClick={handleStop} disabled={stopMutation.isPending}>
                  <StopCircle className="w-4 h-4 mr-1" /> Parar
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Barra de progresso */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">{data.sentCount} de {data.totalRecipients} enviados</span>
              <span className="font-semibold text-primary">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Métricas */}
          <div className="grid grid-cols-4 gap-3">
            <div className="text-center p-3 rounded-lg bg-muted/30 border">
              <p className="text-xs text-muted-foreground mb-1">Total</p>
              <p className="text-xl font-bold">{data.totalRecipients}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <p className="text-xs text-green-400 mb-1">Enviados</p>
              <p className="text-xl font-bold text-green-400">{data.sentCount}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-xs text-red-400 mb-1">Falhas</p>
              <p className="text-xl font-bold text-red-400">{data.failedCount}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/30 border">
              <p className="text-xs text-muted-foreground mb-1">Pendentes</p>
              <p className="text-xl font-bold">{data.totalRecipients - data.sentCount - data.failedCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Destinatários</CardTitle>
            {/* Tabs de filtro por status */}
            <div className="flex items-center gap-1 bg-muted/30 rounded-lg p-1">
              {[
                { key: 'all', label: `Todos ${recipients.length}` },
                { key: 'sent', label: `Enviados ${sentCount}` },
                { key: 'failed', label: `Falhas ${failedCount}` },
                { key: 'pending', label: `Aguardando ${pendingCount}` },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilterStatus(key as any)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors
                    ${filterStatus === key
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Enviado em</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRecipients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  Nenhum destinatário neste filtro
                </TableCell>
              </TableRow>
            ) : (
              filteredRecipients.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.clientName}</TableCell>
                  <TableCell className="text-muted-foreground">{r.phone}</TableCell>
                  <TableCell>
                    {r.status === 'sent' && (
                      <span className="text-green-400 flex items-center gap-1.5 text-sm">
                        <CheckCircle className="w-3.5 h-3.5" /> Enviado
                      </span>
                    )}
                    {r.status === 'failed' && (
                      <span className="text-red-400 flex items-center gap-1.5 text-sm">
                        <XCircle className="w-3.5 h-3.5" /> Falhou
                      </span>
                    )}
                    {r.status === 'pending' && (
                      <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
                        <Clock className="w-3.5 h-3.5" /> Aguardando
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.sentAt ? format(new Date(r.sentAt), "HH:mm", { locale: ptBR }) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// ============ COMPONENTE STATUS BADGE ============

function StatusBadge({ status }: { status: string }) {
  if (status === 'sending') return (
    <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 gap-1">
      <Loader2 className="w-3 h-3 animate-spin" /> Enviando
    </Badge>
  );
  if (status === 'done') return (
    <Badge className="bg-green-500/20 text-green-400 border-green-500/30 gap-1">
      <CheckCircle className="w-3 h-3" /> Concluída
    </Badge>
  );
  if (status === 'stopped') return (
    <Badge className="bg-muted text-muted-foreground gap-1">
      <StopCircle className="w-3 h-3" /> Parada
    </Badge>
  );
  return <Badge variant="outline">{status}</Badge>;
}
