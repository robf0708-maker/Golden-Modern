import { useState } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ServiceCombobox } from "@/components/ServiceCombobox";
import { Plus, Search, Package, Calendar, Loader2, MoreVertical, Trash2, Edit, Scissors, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { usePackages, useCreatePackage, useUpdatePackage, useDeletePackage, useServices } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export default function Packages() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    serviceId: "",
    quantity: "10",
    price: "",
    validityDays: "90",
    active: true,
    isRecurring: false,
    recurringInterval: "monthly",
  });

  const { data: packages = [], isLoading } = usePackages();
  const { data: services = [] } = useServices();
  const createMutation = useCreatePackage();
  const updateMutation = useUpdatePackage();
  const deleteMutation = useDeletePackage();
  const { toast } = useToast();

  const resetForm = () => {
    setFormData({ name: "", serviceId: "", quantity: "10", price: "", validityDays: "90", active: true, isRecurring: false, recurringInterval: "monthly" });
    setEditingPackage(null);
  };

  const openEditDialog = (pkg: any) => {
    setEditingPackage(pkg);
    setFormData({
      name: pkg.name,
      serviceId: pkg.serviceId,
      quantity: pkg.quantity.toString(),
      price: pkg.price,
      validityDays: pkg.validityDays.toString(),
      active: pkg.active,
      isRecurring: pkg.isRecurring || false,
      recurringInterval: pkg.recurringInterval || "monthly",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        quantity: parseInt(formData.quantity),
        price: formData.price,
        validityDays: parseInt(formData.validityDays),
        isRecurring: formData.isRecurring,
        recurringInterval: formData.isRecurring ? formData.recurringInterval : null,
      };

      if (editingPackage) {
        await updateMutation.mutateAsync({ id: editingPackage.id, ...data });
        toast({ title: "Pacote atualizado com sucesso!" });
      } else {
        await createMutation.mutateAsync(data);
        toast({ title: "Pacote criado com sucesso!" });
      }
      setIsDialogOpen(false);
      resetForm();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async (pkg: any) => {
    if (confirm(`Tem certeza que deseja excluir ${pkg.name}?`)) {
      try {
        await deleteMutation.mutateAsync(pkg.id);
        toast({ title: "Pacote excluído com sucesso!" });
      } catch (error: any) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
      }
    }
  };

  const filteredPackages = packages.filter((p: any) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getServiceName = (serviceId: string) => {
    const service = services.find((s: any) => s.id === serviceId);
    return service?.name || "Serviço não encontrado";
  };

  const calculateUnitPrice = (price: string, quantity: number) => {
    return (parseFloat(price) / quantity).toFixed(2);
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Pacotes</h1>
            <p className="text-muted-foreground">Crie combos promocionais para fidelizar clientes.</p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-package" className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="mr-2 h-4 w-4" /> Novo Pacote
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>{editingPackage ? "Editar Pacote" : "Criar Pacote"}</DialogTitle>
                <DialogDescription>
                  {editingPackage ? "Atualize os dados do pacote." : "Crie um pacote promocional de serviços."}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-package">
                <div>
                  <Label htmlFor="name">Nome do Pacote</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="10 Cortes Promocional"
                    required
                  />
                </div>
                <div>
                  <Label>Serviço Incluído</Label>
                  <ServiceCombobox
                    services={services}
                    value={formData.serviceId}
                    onValueChange={(value) => setFormData({ ...formData, serviceId: value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="quantity">Quantidade de Usos</Label>
                    <Input
                      id="quantity"
                      type="number"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                      placeholder="10"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="price">Preço Total (R$)</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      placeholder="200.00"
                      required
                    />
                  </div>
                </div>
                {formData.price && formData.quantity && (
                  <p className="text-sm text-muted-foreground">
                    Preço por uso: R$ {calculateUnitPrice(formData.price, parseInt(formData.quantity) || 1)}
                  </p>
                )}
                <div>
                  <Label htmlFor="validityDays">Validade (dias)</Label>
                  <Select
                    value={formData.validityDays}
                    onValueChange={(value) => setFormData({ ...formData, validityDays: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 dias</SelectItem>
                      <SelectItem value="60">60 dias</SelectItem>
                      <SelectItem value="90">90 dias</SelectItem>
                      <SelectItem value="180">180 dias</SelectItem>
                      <SelectItem value="365">1 ano</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="isRecurring">Plano Recorrente (Assinatura)</Label>
                  <Switch
                    id="isRecurring"
                    checked={formData.isRecurring}
                    onCheckedChange={(checked) => setFormData({ ...formData, isRecurring: checked })}
                  />
                </div>
                {formData.isRecurring && (
                  <div>
                    <Label htmlFor="recurringInterval">Intervalo de Cobrança</Label>
                    <Select
                      value={formData.recurringInterval}
                      onValueChange={(value) => setFormData({ ...formData, recurringInterval: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Semanal</SelectItem>
                        <SelectItem value="biweekly">Quinzenal</SelectItem>
                        <SelectItem value="monthly">Mensal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <Label htmlFor="active">Ativo</Label>
                  <Switch
                    id="active"
                    checked={formData.active}
                    onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending || !formData.serviceId}>
                    {(createMutation.isPending || updateMutation.isPending) ? "Salvando..." : (editingPackage ? "Atualizar" : "Criar Pacote")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar pacotes..."
            className="pl-10 bg-card border-border"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPackages.map((pkg: any) => (
            <Card key={pkg.id} className={`group hover:border-primary/50 transition-colors bg-card/50 backdrop-blur-sm ${!pkg.active ? 'opacity-60' : ''}`}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <Package className="w-6 h-6" />
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-card border-border">
                      <DropdownMenuItem onClick={() => openEditDialog(pkg)}>
                        <Edit className="w-4 h-4 mr-2" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(pkg)}>
                        <Trash2 className="w-4 h-4 mr-2" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <h3 className="font-bold text-lg text-foreground mb-1">{pkg.name}</h3>
                <div className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
                  <Scissors className="w-3 h-3" />
                  {getServiceName(pkg.serviceId)}
                </div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-2xl font-bold text-primary">R$ {parseFloat(pkg.price).toFixed(2)}</span>
                  <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium">
                    {pkg.quantity}x
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {pkg.validityDays} dias
                  </span>
                  <span>R$ {calculateUnitPrice(pkg.price, pkg.quantity)}/uso</span>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  {pkg.isRecurring && (
                    <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                      <RefreshCw className="w-3 h-3 mr-1" />
                      {pkg.recurringInterval === "weekly" ? "Semanal" : pkg.recurringInterval === "biweekly" ? "Quinzenal" : "Mensal"}
                    </Badge>
                  )}
                  {!pkg.active && (
                    <Badge className="bg-red-500/10 text-red-400 border-red-500/30">Inativo</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredPackages.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p>Nenhum pacote criado ainda.</p>
            <p className="text-sm mt-1">Clique em "Novo Pacote" para começar.</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
