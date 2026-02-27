import { useState } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Plus, 
  Search, 
  Clock, 
  DollarSign,
  Scissors,
  MoreVertical,
  Pencil,
  Trash2,
  Loader2
} from "lucide-react";
import { useServices, useCreateService, useUpdateService, useDeleteService } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function Services() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    duration: "30",
    category: "",
  });

  const { data: services = [], isLoading } = useServices();
  const createMutation = useCreateService();
  const updateMutation = useUpdateService();
  const deleteMutation = useDeleteService();
  const { toast } = useToast();

  const openCreateDialog = () => {
    setEditingService(null);
    setFormData({ name: "", price: "", duration: "30", category: "" });
    setIsDialogOpen(true);
  };

  const openEditDialog = (service: any) => {
    setEditingService(service);
    setFormData({
      name: service.name,
      price: service.price,
      duration: String(service.duration),
      category: service.category || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (service: any) => {
    if (window.confirm(`Deseja excluir o serviço "${service.name}"?`)) {
      deleteMutation.mutate(service.id, {
        onSuccess: () => toast({ title: "Serviço excluído com sucesso!" }),
        onError: (err: any) => toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" }),
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingService) {
        await updateMutation.mutateAsync({
          id: editingService.id,
          ...formData,
          duration: parseInt(formData.duration),
        });
        toast({ title: "Serviço atualizado com sucesso!" });
      } else {
        await createMutation.mutateAsync({
          ...formData,
          price: formData.price,
          duration: parseInt(formData.duration),
        });
        toast({ title: "Serviço criado com sucesso!" });
      }
      setIsDialogOpen(false);
      setEditingService(null);
      setFormData({ name: "", price: "", duration: "30", category: "" });
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const filteredServices = services.filter((s: any) => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
            <h1 className="text-3xl font-serif font-bold text-foreground">Serviços</h1>
            <p className="text-muted-foreground">Gerencie o catálogo de serviços oferecidos.</p>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" /> Novo Serviço
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>{editingService ? "Editar Serviço" : "Criar Novo Serviço"}</DialogTitle>
                <DialogDescription>
                  {editingService ? "Atualize os dados do serviço." : "Adicione um novo serviço ao catálogo."}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Nome do Serviço</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Corte Masculino"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="price">Preço (R$)</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      placeholder="50.00"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="duration">Duração (min)</Label>
                    <Input
                      id="duration"
                      type="number"
                      value={formData.duration}
                      onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                      placeholder="30"
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="category">Categoria</Label>
                  <Input
                    id="category"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="Cabelo"
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {createMutation.isPending || updateMutation.isPending
                      ? "Salvando..."
                      : editingService ? "Salvar Alterações" : "Criar Serviço"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* List of Services */}
          <div className="lg:col-span-3 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar serviços..." 
                className="pl-10 bg-card border-border"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredServices.map((service: any) => (
                <Card key={service.id} className="group hover:border-primary/50 transition-colors bg-card/50 backdrop-blur-sm">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                        <Scissors className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-foreground truncate">{service.name}</h3>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {service.duration} min</span>
                          <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> R$ {parseFloat(service.price).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover:opacity-100 flex-shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(service)}>
                          <Pencil className="w-4 h-4 mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => handleDelete(service)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Quick Add / Stats */}
          <div className="space-y-6">
            <Card className="bg-card border-primary/20">
              <CardHeader>
                <CardTitle className="text-lg">Resumo</CardTitle>
                <CardDescription>Estatísticas do catálogo</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total de Serviços</span>
                  <span className="font-bold">{services.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Preço Médio</span>
                  <span className="font-bold">
                    R$ {services.length > 0 
                      ? (services.reduce((acc: number, s: any) => acc + parseFloat(s.price), 0) / services.length).toFixed(2)
                      : "0.00"}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
              <CardHeader>
                <CardTitle className="text-lg text-primary">Dica Pro</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Crie "Combos" (ex: Cabelo + Barba) como um serviço único para facilitar o agendamento e aumentar o ticket médio.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
