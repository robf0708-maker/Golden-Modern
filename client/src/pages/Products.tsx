import { useState } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Plus, Search, Package, AlertTriangle, Loader2, MoreVertical, Trash2, Edit } from "lucide-react";
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export default function Products() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    price: "",
    professionalPrice: "",
    cost: "",
    stock: "0",
    minStock: "5",
    hasCommission: false,
    commissionPercentage: "10",
    active: true,
  });

  const { data: products = [], isLoading } = useProducts();
  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();
  const deleteMutation = useDeleteProduct();
  const { toast } = useToast();

  const resetForm = () => {
    setFormData({
      name: "", category: "", price: "", professionalPrice: "", cost: "", stock: "0", minStock: "5",
      hasCommission: false, commissionPercentage: "10", active: true,
    });
    setEditingProduct(null);
  };

  const openEditDialog = (product: any) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      category: product.category || "",
      price: product.price,
      professionalPrice: product.professionalPrice || "",
      cost: product.cost || "",
      stock: product.stock.toString(),
      minStock: product.minStock.toString(),
      hasCommission: product.hasCommission,
      commissionPercentage: product.commissionPercentage || "10",
      active: product.active,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        price: formData.price,
        professionalPrice: formData.professionalPrice || null,
        cost: formData.cost || null,
        stock: parseInt(formData.stock),
        minStock: parseInt(formData.minStock),
        commissionPercentage: formData.hasCommission ? formData.commissionPercentage : null,
      };

      if (editingProduct) {
        await updateMutation.mutateAsync({ id: editingProduct.id, ...data });
        toast({ title: "Produto atualizado com sucesso!" });
      } else {
        await createMutation.mutateAsync(data);
        toast({ title: "Produto cadastrado com sucesso!" });
      }
      setIsDialogOpen(false);
      resetForm();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async (product: any) => {
    if (confirm(`Tem certeza que deseja excluir ${product.name}?`)) {
      try {
        await deleteMutation.mutateAsync(product.id);
        toast({ title: "Produto excluído com sucesso!" });
      } catch (error: any) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
      }
    }
  };

  const filteredProducts = products.filter((p: any) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.category && p.category.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const lowStockProducts = products.filter((p: any) => p.stock <= p.minStock && p.active);

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
            <h1 className="text-3xl font-serif font-bold text-foreground">Produtos</h1>
            <p className="text-muted-foreground">Gerencie seu estoque de produtos para venda.</p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-product" className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="mr-2 h-4 w-4" /> Novo Produto
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingProduct ? "Editar Produto" : "Cadastrar Produto"}</DialogTitle>
                <DialogDescription>
                  {editingProduct ? "Atualize os dados do produto." : "Adicione um novo produto ao estoque."}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-product">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label htmlFor="name">Nome do Produto</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Pomada Modeladora"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="category">Categoria</Label>
                    <Input
                      id="category"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      placeholder="Finalizadores"
                    />
                  </div>
                  <div>
                    <Label htmlFor="price">Preço de Venda (R$)</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      placeholder="45.00"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="professionalPrice">Preço p/ Profissional (R$)</Label>
                    <Input
                      id="professionalPrice"
                      type="number"
                      step="0.01"
                      value={formData.professionalPrice}
                      onChange={(e) => setFormData({ ...formData, professionalPrice: e.target.value })}
                      placeholder="30.00"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">Valor cobrado quando o barbeiro compra</p>
                  </div>
                  <div>
                    <Label htmlFor="cost">Preço de Custo (R$)</Label>
                    <Input
                      id="cost"
                      type="number"
                      step="0.01"
                      value={formData.cost}
                      onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                      placeholder="25.00"
                    />
                  </div>
                  <div>
                    <Label htmlFor="stock">Estoque Atual</Label>
                    <Input
                      id="stock"
                      type="number"
                      value={formData.stock}
                      onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                      placeholder="10"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="minStock">Estoque Mínimo</Label>
                    <Input
                      id="minStock"
                      type="number"
                      value={formData.minStock}
                      onChange={(e) => setFormData({ ...formData, minStock: e.target.value })}
                      placeholder="5"
                      required
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-4">
                  <div>
                    <Label htmlFor="hasCommission">Gera Comissão</Label>
                    <p className="text-xs text-muted-foreground">Barbeiro recebe comissão por venda</p>
                  </div>
                  <Switch
                    id="hasCommission"
                    checked={formData.hasCommission}
                    onCheckedChange={(checked) => setFormData({ ...formData, hasCommission: checked })}
                  />
                </div>
                {formData.hasCommission && (
                  <div>
                    <Label htmlFor="commissionPercentage">Percentual de Comissão (%)</Label>
                    <Input
                      id="commissionPercentage"
                      type="number"
                      step="0.01"
                      value={formData.commissionPercentage}
                      onChange={(e) => setFormData({ ...formData, commissionPercentage: e.target.value })}
                      placeholder="10"
                    />
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
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {(createMutation.isPending || updateMutation.isPending) ? "Salvando..." : (editingProduct ? "Atualizar" : "Cadastrar")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {lowStockProducts.length > 0 && (
          <Card className="border-orange-500/30 bg-orange-500/5">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              <div>
                <p className="font-medium text-orange-400">Alerta de Estoque Baixo</p>
                <p className="text-sm text-muted-foreground">
                  {lowStockProducts.length} produto(s) com estoque abaixo do mínimo: {lowStockProducts.map((p: any) => p.name).join(", ")}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar produtos..."
            className="pl-10 bg-card border-border"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredProducts.map((product: any) => (
            <Card key={product.id} className={`group hover:border-primary/50 transition-colors bg-card/50 backdrop-blur-sm ${!product.active ? 'opacity-60' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-500">
                    <Package className="w-5 h-5" />
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-card border-border">
                      <DropdownMenuItem onClick={() => openEditDialog(product)}>
                        <Edit className="w-4 h-4 mr-2" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(product)}>
                        <Trash2 className="w-4 h-4 mr-2" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <h3 className="font-bold text-foreground">{product.name}</h3>
                <p className="text-xs text-muted-foreground mb-2">{product.category || "Sem categoria"}</p>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-lg text-primary">R$ {parseFloat(product.price).toFixed(2)}</span>
                  <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${product.stock <= product.minStock ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                    <div className={`w-2 h-2 rounded-full ${product.stock <= product.minStock ? 'bg-red-500' : 'bg-green-500'}`} />
                    {product.stock} em estoque
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredProducts.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p>Nenhum produto cadastrado ainda.</p>
            <p className="text-sm mt-1">Clique em "Novo Produto" para começar.</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
