import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Search, 
  Trash2, 
  Plus, 
  Minus, 
  CreditCard, 
  Banknote, 
  QrCode,
  User,
  ShoppingBag,
  Scissors,
  Package,
  Check,
  X,
  Percent,
  Tag,
  AlertTriangle
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useServices, useProducts, usePackages, useClients, useBarbers, useCreateComanda, useClientPackages, useClientPackageUse, useOpenComandas, useAddComandaItem, useUpdateComanda } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Gift, Clock, FileText, RefreshCw } from "lucide-react";

interface CartItem {
  id: string;
  originalId: string;
  name: string;
  price: number;
  type: 'service' | 'product' | 'package' | 'package_use' | 'subscription_sale';
  quantity: number;
  barberId?: string;
  barberName?: string;
  usedPackage?: boolean;
  clientPackageId?: string;
  packageValue?: number; // valor proporcional do pacote (preço/usos) para cálculo de comissão
  isBarberPurchase?: boolean; // true = produto comprado pelo barbeiro, não gera comissão e desconta
  originalPrice?: number; // preço original quando é compra do barbeiro (price fica 0 na comanda)
  // Campos de desconto por item
  discountType?: 'percentage' | 'fixed'; // tipo de desconto
  discountValue?: number; // valor ou percentual do desconto
  discountAmount?: number; // valor calculado do desconto em reais
  // ID do item no banco - se existir, significa que já está salvo (não precisa criar novamente)
  existingItemId?: string;
  // Campos específicos para assinaturas
  isRecurring?: boolean; // true = é um plano recorrente (assinatura)
  recurringInterval?: string; // monthly, weekly, biweekly
}

export default function POS() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [clientSearchTerm, setClientSearchTerm] = useState("");
  const [isClientDialogOpen, setIsClientDialogOpen] = useState(false);
  const [isBarberDialogOpen, setIsBarberDialogOpen] = useState(false);
  const [pendingItem, setPendingItem] = useState<any>(null);
  const [isCheckoutDialogOpen, setIsCheckoutDialogOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [discount, setDiscount] = useState(0);
  const [comandaDiscountType, setComandaDiscountType] = useState<'percentage' | 'fixed'>('fixed');
  const [surcharge, setSurcharge] = useState(0);
  const [receivedAmount, setReceivedAmount] = useState<string>("");
  const [isSplitPayment, setIsSplitPayment] = useState(false);
  const [splitPayments, setSplitPayments] = useState<{method: string, amount: number}[]>([]);
  const [isUsePackageDialogOpen, setIsUsePackageDialogOpen] = useState(false);
  const [selectedClientPackage, setSelectedClientPackage] = useState<any>(null);
  const [linkedAppointmentId, setLinkedAppointmentId] = useState<string | null>(null);
  const [defaultBarber, setDefaultBarber] = useState<any>(null); // Profissional padrão para comanda avulsa
  const [isBarberPurchaseMode, setIsBarberPurchaseMode] = useState(false);
  const [isDiscountDialogOpen, setIsDiscountDialogOpen] = useState(false);
  const [discountItem, setDiscountItem] = useState<CartItem | null>(null);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountInputValue, setDiscountInputValue] = useState<string>('');
  const [editingComanda, setEditingComanda] = useState<any>(null);
  const [isOpenComandasDialogOpen, setIsOpenComandasDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: services = [] } = useServices();
  const { data: products = [] } = useProducts();
  const { data: packages = [] } = usePackages();
  const { data: clients = [] } = useClients();
  const { data: barbers = [] } = useBarbers();
  const { data: allClientPackages = [], refetch: refetchClientPackages } = useClientPackages();
  const usePackageMutation = useClientPackageUse();
  const { data: openComandas = [], refetch: refetchOpenComandas } = useOpenComandas();

  const todayComandas = openComandas.filter((c: any) => {
    const created = new Date(c.createdAt);
    const today = new Date();
    return created.toDateString() === today.toDateString();
  });

  const oldComandas = openComandas.filter((c: any) => {
    const created = new Date(c.createdAt);
    const today = new Date();
    return created.toDateString() !== today.toDateString();
  });

  const hasOldComandas = oldComandas.length > 0;

  const addComandaItemMutation = useAddComandaItem();
  const updateComandaMutation = useUpdateComanda();
  
  const { data: barbershop } = useQuery({
    queryKey: ['/api/barbershop'],
    queryFn: async () => {
      const res = await fetch('/api/barbershop', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch barbershop');
      return res.json();
    },
  });

  const activeServices = services.filter((s: any) => s.active);
  const activeProducts = products.filter((p: any) => p.active);
  const activePackages = packages.filter((p: any) => p.active);
  const activeBarbers = barbers.filter((b: any) => b.active);

  const createComandaMutation = useCreateComanda();

  const getClientActivePackages = (clientId: string) => {
    if (!clientId) return [];
    const now = new Date();
    return allClientPackages.filter((cp: any) => 
      cp.clientId === clientId && 
      cp.quantityRemaining > 0 && 
      new Date(cp.expiresAt) > now
    );
  };

  const getPackageForService = (serviceId: string) => {
    if (!selectedClient) return null;
    const clientPkgs = getClientActivePackages(selectedClient.id);
    for (const cp of clientPkgs) {
      const pkg = packages.find((p: any) => p.id === cp.packageId);
      if (pkg && pkg.serviceId === serviceId) {
        return { clientPackage: cp, package: pkg };
      }
    }
    return null;
  };

  // Conta quantos usos de um clientPackageId estão pendentes no carrinho (soma as quantidades)
  const getPendingUsesInCart = (clientPackageId: string) => {
    return cart
      .filter(item => item.type === 'package_use' && item.clientPackageId === clientPackageId)
      .reduce((acc, item) => acc + item.quantity, 0);
  };

  // Calcula usos disponíveis considerando os já no carrinho
  const getAvailableUses = (clientPackage: any) => {
    const pendingUses = getPendingUsesInCart(clientPackage.id);
    return clientPackage.quantityRemaining - pendingUses;
  };

  useEffect(() => {
    const processPrefilledData = async () => {
      const prefilledData = localStorage.getItem('posPrefilledData');
      if (prefilledData && clients.length > 0 && services.length > 0 && barbers.length > 0 && allClientPackages !== undefined) {
        try {
          const data = JSON.parse(prefilledData);
          
          const client = clients.find((c: any) => c.id === data.clientId);
          const service = services.find((s: any) => s.id === data.serviceId);
          const barber = barbers.find((b: any) => b.id === data.barberId);
          
          // Se cliente já tem comanda aberta, carregar essa comanda
          if (data.existingComandaId && client) {
            let existingComanda = openComandas.find((c: any) => c.id === data.existingComandaId);
            
            // Se não encontrou nos openComandas carregados, buscar diretamente
            if (!existingComanda) {
              try {
                const response = await fetch(`/api/comandas/client/${client.id}/open`, { credentials: 'include' });
                if (response.ok) {
                  existingComanda = await response.json();
                }
              } catch (e) {
                console.error('Erro ao buscar comanda existente:', e);
              }
            }
            
            if (existingComanda) {
              setSelectedClient(client);
              setEditingComanda(existingComanda);
              setLinkedAppointmentId(data.appointmentId || null);
              
              // Carregar desconto e acréscimo da comanda existente
              const savedDiscount = existingComanda.discount ? parseFloat(existingComanda.discount) : 0;
              const savedSurcharge = existingComanda.surcharge ? parseFloat(existingComanda.surcharge) : 0;
              setDiscount(savedDiscount);
              setComandaDiscountType('fixed');
              setSurcharge(savedSurcharge);
              
              // Converter itens salvos da comanda para o formato do carrinho
              if (existingComanda.items && Array.isArray(existingComanda.items) && existingComanda.items.length > 0) {
                const cartItems: CartItem[] = existingComanda.items.map((item: any) => {
                  let originalId = item.serviceId || item.productId || item.id;
                  let name = item.name || 'Item';
                  // Usar unitPrice do banco se disponível, senão tentar price
                  let price = parseFloat(item.unitPrice) || parseFloat(item.price) || 0;
                  
                  if (item.type === 'package_use' && item.serviceId) {
                    const svc = services.find((s: any) => s.id === item.serviceId);
                    if (svc) name = svc.name;
                  }
                  
                  return {
                    id: `${item.type}_${originalId}_${Date.now()}_${Math.random()}`,
                    originalId: originalId,
                    name: name,
                    price: price,
                    type: item.type as 'service' | 'product' | 'package' | 'package_use' | 'subscription_sale',
                    quantity: item.quantity || 1,
                    barberId: item.barberId || undefined,
                    barberName: item.barberName || undefined,
                    usedPackage: item.type === 'package_use',
                    clientPackageId: item.clientPackageId || undefined,
                    packageValue: item.packageValue ? parseFloat(item.packageValue) : undefined,
                    isBarberPurchase: item.isBarberPurchase || false,
                    isRecurring: item.isRecurring || false,
                    recurringInterval: item.recurringInterval || undefined,
                    originalPrice: item.originalPrice ? parseFloat(item.originalPrice) : undefined,
                    discountType: item.discountType || undefined,
                    discountValue: item.discountValue ? parseFloat(item.discountValue) : undefined,
                    discountAmount: item.discountAmount ? parseFloat(item.discountAmount) : undefined,
                    existingItemId: item.id, // Marcar como item existente no banco
                  };
                });
                setCart(cartItems);
              } else {
                setCart([]);
              }
              
              localStorage.removeItem('posPrefilledData');
              refetchOpenComandas();
              const itemCount = existingComanda.items?.length || 0;
              toast({ 
                title: "Comanda existente carregada", 
                description: itemCount > 0 
                  ? `Comanda carregada com ${itemCount} item(s).`
                  : "Adicione novos itens à comanda em espera."
              });
              return;
            }
          }
          
          if (client && service && barber) {
          setSelectedClient(client);
          
          // Armazenar appointmentId se veio da agenda
          if (data.appointmentId) {
            setLinkedAppointmentId(data.appointmentId);
          }
          
          // Se o agendamento veio com pacote específico, usar automaticamente esse pacote
          // (comportamento original para agendamentos com pacote)
          if (data.usedPackage && data.clientPackageId) {
            const clientPkg = allClientPackages.find((cp: any) => cp.id === data.clientPackageId);
            if (clientPkg) {
              const pkg = packages.find((p: any) => p.id === clientPkg.packageId);
              if (pkg) {
                // Adicionar o serviço do pacote
                // Usar valor líquido (netAmount) se disponível, senão usar valor bruto
                const baseAmount = clientPkg.netAmount ? parseFloat(clientPkg.netAmount) : parseFloat(pkg.price);
                const pricePerUse = baseAmount / pkg.quantity;
                const cartItems: CartItem[] = [{
                  id: `package_use-${service.id}-${barber.id}-${Date.now()}`,
                  originalId: service.id,
                  name: service.name,
                  price: 0,
                  type: 'package_use',
                  quantity: 1,
                  barberId: barber.id,
                  barberName: barber.name,
                  usedPackage: true,
                  clientPackageId: clientPkg.id,
                  packageValue: pricePerUse
                }];
                
                // Adicionar serviços adicionais como serviços normais
                if (data.allServiceIds && data.allServiceIds.length > 1) {
                  for (const svcId of data.allServiceIds) {
                    if (svcId === service.id) continue; // Já adicionado como pacote
                    const svc = services.find((s: any) => s.id === svcId);
                    if (svc) {
                      cartItems.push({
                        id: `service-${svc.id}-${barber.id}-${Date.now()}-${Math.random()}`,
                        originalId: svc.id,
                        name: svc.name,
                        price: parseFloat(svc.price),
                        type: 'service',
                        quantity: 1,
                        barberId: barber.id,
                        barberName: barber.name
                      });
                    }
                  }
                }
                
                setCart(cartItems);
                setPrefilledBarber(null);
                localStorage.removeItem('posPrefilledData');
                toast({ 
                  title: "Pacote do agendamento aplicado!", 
                  description: cartItems.length > 1 
                    ? `Pacote "${pkg.name}" + ${cartItems.length - 1} serviço(s) adicional(is).`
                    : `Uso do pacote "${pkg.name}" adicionado automaticamente.`
                });
                return;
              }
            }
          }
          
          // Verificar se o cliente tem pacote para o serviço principal (apenas para um serviço)
          const now = new Date();
          const clientPkgs = allClientPackages.filter((cp: any) => 
            cp.clientId === client.id && 
            cp.quantityRemaining > 0 && 
            new Date(cp.expiresAt) > now
          );
          
          let pkgInfo = null;
          for (const cp of clientPkgs) {
            const pkg = packages.find((p: any) => p.id === cp.packageId);
            if (pkg && pkg.serviceId === service.id) {
              pkgInfo = { clientPackage: cp, package: pkg };
              break;
            }
          }
          
          // Se há apenas um serviço e tem pacote, perguntar ao usuário (comportamento original)
          const hasMultipleServices = data.allServiceIds && data.allServiceIds.length > 1;
          if (!hasMultipleServices && pkgInfo) {
            setPendingItem({ ...service, type: 'service' });
            setPendingPackageInfo(pkgInfo);
            setPrefilledBarber(barber);
            setUsePackageOption(true);
            setIsBarberDialogOpen(true);
            localStorage.removeItem('posPrefilledData');
            toast({ 
              title: "Cliente tem pacote disponível!", 
              description: `${pkgInfo.package.name}: ${pkgInfo.clientPackage.quantityRemaining} usos restantes. Escolha usar o pacote ou cobrar normal.`
            });
            return;
          }
          
          // Adicionar todos os serviços como serviços normais
          // (usuário pode trocar por pacote manualmente no POS se desejar)
          const serviceIdsToAdd = data.allServiceIds && data.allServiceIds.length > 0 
            ? data.allServiceIds 
            : [service.id];
          
          const cartItems: CartItem[] = [];
          for (const svcId of serviceIdsToAdd) {
            const svc = services.find((s: any) => s.id === svcId);
            if (svc) {
              cartItems.push({
                id: `service-${svc.id}-${barber.id}-${Date.now()}-${Math.random()}`,
                originalId: svc.id,
                name: svc.name,
                price: parseFloat(svc.price),
                type: 'service',
                quantity: 1,
                barberId: barber.id,
                barberName: barber.name
              });
            }
          }
          
          setCart(cartItems);
          setPrefilledBarber(null);
          setDefaultBarber(null); // Reset defaultBarber quando carrega agendamento
          localStorage.removeItem('posPrefilledData');
          toast({ 
            title: "Comanda carregada do agendamento!", 
            description: cartItems.length > 1 ? `${cartItems.length} serviços adicionados.` : undefined
          });
        }
        } catch (e) {
          console.error('Error loading prefilled data:', e);
          localStorage.removeItem('posPrefilledData');
        }
      }
    };
    processPrefilledData();
  }, [clients, services, barbers, allClientPackages, packages, openComandas]);

  const filteredClients = clients.filter((c: any) => 
    c.name.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
    c.phone?.toLowerCase().includes(clientSearchTerm.toLowerCase())
  );

  const [usePackageOption, setUsePackageOption] = useState(false);
  const [pendingPackageInfo, setPendingPackageInfo] = useState<any>(null);
  const [prefilledBarber, setPrefilledBarber] = useState<any>(null);

  const { data: cashRegister } = useQuery({
    queryKey: ['/cash-register/current'],
    queryFn: async () => {
      const res = await fetch('/api/cash-register/current', { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const isRegisterOverdue = () => {
    if (!cashRegister || cashRegister.status !== 'open') return false;
    const openedAt = new Date(cashRegister.openedAt);
    const now = new Date();
    return openedAt.toDateString() !== now.toDateString();
  };

  const checkRegisterBeforeAction = () => {
    if (!cashRegister || cashRegister.status !== 'open') {
      toast({
        title: "Caixa Fechado",
        description: "Abra o caixa para iniciar as operações do dia.",
        variant: "destructive"
      });
      return false;
    }
    if (isRegisterOverdue()) {
      toast({
        title: "Caixa Vencido",
        description: "Este caixa é de um dia anterior. Você precisa fechá-lo e abrir um novo para hoje antes de continuar.",
        variant: "destructive"
      });
      return false;
    }
    if (hasOldComandas) {
      toast({
        title: "Comandas Antigas Pendentes",
        description: "Existem comandas de dias anteriores que precisam ser finalizadas ou canceladas antes de criar novas.",
        variant: "destructive"
      });
      return false;
    }
    return true;
  };

  const addServiceToCart = (service: any) => {
    if (!checkRegisterBeforeAction()) return;
    const pkgInfo = getPackageForService(service.id);
    if (pkgInfo) {
      setPendingPackageInfo(pkgInfo);
      setUsePackageOption(true);
    } else {
      setPendingPackageInfo(null);
      setUsePackageOption(false);
    }
    
    // Se tem defaultBarber, não tem pacote disponível e não é comanda de agendamento, adiciona direto sem diálogo
    if (defaultBarber && !pkgInfo && !linkedAppointmentId) {
      const cartItem: CartItem = {
        id: `service-${service.id}-${defaultBarber.id}-${Date.now()}`,
        originalId: service.id,
        name: service.name,
        price: parseFloat(service.price),
        type: 'service',
        quantity: 1,
        barberId: defaultBarber.id,
        barberName: defaultBarber.name
      };
      setCart([...cart, cartItem]);
      toast({ title: "Serviço adicionado", description: `${service.name} para ${defaultBarber.name}` });
      return;
    }
    
    setPendingItem({ ...service, type: 'service' });
    setIsBarberDialogOpen(true);
  };

  const confirmAddService = (barberId: string, usePackage: boolean = false) => {
    if (!pendingItem) return;
    const barber = activeBarbers.find((b: any) => b.id === barberId);
    
    if (usePackage && pendingPackageInfo) {
      // Verificar se ainda há usos disponíveis considerando os já no carrinho
      const availableUses = getAvailableUses(pendingPackageInfo.clientPackage);
      if (availableUses <= 0) {
        toast({ 
          title: "Sem usos disponíveis", 
          description: "Todos os usos deste pacote já foram adicionados ao carrinho", 
          variant: "destructive" 
        });
        return;
      }
      
      // Calcular valor proporcional do pacote (preço/quantidade de usos)
      // Usar valor líquido (netAmount) se disponível, senão usar valor bruto
      const pkg = pendingPackageInfo.package;
      const clientPkg = pendingPackageInfo.clientPackage;
      const baseAmount = clientPkg.netAmount ? parseFloat(clientPkg.netAmount) : parseFloat(pkg.price);
      const packageValue = baseAmount / pkg.quantity;
      
      const cartItem: CartItem = {
        id: `package-use-${pendingItem.id}-${barberId}-${Date.now()}`,
        originalId: pendingItem.id,
        name: `${pendingItem.name} (Pacote)`,
        price: 0, // Cliente não paga nada na comanda
        type: 'package_use',
        quantity: 1,
        barberId,
        barberName: barber?.name,
        usedPackage: true,
        clientPackageId: pendingPackageInfo.clientPackage.id,
        packageValue // Valor para calcular comissão
      };
      
      setCart([...cart, cartItem]);
      toast({ 
        title: "Serviço de pacote adicionado!", 
        description: `Será descontado do pacote ao fechar a comanda` 
      });
    } else {
      const cartItem: CartItem = {
        id: `${pendingItem.type}-${pendingItem.id}-${barberId}-${Date.now()}`,
        originalId: pendingItem.id,
        name: pendingItem.name,
        price: parseFloat(pendingItem.price),
        type: 'service',
        quantity: 1,
        barberId,
        barberName: barber?.name
      };
      
      setCart([...cart, cartItem]);
    }
    
    setIsBarberDialogOpen(false);
    setPendingItem(null);
    setPendingPackageInfo(null);
    setUsePackageOption(false);
  };

  const confirmAddServiceLegacy = (barberId: string) => {
    if (!pendingItem) return;
    const barber = activeBarbers.find((b: any) => b.id === barberId);
    
    const cartItem: CartItem = {
      id: `${pendingItem.type}-${pendingItem.id}-${barberId}-${Date.now()}`,
      originalId: pendingItem.id,
      name: pendingItem.name,
      price: parseFloat(pendingItem.price),
      type: 'service',
      quantity: 1,
      barberId,
      barberName: barber?.name
    };
    
    setCart([...cart, cartItem]);
    setIsBarberDialogOpen(false);
    setPendingItem(null);
  };

  const addProductToCart = (product: any) => {
    if (!checkRegisterBeforeAction()) return;
    // Sempre abre o diálogo para permitir "Compra do Profissional" em qualquer produto
    setPendingItem({ ...product, type: 'product' });
    setIsBarberPurchaseMode(false); // Reseta o modo ao abrir
    setIsBarberDialogOpen(true);
  };

  const confirmAddProduct = (barberId: string | null, isBarberPurchase: boolean = false) => {
    if (!pendingItem) return;
    const barber = barberId ? activeBarbers.find((b: any) => b.id === barberId) : null;
    
    const salePrice = parseFloat(pendingItem.price);
    // Usar preço do profissional se existir e for compra do profissional, senão usa preço normal de venda
    const professionalPrice = pendingItem.professionalPrice ? parseFloat(pendingItem.professionalPrice) : salePrice;
    const priceForBarberPurchase = isBarberPurchase ? professionalPrice : salePrice;
    
    const cartItem: CartItem = {
      id: `product-${pendingItem.id}-${barberId || 'none'}-${isBarberPurchase ? 'purchase' : 'sale'}-${Date.now()}`,
      originalId: pendingItem.id,
      name: pendingItem.name,
      price: isBarberPurchase ? 0 : salePrice, // Preço 0 na comanda para compras do barbeiro (não conta no total)
      type: 'product',
      quantity: 1,
      barberId: barberId || undefined,
      barberName: barber?.name,
      isBarberPurchase: isBarberPurchase,
      originalPrice: isBarberPurchase ? priceForBarberPurchase : undefined // Preço que será descontado da comissão
    };
    
    setCart([...cart, cartItem]);
    setIsBarberDialogOpen(false);
    setIsBarberPurchaseMode(false);
    setPendingItem(null);
    
    if (isBarberPurchase) {
      toast({ 
        title: "Compra do Profissional", 
        description: `${pendingItem.name} (R$ ${priceForBarberPurchase.toFixed(2)}) será descontado da comissão de ${barber?.name}` 
      });
    }
  };

  const addPackageToCart = (pkg: any) => {
    if (!checkRegisterBeforeAction()) return;
    if (!selectedClient) {
      toast({ 
        title: "Selecione um cliente", 
        description: "Para vender um pacote, é necessário selecionar o cliente primeiro.", 
        variant: "destructive" 
      });
      setIsClientDialogOpen(true);
      return;
    }
    
    const cartItem: CartItem = {
      id: `package-${pkg.id}-${Date.now()}`,
      originalId: pkg.id,
      name: pkg.name,
      price: parseFloat(pkg.price),
      type: 'package',
      quantity: 1
    };
    
    setCart([...cart, cartItem]);
    toast({ title: "Pacote adicionado!", description: `${pkg.name} será vinculado ao cliente ${selectedClient.name}` });
  };

  const addSubscriptionToCart = (pkg: any) => {
    if (!checkRegisterBeforeAction()) return;
    if (!selectedClient) {
      toast({ 
        title: "Selecione um cliente", 
        description: "Para vender uma assinatura, é necessário selecionar o cliente primeiro.", 
        variant: "destructive" 
      });
      setIsClientDialogOpen(true);
      return;
    }
    
    // Verificar se cliente já tem uma assinatura ativa deste plano
    // (isso é verificado no backend, mas podemos avisar aqui também)
    
    const intervalLabel = pkg.recurringInterval === 'weekly' ? 'Semanal' : 
                          pkg.recurringInterval === 'biweekly' ? 'Quinzenal' : 'Mensal';
    
    const cartItem: CartItem = {
      id: `subscription-${pkg.id}-${Date.now()}`,
      originalId: pkg.id,
      name: `${pkg.name} (Assinatura ${intervalLabel})`,
      price: parseFloat(pkg.price),
      type: 'subscription_sale',
      quantity: 1,
      isRecurring: true,
      recurringInterval: pkg.recurringInterval || 'monthly'
    };
    
    setCart([...cart, cartItem]);
    toast({ 
      title: "Assinatura adicionada!", 
      description: `Plano ${pkg.name} será ativado para ${selectedClient.name} ao fechar a comanda.` 
    });
  };

  const openUsePackageDialog = (clientPackage: any) => {
    if (!checkRegisterBeforeAction()) return;
    if (!selectedClient) {
      toast({ 
        title: "Erro", 
        description: "Selecione um cliente primeiro", 
        variant: "destructive" 
      });
      return;
    }
    setSelectedClientPackage(clientPackage);
    setIsUsePackageDialogOpen(true);
  };

  const confirmUsePackage = (barberId: string) => {
    if (!selectedClientPackage) return;
    
    const barber = activeBarbers.find((b: any) => b.id === barberId);
    const pkg = packages.find((p: any) => p.id === selectedClientPackage.packageId);
    const service = services.find((s: any) => s.id === pkg?.serviceId);
    
    if (!pkg || !service) {
      toast({ title: "Erro", description: "Pacote ou serviço não encontrado", variant: "destructive" });
      return;
    }
    
    // Verificar se ainda há usos disponíveis considerando os já no carrinho
    const availableUses = getAvailableUses(selectedClientPackage);
    if (availableUses <= 0) {
      toast({ 
        title: "Sem usos disponíveis", 
        description: "Todos os usos deste pacote já foram adicionados ao carrinho", 
        variant: "destructive" 
      });
      setIsUsePackageDialogOpen(false);
      return;
    }
    
    // Calcular valor proporcional do pacote (preço/quantidade de usos)
    // Usar valor líquido (netAmount) se disponível, senão usar valor bruto
    const baseAmount = selectedClientPackage.netAmount ? parseFloat(selectedClientPackage.netAmount) : parseFloat(pkg.price);
    const packageValue = baseAmount / pkg.quantity;
    
    const cartItem: CartItem = {
      id: `package-use-${service.id}-${barberId}-${Date.now()}`,
      originalId: service.id,
      name: `${service.name} (Pacote)`,
      price: 0, // Cliente não paga nada na comanda
      type: 'package_use',
      quantity: 1,
      barberId,
      barberName: barber?.name,
      usedPackage: true,
      clientPackageId: selectedClientPackage.id,
      packageValue // Valor para calcular comissão
    };
    
    setCart([...cart, cartItem]);
    setIsUsePackageDialogOpen(false);
    setSelectedClientPackage(null);
    
    toast({ 
      title: "Serviço de pacote adicionado!", 
      description: `${service.name} será descontado do pacote ao fechar a comanda` 
    });
  };

  const removeFromCart = (id: string) => {
    setCart(cart.filter(i => i.id !== id));
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(cart.map(i => {
      if (i.id === id) {
        const newQ = i.quantity + delta;
        if (newQ <= 0) return i;
        // Recalcular desconto ao mudar quantidade
        if (i.discountType && i.discountValue) {
          const itemTotal = i.price * newQ;
          const discountAmount = i.discountType === 'percentage' 
            ? (itemTotal * i.discountValue) / 100 
            : Math.min(i.discountValue, itemTotal);
          return { ...i, quantity: newQ, discountAmount };
        }
        return { ...i, quantity: newQ };
      }
      return i;
    }));
  };

  // Função para abrir o modal de desconto
  const openDiscountDialog = (item: CartItem) => {
    setDiscountItem(item);
    setDiscountType(item.discountType || 'percentage');
    setDiscountInputValue(item.discountValue?.toString() || '');
    setIsDiscountDialogOpen(true);
  };

  // Função para aplicar desconto a um item
  const applyItemDiscount = () => {
    if (!discountItem) return;
    
    const value = parseFloat(discountInputValue);
    if (isNaN(value) || value < 0) {
      toast({ title: "Valor de desconto inválido", variant: "destructive" });
      return;
    }

    const itemTotal = discountItem.price * discountItem.quantity;
    let discountAmount: number;
    
    if (discountType === 'percentage') {
      if (value > 100) {
        toast({ title: "Percentual não pode ser maior que 100%", variant: "destructive" });
        return;
      }
      discountAmount = (itemTotal * value) / 100;
    } else {
      if (value > itemTotal) {
        toast({ title: "Desconto não pode ser maior que o valor do item", variant: "destructive" });
        return;
      }
      discountAmount = value;
    }

    setCart(cart.map(i => {
      if (i.id === discountItem.id) {
        return {
          ...i,
          discountType,
          discountValue: value,
          discountAmount
        };
      }
      return i;
    }));

    setIsDiscountDialogOpen(false);
    setDiscountItem(null);
    setDiscountInputValue('');
    toast({ title: "Desconto aplicado!" });
  };

  // Função para remover desconto de um item
  const removeItemDiscount = (itemId: string) => {
    setCart(cart.map(i => {
      if (i.id === itemId) {
        return {
          ...i,
          discountType: undefined,
          discountValue: undefined,
          discountAmount: undefined
        };
      }
      return i;
    }));
  };

  // Calcula o preço final de um item (com desconto aplicado)
  const getItemFinalPrice = (item: CartItem): number => {
    const itemTotal = item.price * item.quantity;
    return itemTotal - (item.discountAmount || 0);
  };

  // Subtotal considera os descontos por item
  const subtotal = cart.reduce((acc, item) => acc + getItemFinalPrice(item), 0);
  
  // Calcular desconto da comanda (pode ser porcentagem ou valor fixo)
  const calculatedDiscount = comandaDiscountType === 'percentage' 
    ? (subtotal * discount) / 100 
    : discount;
  
  const total = Math.max(0, subtotal - calculatedDiscount + surcharge);
  
  // Verificar se a comanda é apenas de uso de pacote (não precisa de pagamento)
  const isOnlyPackageUse = cart.length > 0 && cart.every(item => item.type === 'package_use');
  
  // Calcular taxa de pagamento baseado no método selecionado
  const calculatePaymentFee = (): { feeAmount: number, feePercent: number, netAmount: number } => {
    if (!barbershop || total <= 0) return { feeAmount: 0, feePercent: 0, netAmount: total };
    
    let feePercent = 0;
    
    if (isSplitPayment) {
      // Para pagamento dividido, calcular taxa de cada método
      let totalFee = 0;
      for (const payment of splitPayments) {
        let splitFeePercent = 0;
        if (payment.method === 'card') {
          splitFeePercent = parseFloat(barbershop.feeCredit || '0');
        } else if (payment.method === 'pix') {
          splitFeePercent = parseFloat(barbershop.feePix || '0');
        }
        totalFee += (payment.amount * splitFeePercent) / 100;
      }
      return { feeAmount: totalFee, feePercent: 0, netAmount: total - totalFee };
    }
    
    if (paymentMethod === 'card') {
      feePercent = parseFloat(barbershop.feeCredit || '0');
    } else if (paymentMethod === 'pix') {
      feePercent = parseFloat(barbershop.feePix || '0');
    }
    
    const feeAmount = (total * feePercent) / 100;
    return { feeAmount, feePercent, netAmount: total - feeAmount };
  };
  
  const { feeAmount: paymentFeeAmount, feePercent: paymentFeePercent, netAmount } = calculatePaymentFee();

  // Fator de ajuste da comanda (desconto ou acréscimo)
  // Se subtotal=60, desconto=15, total=45 → fator = 45/60 = 0.75
  // Se subtotal=60, acrescimo=15, total=75 → fator = 75/60 = 1.25
  const comandaAdjustmentFactor = subtotal > 0 ? total / subtotal : 1;

  const calculateCommission = (item: CartItem): number => {
    if (!item.barberId) {
      console.log('[COMISSÃO DEBUG] Sem barberId:', item);
      return 0;
    }
    
    const barber = activeBarbers.find((b: any) => b.id === item.barberId);
    if (!barber) {
      console.log('[COMISSÃO DEBUG] Barbeiro não encontrado:', item.barberId, 'activeBarbers:', activeBarbers.length);
      return 0;
    }

    // Calcular o fator de desconto do ITEM para aplicar proporcionalmente à comissão
    const itemTotal = item.price * item.quantity;
    const finalPrice = getItemFinalPrice(item);
    const itemDiscountFactor = itemTotal > 0 ? finalPrice / itemTotal : 1;
    
    // Para package_use, NÃO aplicar comandaAdjustmentFactor (já é valor fixo do pacote)
    // Para outros itens, aplicar itemDiscountFactor E comandaAdjustmentFactor
    const isPackageUse = item.type === 'package_use';
    const discountFactor = isPackageUse ? itemDiscountFactor : (itemDiscountFactor * comandaAdjustmentFactor);

    // Debug para package_use
    if (item.type === 'package_use') {
      console.log('[COMISSÃO DEBUG] package_use item:', {
        type: item.type,
        packageValue: item.packageValue,
        barberId: item.barberId,
        barberCommissionType: barber.commissionType,
        barberCommissionValue: barber.commissionValue
      });
    }

    if (item.type === 'product') {
      const product = activeProducts.find((p: any) => p.id === item.originalId);
      if (product?.hasCommission && product.commissionPercentage) {
        // Comissão proporcional ao valor com desconto do item E da comanda
        return (finalPrice * parseFloat(product.commissionPercentage) * comandaAdjustmentFactor) / 100;
      }
      return 0;
    }

    // Para package_use, usar o valor proporcional do pacote (preço/usos)
    // Em vez do preço cheio do serviço
    let servicePrice: number;
    if (item.type === 'package_use' && item.packageValue !== undefined) {
      // Usar valor proporcional do pacote (package_use não é afetado por desconto da comanda)
      servicePrice = item.packageValue;
    } else {
      // Usar preço final (com desconto do item) para calcular comissão
      servicePrice = finalPrice / item.quantity;
    }
    
    const service = activeServices.find((s: any) => s.id === item.originalId);
    
    if (service?.commissionType && service.commissionValue) {
      if (service.commissionType === 'percentage') {
        // Comissão proporcional ao valor com desconto do item E da comanda (já aplicado em servicePrice via discountFactor logic)
        // Para package_use, comandaAdjustmentFactor não é aplicado; para outros itens, é aplicado
        const adjustmentFactor = isPackageUse ? 1 : comandaAdjustmentFactor;
        return (servicePrice * item.quantity * parseFloat(service.commissionValue) * adjustmentFactor) / 100;
      } else {
        // Para valor fixo, aplicar proporção do desconto
        if (item.type === 'package_use' && item.packageValue !== undefined) {
          const originalPrice = parseFloat(service.price);
          const proportion = item.packageValue / originalPrice;
          return parseFloat(service.commissionValue) * item.quantity * proportion * discountFactor;
        }
        return parseFloat(service.commissionValue) * item.quantity * discountFactor;
      }
    }
    
    if (barber.commissionType === 'percentage') {
      // Comissão proporcional ao valor com desconto do item E da comanda
      const adjustmentFactor = isPackageUse ? 1 : comandaAdjustmentFactor;
      const commission = (servicePrice * item.quantity * parseFloat(barber.commissionValue) * adjustmentFactor) / 100;
      console.log('[COMISSÃO DEBUG] Calculando comissão percentage:', {
        servicePrice,
        quantity: item.quantity,
        commissionValue: barber.commissionValue,
        comandaAdjustmentFactor: adjustmentFactor,
        result: commission
      });
      return commission;
    } else {
      // Para valor fixo, aplicar proporção do desconto
      if (item.type === 'package_use' && item.packageValue !== undefined) {
        const service = activeServices.find((s: any) => s.id === item.originalId);
        if (service) {
          const originalPrice = parseFloat(service.price);
          const proportion = item.packageValue / originalPrice;
          return parseFloat(barber.commissionValue) * item.quantity * proportion * discountFactor;
        }
      }
      return parseFloat(barber.commissionValue) * item.quantity * discountFactor;
    }
  };

  const totalCommission = cart
    .filter(item => (item.type === 'service' || item.type === 'product' || item.type === 'package_use') && item.barberId && !item.isBarberPurchase)
    .reduce((acc, item) => acc + calculateCommission(item), 0);

  const handleCheckout = async () => {
    if (!checkRegisterBeforeAction()) return;
    // Verificar se há itens que não são compra do profissional (vendas normais)
    const hasNormalSales = cart.some(item => !item.isBarberPurchase);
    
    // Cliente é obrigatório apenas se houver vendas normais
    if (hasNormalSales && !selectedClient) {
      toast({ title: "Cliente obrigatório", description: "Selecione um cliente para fechar a comanda", variant: "destructive" });
      return;
    }

    // Para uso de pacote apenas, não precisa de forma de pagamento (já foi pago)
    // Para outros casos, forma de pagamento é obrigatória
    if (!isOnlyPackageUse && !paymentMethod && !isSplitPayment) {
      toast({ title: "Selecione a forma de pagamento", variant: "destructive" });
      return;
    }

    if (isSplitPayment) {
      const splitTotal = splitPayments.reduce((acc, p) => acc + p.amount, 0);
      if (Math.abs(splitTotal - total) > 0.01) {
        toast({ title: "Erro", description: `O total dos pagamentos (R$ ${splitTotal.toFixed(2)}) deve ser igual ao total da comanda (R$ ${total.toFixed(2)})`, variant: "destructive" });
        return;
      }
    }

    try {
      // Desconto de pacotes é feito atomicamente no backend ao criar a comanda
      
      const items = cart.map(item => {
        const commission = item.barberId && !item.isBarberPurchase ? calculateCommission(item) : 0;
        console.log('[COMANDA DEBUG] Item para checkout:', {
          type: item.type,
          itemId: item.originalId,
          barberId: item.barberId,
          packageValue: item.packageValue,
          commission: commission
        });
        return {
          type: item.type,
          itemId: item.originalId,
          quantity: item.quantity,
          unitPrice: item.price,
          barberId: item.barberId || null,
          commission: commission,
          clientPackageId: item.clientPackageId || null,
          packageValue: item.packageValue || null,
          isBarberPurchase: item.isBarberPurchase || false,
          originalPrice: item.originalPrice || null, // Preço original para compras do barbeiro
          // Campos de desconto por item
          discountType: item.discountType || null,
          discountValue: item.discountValue?.toString() || null,
          discountAmount: item.discountAmount?.toString() || null
        };
      });

      const paymentDetails = isSplitPayment ? {
        split: splitPayments
      } : (paymentMethod === 'cash' ? {
        received: parseFloat(receivedAmount) || total,
        change: Math.max(0, (parseFloat(receivedAmount) || total) - total)
      } : null);

      const serviceWithBarber = cart.find(item => item.barberId);
      const barberId = serviceWithBarber?.barberId || defaultBarber?.id || activeBarbers[0]?.id;
      
      if (!barberId) {
        toast({ title: "Erro", description: "Nenhum barbeiro disponível", variant: "destructive" });
        return;
      }

      const comandaData = {
        clientId: selectedClient?.id || null,
        barberId,
        appointmentId: linkedAppointmentId || null,
        items,
        subtotal: subtotal.toString(),
        discount: calculatedDiscount.toString(),
        surcharge: surcharge.toString(),
        total: total.toString(),
        paymentMethod: isSplitPayment ? 'split' : (isOnlyPackageUse ? 'package_use' : paymentMethod),
        paymentDetails,
        status: 'closed',
        notes: ''
      };

      // Se está editando uma comanda em espera, fechar a existente ao invés de criar nova
      if (editingComanda) {
        // Primeiro, adicionar apenas os itens NOVOS (que não têm existingItemId)
        const newItems = cart.filter(item => !item.existingItemId);
        for (const item of newItems) {
          const commission = item.barberId && !item.isBarberPurchase ? calculateCommission(item) : 0;
          const itemData: any = {
            comandaId: editingComanda.id,
            type: item.type,
            quantity: item.quantity,
            unitPrice: item.price.toString(),
            total: ((item.price * item.quantity) - (item.discountAmount || 0)).toString(),
            isBarberPurchase: item.isBarberPurchase || false,
            originalPrice: item.originalPrice?.toString() || null,
            discountType: item.discountType || null,
            discountValue: item.discountValue?.toString() || null,
            discountAmount: item.discountAmount?.toString() || null,
            barberId: item.barberId || null,
            commission: commission
          };
          if (item.type === 'service' || item.type === 'package_use') {
            itemData.serviceId = item.originalId;
            itemData.clientPackageId = item.clientPackageId || null;
            itemData.packageValue = item.packageValue || null;
          } else if (item.type === 'product') {
            itemData.productId = item.originalId;
          } else if (item.type === 'package') {
            itemData.packageId = item.originalId;
          }
          await addComandaItemMutation.mutateAsync(itemData);
        }
        
        // Depois, atualizar a comanda para fechada (sem enviar items novamente)
        const { items: _, ...comandaDataWithoutItems } = comandaData;
        await updateComandaMutation.mutateAsync({
          id: editingComanda.id,
          ...comandaDataWithoutItems
        });
      } else {
        await createComandaMutation.mutateAsync(comandaData);
      }
      
      // Atualizar lista de pacotes do cliente
      refetchClientPackages();
      
      toast({ title: "Comanda fechada com sucesso!" });
      
      // Marcar para atualizar agenda se tinha agendamento vinculado
      if (linkedAppointmentId) {
        localStorage.setItem('refreshAppointments', 'true');
      }
      
      setCart([]);
      setSelectedClient(null);
      setLinkedAppointmentId(null);
      setEditingComanda(null); // Limpar comanda em edição
      setDefaultBarber(null); // Limpar profissional padrão ao resetar comanda
      setDiscount(0);
      setComandaDiscountType('fixed');
      setSurcharge(0);
      setPaymentMethod("");
      setReceivedAmount("");
      setIsSplitPayment(false);
      setSplitPayments([]);
      setIsCheckoutDialogOpen(false);
      refetchOpenComandas(); // Atualizar lista de comandas abertas
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const openCheckout = (method: string) => {
    if (cart.length === 0) {
      toast({ title: "Adicione itens ao carrinho", variant: "destructive" });
      return;
    }
    setPaymentMethod(method);
    setIsSplitPayment(false);
    setReceivedAmount("");
    setIsCheckoutDialogOpen(true);
  };

  const toggleSplitPayment = () => {
    setIsSplitPayment(!isSplitPayment);
    if (!isSplitPayment) {
      setSplitPayments([{ method: 'cash', amount: total }]);
    }
  };

  const addSplitRow = () => {
    setSplitPayments([...splitPayments, { method: 'pix', amount: 0 }]);
  };

  const removeSplitRow = (index: number) => {
    setSplitPayments(splitPayments.filter((_, i) => i !== index));
  };

  const updateSplit = (index: number, field: string, value: any) => {
    const newSplits = [...splitPayments];
    newSplits[index] = { ...newSplits[index], [field]: value };
    setSplitPayments(newSplits);
  };

  const handleSaveAsOpen = async () => {
    if (!checkRegisterBeforeAction()) return;
    if (cart.length === 0) {
      toast({ title: "Adicione itens ao carrinho", variant: "destructive" });
      return;
    }

    const serviceWithBarber = cart.find(item => item.barberId);
    const barberId = serviceWithBarber?.barberId || defaultBarber?.id || activeBarbers[0]?.id;
    
    if (!barberId) {
      toast({ title: "Erro", description: "Nenhum barbeiro disponível", variant: "destructive" });
      return;
    }

    try {
      if (editingComanda) {
        // Filtrar apenas os itens NOVOS (que não têm existingItemId)
        const newItems = cart.filter(item => !item.existingItemId);
        
        if (newItems.length === 0) {
          toast({ title: "Comanda mantida", description: "Nenhum novo item foi adicionado." });
          setCart([]);
          setSelectedClient(null);
          setLinkedAppointmentId(null);
          setEditingComanda(null);
          setDiscount(0);
          setComandaDiscountType('fixed');
          setSurcharge(0);
          setDefaultBarber(null);
          refetchOpenComandas();
          return;
        }
        
        for (const item of newItems) {
          const commission = item.barberId && !item.isBarberPurchase ? calculateCommission(item) : 0;
          const itemData: any = {
            comandaId: editingComanda.id,
            type: item.type,
            quantity: item.quantity,
            unitPrice: item.price.toString(),
            total: ((item.price * item.quantity) - (item.discountAmount || 0)).toString(),
            isBarberPurchase: item.isBarberPurchase || false,
            originalPrice: item.originalPrice?.toString() || null,
            discountType: item.discountType || null,
            discountValue: item.discountValue?.toString() || null,
            discountAmount: item.discountAmount?.toString() || null,
            barberId: item.barberId || null,
            commission: commission
          };
          if (item.type === 'service' || item.type === 'package_use') {
            itemData.serviceId = item.originalId;
          } else if (item.type === 'product') {
            itemData.productId = item.originalId;
          } else if (item.type === 'package') {
            itemData.packageId = item.originalId;
          }
          await addComandaItemMutation.mutateAsync(itemData);
        }
        toast({ title: "Itens adicionados!", description: `${newItems.length} novo(s) item(s) adicionado(s) à comanda.` });
      } else {
        const items = cart.map(item => {
          const commission = item.barberId && !item.isBarberPurchase ? calculateCommission(item) : 0;
          return {
            type: item.type,
            itemId: item.originalId,
            quantity: item.quantity,
            unitPrice: item.price,
            barberId: item.barberId || null,
            commission: commission,
            clientPackageId: item.clientPackageId || null,
            packageValue: item.packageValue || null,
            isBarberPurchase: item.isBarberPurchase || false,
            originalPrice: item.originalPrice || null,
            discountType: item.discountType || null,
            discountValue: item.discountValue?.toString() || null,
            discountAmount: item.discountAmount?.toString() || null
          };
        });

        await createComandaMutation.mutateAsync({
          clientId: selectedClient?.id || null,
          barberId,
          appointmentId: linkedAppointmentId || null,
          items,
          subtotal: subtotal.toString(),
          discount: calculatedDiscount.toString(),
          surcharge: surcharge.toString(),
          total: total.toString(),
          status: 'open'
        });
        toast({ title: "Comanda salva em espera!", description: "Você pode adicionar mais itens depois." });
      }

      setCart([]);
      setSelectedClient(null);
      setLinkedAppointmentId(null);
      setEditingComanda(null);
      setDiscount(0);
      setComandaDiscountType('fixed');
      setSurcharge(0);
      setDefaultBarber(null);
      refetchOpenComandas();
    } catch (error: any) {
      if (error.message.includes('já possui uma comanda aberta')) {
        toast({ 
          title: "Cliente já tem comanda aberta", 
          description: "Selecione a comanda existente para adicionar itens.",
          variant: "destructive"
        });
      } else {
        toast({ title: "Erro ao salvar comanda", description: error.message, variant: "destructive" });
      }
    }
  };

  const loadOpenComanda = (comanda: any) => {
    const client = clients.find((c: any) => c.id === comanda.clientId);
    setSelectedClient(client || null);
    setEditingComanda(comanda);
    setLinkedAppointmentId(comanda.appointmentId || null);
    
    // Carregar desconto e acréscimo da comanda existente
    const savedDiscount = comanda.discount ? parseFloat(comanda.discount) : 0;
    const savedSurcharge = comanda.surcharge ? parseFloat(comanda.surcharge) : 0;
    setDiscount(savedDiscount);
    setComandaDiscountType('fixed'); // Sempre carrega como valor fixo (já está calculado)
    setSurcharge(savedSurcharge);
    
    // Converter itens salvos da comanda para o formato do carrinho
    if (comanda.items && Array.isArray(comanda.items) && comanda.items.length > 0) {
      const cartItems: CartItem[] = comanda.items.map((item: any) => {
        // Buscar dados adicionais do serviço/produto se necessário
        let originalId = item.serviceId || item.productId || item.id;
        let name = item.name || 'Item';
        // Usar unitPrice do banco se disponível, senão tentar price
        let price = parseFloat(item.unitPrice) || parseFloat(item.price) || 0;
        
        // Para package_use, buscar informações do serviço relacionado
        if (item.type === 'package_use' && item.serviceId) {
          const service = services.find((s: any) => s.id === item.serviceId);
          if (service) {
            name = service.name;
          }
        }
        
        // Buscar nome do barbeiro se tiver barberName no item
        const barberName = item.barberName || null;
        
        return {
          id: `${item.type}_${originalId}_${Date.now()}_${Math.random()}`,
          originalId: originalId,
          name: name,
          price: price,
          type: item.type as 'service' | 'product' | 'package' | 'package_use' | 'subscription_sale',
          quantity: item.quantity || 1,
          barberId: item.barberId || undefined,
          barberName: barberName || undefined,
          usedPackage: item.type === 'package_use',
          clientPackageId: item.clientPackageId || undefined,
          packageValue: item.packageValue ? parseFloat(item.packageValue) : undefined,
          isBarberPurchase: item.isBarberPurchase || false,
          isRecurring: item.isRecurring || false,
          recurringInterval: item.recurringInterval || undefined,
          originalPrice: item.originalPrice ? parseFloat(item.originalPrice) : undefined,
          discountType: item.discountType || undefined,
          discountValue: item.discountValue ? parseFloat(item.discountValue) : undefined,
          discountAmount: item.discountAmount ? parseFloat(item.discountAmount) : undefined,
          existingItemId: item.id, // Marcar como item existente no banco
        };
      });
      setCart(cartItems);
    } else {
      setCart([]);
    }
    
    setIsOpenComandasDialogOpen(false);
    
    const itemCount = comanda.items?.length || 0;
    toast({ 
      title: "Comanda carregada", 
      description: itemCount > 0 
        ? `Comanda de ${client?.name || 'Cliente'} carregada com ${itemCount} item(s).`
        : `Comanda de ${client?.name || 'Cliente'} selecionada. Adicione itens e finalize.`
    });
  };

  const clearCurrentComanda = () => {
    setCart([]);
    setSelectedClient(null);
    setLinkedAppointmentId(null);
    setEditingComanda(null);
    setDiscount(0);
    setComandaDiscountType('fixed');
    setSurcharge(0);
    setDefaultBarber(null);
  };

  return (
    <Layout>
      <div className="flex h-[calc(100vh-8rem)] gap-6">
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-serif font-bold text-foreground">Caixa / PDV</h1>
              <p className="text-muted-foreground">Adicione serviços e produtos à comanda.</p>
            </div>
            <div className="flex items-center gap-3">
              {openComandas.length > 0 && (
                <Button
                  variant="outline"
                  className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30 hover:bg-yellow-500/20"
                  onClick={() => setIsOpenComandasDialogOpen(true)}
                  data-testid="button-open-comandas"
                >
                  <Clock className="w-4 h-4 mr-2" />
                  Comandas Abertas ({openComandas.length})
                </Button>
              )}
              <div className="relative w-64">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar item..." 
                  className="pl-10 bg-card border-border"
                  data-testid="input-search-items"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>

          {hasOldComandas && (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
                <div>
                  <p className="font-bold text-sm text-destructive">
                    {oldComandas.length} comanda(s) de dias anteriores pendente(s)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Finalize ou cancele as comandas antigas antes de criar novas comandas.
                  </p>
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setIsOpenComandasDialogOpen(true)}
              >
                Ver Comandas
              </Button>
            </div>
          )}

          <Tabs defaultValue="services" className="flex-1 flex flex-col min-h-0">
            <TabsList className="bg-card border border-border w-fit mb-4">
              <TabsTrigger value="services" data-testid="tab-services" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Scissors className="w-4 h-4 mr-2" /> Serviços
              </TabsTrigger>
              <TabsTrigger value="products" data-testid="tab-products" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <ShoppingBag className="w-4 h-4 mr-2" /> Produtos
              </TabsTrigger>
              <TabsTrigger value="packages" data-testid="tab-packages" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Package className="w-4 h-4 mr-2" /> Pacotes
              </TabsTrigger>
              <TabsTrigger value="subscriptions" data-testid="tab-subscriptions" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <RefreshCw className="w-4 h-4 mr-2" /> Assinaturas
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1 pr-4">
              <TabsContent value="services" className="mt-0">
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {activeServices.filter((s: any) => s.name.toLowerCase().includes(searchTerm.toLowerCase())).map((service: any) => (
                    <ItemCard 
                      key={service.id} 
                      item={service} 
                      type="service" 
                      onAdd={() => addServiceToCart(service)} 
                    />
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="products" className="mt-0">
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {activeProducts.filter((p: any) => p.name.toLowerCase().includes(searchTerm.toLowerCase())).map((product: any) => (
                    <ItemCard 
                      key={product.id} 
                      item={product} 
                      type="product" 
                      onAdd={() => addProductToCart(product)} 
                    />
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="packages" className="mt-0">
                {activePackages.filter((p: any) => !p.isRecurring).length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground border border-dashed border-border rounded-lg">
                    Nenhum pacote avulso configurado ainda.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {activePackages.filter((p: any) => !p.isRecurring && p.name.toLowerCase().includes(searchTerm.toLowerCase())).map((pkg: any) => (
                      <ItemCard 
                        key={pkg.id} 
                        item={pkg} 
                        type="package" 
                        onAdd={() => addPackageToCart(pkg)} 
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="subscriptions" className="mt-0">
                {activePackages.filter((p: any) => p.isRecurring).length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground border border-dashed border-border rounded-lg">
                    <RefreshCw className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhum plano de assinatura configurado ainda.</p>
                    <p className="text-sm mt-2">Configure pacotes recorrentes em Cadastros &gt; Pacotes.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {activePackages.filter((p: any) => p.isRecurring && p.name.toLowerCase().includes(searchTerm.toLowerCase())).map((pkg: any) => {
                      const intervalLabel = pkg.recurringInterval === 'weekly' ? '/semana' : 
                                            pkg.recurringInterval === 'biweekly' ? '/quinzena' : '/mês';
                      return (
                        <Card 
                          key={pkg.id}
                          className="cursor-pointer hover:border-primary/50 transition-all bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20"
                          onClick={() => addSubscriptionToCart(pkg)}
                          data-testid={`subscription-card-${pkg.id}`}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-2">
                              <RefreshCw className="w-5 h-5 text-primary" />
                              <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
                                Recorrente
                              </Badge>
                            </div>
                            <h3 className="font-medium text-sm mb-1">{pkg.name}</h3>
                            <p className="text-xs text-muted-foreground mb-2">{pkg.quantity} usos{intervalLabel}</p>
                            <p className="text-lg font-bold text-primary">
                              R$ {parseFloat(pkg.price).toFixed(2)}
                              <span className="text-xs font-normal text-muted-foreground">{intervalLabel}</span>
                            </p>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>

        <Card className={`w-[400px] flex flex-col bg-card/80 backdrop-blur-sm shadow-xl flex-shrink-0 ${editingComanda ? 'border-yellow-500/50' : 'border-primary/20'}`}>
          <CardHeader className="bg-background/50 border-b border-border pb-4">
            <CardTitle className="flex justify-between items-center font-serif">
              <div className="flex items-center gap-2">
                {editingComanda ? (
                  <>
                    <Clock className="w-5 h-5 text-yellow-500" />
                    <span className="text-yellow-500">Comanda em Espera</span>
                  </>
                ) : (
                  <span>Nova Comanda</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {editingComanda && (
                  <Button variant="ghost" size="sm" className="text-xs" onClick={clearCurrentComanda} data-testid="button-new-comanda">
                    Nova
                  </Button>
                )}
                <span className="text-sm font-sans font-normal text-muted-foreground">{new Date().toLocaleDateString()}</span>
              </div>
            </CardTitle>
            
            <div className="mt-4">
              {selectedClient ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-primary/10 border border-primary/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">
                        {selectedClient.name.substring(0,1)}
                      </div>
                      <div>
                        <p className="font-bold text-sm" data-testid="text-selected-client">{selectedClient.name}</p>
                        <p className="text-xs text-muted-foreground">{selectedClient.phone}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedClient(null)} data-testid="button-remove-client">
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                  {getClientActivePackages(selectedClient.id).length > 0 && (
                    <div className="p-2 bg-green-500/10 border border-green-500/30 rounded-lg">
                      <div className="flex items-center gap-1 text-green-400 text-xs font-medium mb-2">
                        <Gift className="h-3 w-3" />
                        <span>Clique para usar o pacote:</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        {getClientActivePackages(selectedClient.id).map((cp: any) => {
                          const availableUses = getAvailableUses(cp);
                          const pendingUses = getPendingUsesInCart(cp.id);
                          const isDisabled = availableUses <= 0;
                          
                          return (
                            <Button
                              key={cp.id}
                              variant="outline"
                              size="sm"
                              disabled={isDisabled}
                              className={`w-full justify-between h-auto py-2 px-3 ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'bg-green-500/10 border-green-500/40 hover:bg-green-500/20 hover:border-green-500 text-green-400'}`}
                              onClick={() => !isDisabled && openUsePackageDialog(cp)}
                              data-testid={`use-package-${cp.id}`}
                            >
                              <span className="font-medium">{cp.packageName}</span>
                              <div className="flex items-center gap-1">
                                {pendingUses > 0 && (
                                  <Badge variant="secondary" className="text-xs bg-yellow-500/30 text-yellow-300">
                                    {pendingUses} no carrinho
                                  </Badge>
                                )}
                                <Badge variant="secondary" className={`text-xs ${isDisabled ? 'bg-gray-500/30 text-gray-400' : 'bg-green-500/30 text-green-300'}`}>
                                  {availableUses} usos
                                </Badge>
                              </div>
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Button 
                  variant="outline" 
                  className="w-full border-dashed border-2 hover:bg-primary/5 hover:border-primary/50 text-muted-foreground" 
                  onClick={() => setIsClientDialogOpen(true)}
                  data-testid="button-select-client"
                >
                  <User className="mr-2 h-4 w-4" /> Selecionar Cliente
                </Button>
              )}
            </div>
            
            {/* Seletor de Profissional Padrão (para comanda avulsa) */}
            {!linkedAppointmentId && (
              <div className="mt-3">
                {defaultBarber ? (
                  <div className="flex items-center justify-between p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
                        <Scissors className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-blue-400" data-testid="text-default-barber">{defaultBarber.name}</p>
                        <p className="text-xs text-muted-foreground">Profissional</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDefaultBarber(null)} data-testid="button-remove-barber">
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                ) : (
                  <Button 
                    variant="outline" 
                    className="w-full border-dashed border-2 hover:bg-blue-500/5 hover:border-blue-500/50 text-muted-foreground" 
                    onClick={() => {
                      setPendingItem({ type: 'select_default_barber' });
                      setIsBarberDialogOpen(true);
                    }}
                    data-testid="button-select-default-barber"
                  >
                    <Scissors className="mr-2 h-4 w-4" /> Selecionar Profissional
                  </Button>
                )}
              </div>
            )}
          </CardHeader>

          <CardContent className="flex-1 overflow-hidden flex flex-col p-0">
            <ScrollArea className="flex-1 p-4">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50 space-y-4 py-12">
                  <ShoppingBag className="w-12 h-12" />
                  <p>Carrinho vazio</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {cart.map((item) => (
                    <div key={item.id} className="flex flex-col gap-1 group" data-testid={`cart-item-${item.id}`}>
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="flex justify-between">
                            <h4 className="font-medium text-sm">{item.name}</h4>
                            <div className="text-right">
                              {item.discountAmount && item.discountAmount > 0 ? (
                                <>
                                  <span className="text-xs text-muted-foreground line-through mr-2">
                                    R$ {(item.price * item.quantity).toFixed(2)}
                                  </span>
                                  <span className="font-bold text-sm text-green-400">
                                    R$ {getItemFinalPrice(item).toFixed(2)}
                                  </span>
                                </>
                              ) : (
                                <span className="font-bold text-sm">R$ {(item.price * item.quantity).toFixed(2)}</span>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {item.type === 'service' ? 'Serviço' : item.type === 'product' ? 'Produto' : item.type === 'package_use' ? 'Uso de Pacote' : item.type === 'subscription_sale' ? 'Assinatura' : 'Pacote'}
                            {item.barberName && ` • ${item.barberName}`}
                            {item.type === 'package_use' && item.packageValue !== undefined 
                              ? ` • Comissão: R$ ${calculateCommission(item).toFixed(2)}`
                              : ` • R$ ${item.price.toFixed(2)} un.`
                            }
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {item.isBarberPurchase && (
                              <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[10px] px-1.5 py-0">
                                Compra do Profissional
                              </Badge>
                            )}
                            {item.discountAmount && item.discountAmount > 0 && (
                              <Badge 
                                className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] px-1.5 py-0 cursor-pointer hover:bg-green-500/30"
                                onClick={() => removeItemDiscount(item.id)}
                                data-testid={`badge-discount-${item.id}`}
                              >
                                {item.discountType === 'percentage' ? `${item.discountValue}%` : `R$${item.discountValue?.toFixed(2)}`} OFF
                                <X className="w-3 h-3 ml-1 inline" />
                              </Badge>
                            )}
                          </div>
                        </div>
                        
                        {/* Package uses cannot have quantity changed - each use is always 1 */}
                        {item.type === 'package_use' ? (
                          <div className="flex items-center gap-1 bg-green-500/10 border border-green-500/30 rounded-md h-8 px-3">
                            <Gift className="w-3 h-3 text-green-400" />
                            <span className="text-xs text-green-400 font-medium">1 uso</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 bg-background border border-border rounded-md h-8">
                            <button 
                              className="px-2 h-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" 
                              onClick={() => updateQuantity(item.id, -1)}
                              data-testid={`button-decrease-${item.id}`}
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-xs w-6 text-center font-bold">{item.quantity}</span>
                            <button 
                              className="px-2 h-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" 
                              onClick={() => updateQuantity(item.id, 1)}
                              data-testid={`button-increase-${item.id}`}
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        {/* Botão de desconto - só mostra se não for uso de pacote e não tiver desconto ainda */}
                        {item.type !== 'package_use' && !item.discountAmount && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-green-400 transition-all" 
                            onClick={() => openDiscountDialog(item)}
                            data-testid={`button-discount-${item.id}`}
                          >
                            <Percent className="w-4 h-4" />
                          </Button>
                        )}

                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all" 
                          onClick={() => removeFromCart(item.id)}
                          data-testid={`button-remove-${item.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            <div className="p-4 bg-background/50 border-t border-border space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Subtotal</span>
                  <span data-testid="text-subtotal">R$ {subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span>Desconto</span>
                    <div className="flex gap-1">
                      <Button
                        variant={comandaDiscountType === 'fixed' ? "default" : "outline"}
                        size="sm"
                        className="h-5 px-2 text-xs"
                        onClick={() => setComandaDiscountType('fixed')}
                        data-testid="comanda-discount-type-fixed"
                      >
                        R$
                      </Button>
                      <Button
                        variant={comandaDiscountType === 'percentage' ? "default" : "outline"}
                        size="sm"
                        className="h-5 px-2 text-xs"
                        onClick={() => setComandaDiscountType('percentage')}
                        data-testid="comanda-discount-type-percentage"
                      >
                        %
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      className="w-20 h-6 text-right text-xs"
                      value={discount}
                      onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                      data-testid="input-discount"
                    />
                    <span className="text-xs w-6">{comandaDiscountType === 'percentage' ? '%' : 'R$'}</span>
                  </div>
                </div>
                {comandaDiscountType === 'percentage' && discount > 0 && (
                  <div className="flex justify-end text-xs text-muted-foreground">
                    <span>= R$ {calculatedDiscount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className="text-green-500">Acréscimo</span>
                    <Plus className="w-3 h-3 text-green-500" />
                  </div>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      className="w-20 h-6 text-right text-xs"
                      value={surcharge}
                      onChange={(e) => setSurcharge(Math.max(0, parseFloat(e.target.value) || 0))}
                      data-testid="input-surcharge"
                    />
                    <span className="text-xs w-6">R$</span>
                  </div>
                </div>
                <Separator className="bg-border" />
                <div className="flex justify-between items-end">
                  <span className="font-bold text-lg">Total</span>
                  <span className="font-bold text-2xl text-primary" data-testid="text-total">R$ {total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="p-4 bg-background/50 border-t border-border flex flex-col gap-2">
            {isOnlyPackageUse ? (
              <Button 
                className="w-full bg-green-600 text-white hover:bg-green-700"
                onClick={() => {
                  setPaymentMethod('');
                  setIsCheckoutDialogOpen(true);
                }}
                data-testid="button-close-package"
              >
                <Check className="mr-2 h-4 w-4" /> Fechar (Uso de Pacote)
              </Button>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 w-full">
                  <Button 
                    variant="outline" 
                    className="bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20 hover:text-green-400"
                    onClick={() => openCheckout('cash')}
                    data-testid="button-pay-cash"
                  >
                    <Banknote className="mr-1 h-4 w-4" /> Dinheiro
                  </Button>
                  <Button 
                    variant="outline" 
                    className="bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20 hover:text-blue-400"
                    onClick={() => openCheckout('pix')}
                    data-testid="button-pay-pix"
                  >
                    <QrCode className="mr-1 h-4 w-4" /> Pix
                  </Button>
                  <Button 
                    variant="outline" 
                    className="bg-purple-500/10 text-purple-500 border-purple-500/20 hover:bg-purple-500/20 hover:text-purple-400"
                    onClick={() => openCheckout('card')}
                    data-testid="button-pay-card"
                  >
                    <CreditCard className="mr-1 h-4 w-4" /> Cartão
                  </Button>
                </div>
                {cart.length > 0 && (
                  <Button 
                    variant="outline" 
                    className="w-full bg-yellow-500/10 text-yellow-500 border-yellow-500/20 hover:bg-yellow-500/20 hover:text-yellow-400"
                    onClick={handleSaveAsOpen}
                    disabled={createComandaMutation.isPending || addComandaItemMutation.isPending}
                    data-testid="button-save-open"
                  >
                    <Clock className="mr-2 h-4 w-4" /> 
                    {editingComanda ? 'Adicionar à Comanda' : 'Salvar em Espera'}
                  </Button>
                )}
              </>
            )}
          </CardFooter>
        </Card>
      </div>

      <Dialog open={isClientDialogOpen} onOpenChange={setIsClientDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Selecionar Cliente</DialogTitle>
            <DialogDescription>Escolha um cliente para esta comanda (opcional).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar cliente..." 
                className="pl-10"
                data-testid="input-search-clients"
                value={clientSearchTerm}
                onChange={(e) => setClientSearchTerm(e.target.value)}
              />
            </div>
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {filteredClients.map((client: any) => {
                  const clientPkgs = getClientActivePackages(client.id);
                  const hasPackages = clientPkgs.length > 0;
                  return (
                    <div 
                      key={client.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${hasPackages ? 'border-green-500/50 bg-green-500/5 hover:border-green-500 hover:bg-green-500/10' : 'border-border hover:border-primary/50 hover:bg-primary/5'}`}
                      onClick={() => { setSelectedClient(client); setIsClientDialogOpen(false); setClientSearchTerm(""); }}
                      data-testid={`select-client-${client.id}`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${hasPackages ? 'bg-green-500/20 text-green-400' : 'bg-primary/20 text-primary'}`}>
                        {client.name.substring(0,1)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{client.name}</p>
                          {hasPackages && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-green-500/20 text-green-400">
                              <Gift className="h-2.5 w-2.5 mr-0.5" />
                              {clientPkgs.reduce((acc: number, cp: any) => acc + cp.quantityRemaining, 0)} usos
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{client.phone || 'Sem telefone'}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isBarberDialogOpen} onOpenChange={(open) => {
        setIsBarberDialogOpen(open);
        if (!open) {
          setIsBarberPurchaseMode(false);
        }
        if (!open && prefilledBarber && pendingItem) {
          const cartItem: CartItem = {
            id: `service-${pendingItem.id}-${prefilledBarber.id}-${Date.now()}`,
            originalId: pendingItem.id,
            name: pendingItem.name,
            price: parseFloat(pendingItem.price),
            type: 'service',
            quantity: 1,
            barberId: prefilledBarber.id,
            barberName: prefilledBarber.name
          };
          setCart([...cart, cartItem]);
          setPendingItem(null);
          setPendingPackageInfo(null);
          setPrefilledBarber(null);
          setUsePackageOption(false);
          toast({ title: "Serviço adicionado (sem pacote)", description: "Cobrança normal aplicada." });
        }
      }}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Selecionar Barbeiro</DialogTitle>
            <DialogDescription>
              {pendingItem?.type === 'select_default_barber'
                ? 'Selecione o profissional responsável por esta comanda'
                : pendingItem?.type === 'product' 
                  ? (isBarberPurchaseMode 
                      ? `Qual profissional está comprando "${pendingItem?.name}"?`
                      : `Quem vendeu "${pendingItem?.name}"? (Selecione para gerar comissão)`)
                  : `Quem vai executar "${pendingItem?.name}"?`}
            </DialogDescription>
          </DialogHeader>
          
          {pendingItem?.type === 'product' && (
            <div className="flex gap-2 mb-2">
              <Button
                variant={!isBarberPurchaseMode ? "default" : "outline"}
                className={`flex-1 ${!isBarberPurchaseMode ? 'bg-primary' : ''}`}
                onClick={() => setIsBarberPurchaseMode(false)}
                data-testid="mode-sale"
              >
                <ShoppingBag className="h-4 w-4 mr-2" />
                Venda
              </Button>
              <Button
                variant={isBarberPurchaseMode ? "default" : "outline"}
                className={`flex-1 ${isBarberPurchaseMode ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
                onClick={() => setIsBarberPurchaseMode(true)}
                data-testid="mode-barber-purchase"
              >
                <User className="h-4 w-4 mr-2" />
                Compra do Profissional
              </Button>
            </div>
          )}
          
          {isBarberPurchaseMode && pendingItem?.type === 'product' && (
            <div className="bg-orange-500/10 border border-orange-500/30 p-3 rounded-lg mb-2">
              <p className="text-xs text-orange-400">
                O valor será descontado da comissão do profissional selecionado. Não gera comissão.
              </p>
            </div>
          )}
          
          {pendingPackageInfo && pendingItem?.type === 'service' && (
            <div className="bg-green-500/10 border border-green-500/30 p-3 rounded-lg mb-2">
              <div className="flex items-center gap-2 text-green-400 font-medium text-sm">
                <Gift className="h-4 w-4" />
                <span>Cliente tem pacote disponível!</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {pendingPackageInfo.package.name} - {pendingPackageInfo.clientPackage.quantityRemaining} usos restantes
              </p>
            </div>
          )}
          
          {prefilledBarber && pendingPackageInfo && pendingItem?.type === 'service' ? (
            <div className="space-y-3">
              <div className="text-center text-sm text-muted-foreground mb-2">
                Barbeiro do agendamento: <strong className="text-foreground">{prefilledBarber.name}</strong>
              </div>
              <div className="flex flex-col gap-3">
                <Button
                  className="h-auto p-4 flex flex-col items-center gap-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/50 text-foreground"
                  onClick={() => {
                    confirmAddService(prefilledBarber.id, true);
                    setPrefilledBarber(null);
                  }}
                  data-testid="button-use-package"
                >
                  <Gift className="h-6 w-6 text-green-400" />
                  <span className="font-bold text-green-400">Usar Pacote</span>
                  <span className="text-xs text-muted-foreground">Serviço grátis (pacote)</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto p-3"
                  onClick={() => {
                    confirmAddService(prefilledBarber.id, false);
                    setPrefilledBarber(null);
                  }}
                  data-testid="button-charge-normal"
                >
                  <span className="font-medium">Cobrar Normal</span>
                  <span className="text-xs text-muted-foreground ml-2">R$ {parseFloat(pendingItem?.price || 0).toFixed(2)}</span>
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {pendingItem?.type === 'product' && !isBarberPurchaseMode && (
                <Button
                  variant="outline"
                  className="h-auto p-4 flex flex-col items-center gap-2 hover:border-muted-foreground hover:bg-muted/50 col-span-2"
                  onClick={() => confirmAddProduct(null, false)}
                  data-testid="select-barber-none"
                >
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold text-lg">
                    --
                  </div>
                  <span className="font-medium">Sem Barbeiro</span>
                  <span className="text-xs text-muted-foreground">Não gera comissão</span>
                </Button>
              )}
              {activeBarbers.map((barber: any) => (
                <div key={barber.id} className="col-span-1">
                  {pendingItem?.type === 'select_default_barber' ? (
                    <Button
                      variant="outline"
                      className="h-auto p-4 flex flex-col items-center gap-2 hover:border-blue-500 hover:bg-blue-500/10 w-full"
                      onClick={() => {
                        setDefaultBarber(barber);
                        setIsBarberDialogOpen(false);
                        setPendingItem(null);
                        toast({ title: "Profissional selecionado", description: `${barber.name} será responsável por esta comanda.` });
                      }}
                      data-testid={`select-default-barber-${barber.id}`}
                    >
                      <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-lg">
                        {barber.name.substring(0,2).toUpperCase()}
                      </div>
                      <span className="font-medium">{barber.name}</span>
                      <span className="text-xs text-muted-foreground">{barber.role || 'Barbeiro'}</span>
                    </Button>
                  ) : pendingPackageInfo && pendingItem?.type === 'service' ? (
                    <div className="flex flex-col gap-2">
                      <Button
                        variant="outline"
                        className="h-auto p-3 flex flex-col items-center gap-1 hover:border-green-500 hover:bg-green-500/10 border-green-500/50"
                        onClick={() => confirmAddService(barber.id, true)}
                        data-testid={`select-barber-package-${barber.id}`}
                      >
                        <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 font-bold">
                          {barber.name.substring(0,2).toUpperCase()}
                        </div>
                        <span className="font-medium text-sm">{barber.name}</span>
                        <Badge variant="secondary" className="text-xs bg-green-500/20 text-green-400">
                          Usar Pacote (R$ 0,00)
                        </Badge>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs text-muted-foreground"
                        onClick={() => confirmAddService(barber.id, false)}
                        data-testid={`select-barber-normal-${barber.id}`}
                      >
                        Cobrar normal
                      </Button>
                    </div>
                  ) : pendingItem?.type === 'product' && isBarberPurchaseMode ? (
                    <Button
                      variant="outline"
                      className="h-auto p-4 flex flex-col items-center gap-2 hover:border-orange-500 hover:bg-orange-500/10 border-orange-500/30 w-full"
                      onClick={() => confirmAddProduct(barber.id, true)}
                      data-testid={`select-barber-purchase-${barber.id}`}
                    >
                      <div className="w-12 h-12 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 font-bold text-lg">
                        {barber.name.substring(0,2).toUpperCase()}
                      </div>
                      <span className="font-medium">{barber.name}</span>
                      <span className="text-xs text-orange-400">Desconto na comissão</span>
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="h-auto p-4 flex flex-col items-center gap-2 hover:border-primary hover:bg-primary/10 w-full"
                      onClick={() => {
                        if (pendingItem?.type === 'product') {
                          confirmAddProduct(barber.id, false);
                        } else {
                          confirmAddService(barber.id, false);
                        }
                      }}
                      data-testid={`select-barber-${barber.id}`}
                    >
                      <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-lg">
                        {barber.name.substring(0,2).toUpperCase()}
                      </div>
                      <span className="font-medium">{barber.name}</span>
                      <span className="text-xs text-muted-foreground">{barber.role || 'Barbeiro'}</span>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isCheckoutDialogOpen} onOpenChange={setIsCheckoutDialogOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Confirmar Pagamento</DialogTitle>
            <DialogDescription>Revise os detalhes antes de fechar a comanda.</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="bg-background/50 p-4 rounded-lg border border-border space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Cliente:</span>
                <span className="font-medium">{selectedClient?.name || 'Cliente Avulso'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Itens:</span>
                <span className="font-medium">{cart.reduce((acc, i) => acc + i.quantity, 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="font-medium">R$ {subtotal.toFixed(2)}</span>
              </div>
              {calculatedDiscount > 0 && (
                <div className="flex justify-between text-sm text-destructive">
                  <span className="text-muted-foreground">
                    Desconto{comandaDiscountType === 'percentage' ? ` (${discount}%)` : ''}:
                  </span>
                  <span className="font-medium">- R$ {calculatedDiscount.toFixed(2)}</span>
                </div>
              )}
              {surcharge > 0 && (
                <div className="flex justify-between text-sm text-green-500">
                  <span className="text-muted-foreground">Acréscimo:</span>
                  <span className="font-medium">+ R$ {surcharge.toFixed(2)}</span>
                </div>
              )}
              <Separator className="bg-border/50" />
              <div className="flex justify-between items-center pt-2">
                <span className="font-bold text-lg">Total:</span>
                <span className="font-bold text-2xl text-primary">R$ {total.toFixed(2)}</span>
              </div>
              
              {isOnlyPackageUse ? (
                <div className="space-y-3">
                  <div className="bg-green-500/10 border border-green-500/30 p-3 rounded-lg">
                    <p className="text-sm text-green-400 font-medium flex items-center gap-2">
                      <Gift className="h-4 w-4" />
                      Uso de Pacote - Já foi pago
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Não há pagamento a receber, o cliente já pagou na compra do pacote.
                    </p>
                  </div>
                  {totalCommission > 0 && (
                    <div className="bg-primary/10 border border-primary/30 p-3 rounded-lg">
                      <div className="flex justify-between text-sm">
                        <span className="text-primary font-medium">Comissão (Pacote):</span>
                        <span className="font-bold text-primary">R$ {totalCommission.toFixed(2)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Calculada sobre o valor líquido do pacote (taxa já descontada na compra)
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {!isSplitPayment && paymentMethod && (
                    <div className="flex justify-between text-sm pt-2">
                      <span className="text-muted-foreground">Pagamento:</span>
                      <span className="font-medium capitalize">
                        {paymentMethod === 'cash' ? 'Dinheiro' : paymentMethod === 'pix' ? 'Pix' : 'Cartão'}
                      </span>
                    </div>
                  )}
                  
                  {paymentFeeAmount > 0 && (
                    <div className="bg-yellow-500/10 border border-yellow-500/30 p-3 rounded-lg space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-yellow-400">Taxa {paymentFeePercent > 0 ? `(${paymentFeePercent.toFixed(2)}%)` : ''}:</span>
                        <span className="text-yellow-400 font-medium">- R$ {paymentFeeAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Valor Líquido (entra no caixa):</span>
                        <span className="font-bold text-green-400">R$ {netAmount.toFixed(2)}</span>
                      </div>
                      {totalCommission > 0 && (() => {
                        const effectiveFeePercent = total > 0 ? (paymentFeeAmount / total) * 100 : 0;
                        const commissionFeeDeduction = (totalCommission * effectiveFeePercent) / 100;
                        const netCommission = totalCommission - commissionFeeDeduction;
                        return (
                          <>
                            <Separator className="bg-border/50" />
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Comissão Bruta:</span>
                              <span className="text-muted-foreground">R$ {totalCommission.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Desc. Taxa ({effectiveFeePercent.toFixed(2)}%):</span>
                              <span className="text-yellow-400">- R$ {commissionFeeDeduction.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-primary font-medium">Comissão Líquida:</span>
                              <span className="font-bold text-primary">R$ {netCommission.toFixed(2)}</span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                  
                  {paymentFeeAmount === 0 && totalCommission > 0 && (
                    <div className="bg-primary/10 border border-primary/30 p-3 rounded-lg">
                      <div className="flex justify-between text-sm">
                        <span className="text-primary font-medium">Comissão:</span>
                        <span className="font-bold text-primary">R$ {totalCommission.toFixed(2)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Sem desconto de taxa (pagamento em dinheiro)
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            {!isOnlyPackageUse && paymentMethod === 'cash' && !isSplitPayment && (
              <div className="space-y-3 p-4 bg-primary/5 rounded-lg border border-primary/20">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Valor Recebido:</span>
                  <div className="relative w-32">
                    <span className="absolute left-3 top-2 text-xs text-muted-foreground">R$</span>
                    <Input 
                      type="number" 
                      className="pl-8 text-right font-bold"
                      placeholder={total.toFixed(2)}
                      value={receivedAmount}
                      onChange={(e) => setReceivedAmount(e.target.value)}
                      data-testid="input-received-amount"
                    />
                  </div>
                </div>
                {parseFloat(receivedAmount) > total && (
                  <div className="flex justify-between items-center text-green-500 font-bold bg-green-500/10 p-2 rounded">
                    <span>Troco:</span>
                    <span>R$ {(parseFloat(receivedAmount) - total).toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            {!isOnlyPackageUse && isSplitPayment && (
              <div className="space-y-3 p-4 bg-blue-500/5 rounded-lg border border-blue-500/20">
                <h4 className="text-sm font-bold flex justify-between items-center">
                  Pagamento Dividido
                  <Button variant="outline" size="sm" onClick={addSplitRow} className="h-7 px-2">
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                </h4>
                <div className="space-y-2">
                  {splitPayments.map((p, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <select 
                        className="bg-background border border-border rounded px-2 h-9 text-sm flex-1"
                        value={p.method}
                        onChange={(e) => updateSplit(index, 'method', e.target.value)}
                      >
                        <option value="cash">Dinheiro</option>
                        <option value="pix">Pix</option>
                        <option value="card">Cartão</option>
                      </select>
                      <div className="relative w-28">
                        <span className="absolute left-2 top-2 text-[10px] text-muted-foreground">R$</span>
                        <Input 
                          type="number" 
                          className="pl-6 h-9 text-right"
                          value={p.amount}
                          onChange={(e) => updateSplit(index, 'amount', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      {splitPayments.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => removeSplitRow(index)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-xs pt-2">
                  <span className={Math.abs(splitPayments.reduce((acc, p) => acc + p.amount, 0) - total) < 0.01 ? "text-green-500" : "text-destructive"}>
                    Soma: R$ {splitPayments.reduce((acc, p) => acc + p.amount, 0).toFixed(2)}
                  </span>
                  <span className="text-muted-foreground">Falta: R$ {Math.max(0, total - splitPayments.reduce((acc, p) => acc + p.amount, 0)).toFixed(2)}</span>
                </div>
              </div>
            )}

            {!isOnlyPackageUse && (
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full text-xs" 
                onClick={toggleSplitPayment}
              >
                {isSplitPayment ? "Voltar para pagamento único" : "Dividir pagamento (Ex: Dinheiro + Pix)"}
              </Button>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsCheckoutDialogOpen(false)} data-testid="button-cancel-checkout">
              <X className="mr-2 h-4 w-4" /> Cancelar
            </Button>
            <Button 
              className="bg-primary text-primary-foreground hover:bg-primary/90" 
              onClick={handleCheckout} 
              data-testid="button-confirm-checkout"
              disabled={createComandaMutation.isPending}
            >
              <Check className="mr-2 h-4 w-4" /> {createComandaMutation.isPending ? "Concluindo..." : "Concluir Pagamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isUsePackageDialogOpen} onOpenChange={setIsUsePackageDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Usar Pacote</DialogTitle>
            <DialogDescription>
              Selecione o barbeiro que vai executar o serviço
            </DialogDescription>
          </DialogHeader>
          
          {selectedClientPackage && (
            <div className="space-y-4">
              <div className="bg-green-500/10 border border-green-500/30 p-4 rounded-lg">
                <div className="flex items-center gap-2 text-green-400 font-medium mb-2">
                  <Gift className="h-5 w-5" />
                  <span>{selectedClientPackage.packageName}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {getAvailableUses(selectedClientPackage)} usos disponíveis
                  {getPendingUsesInCart(selectedClientPackage.id) > 0 && (
                    <span className="text-yellow-400 ml-2">
                      ({getPendingUsesInCart(selectedClientPackage.id)} já no carrinho)
                    </span>
                  )}
                </p>
                {(() => {
                  const pkg = packages.find((p: any) => p.id === selectedClientPackage.packageId);
                  const service = pkg ? services.find((s: any) => s.id === pkg.serviceId) : null;
                  // Usar valor líquido se disponível
                  const baseAmount = selectedClientPackage.netAmount ? parseFloat(selectedClientPackage.netAmount) : (pkg ? parseFloat(pkg.price) : 0);
                  const packageValue = pkg ? baseAmount / pkg.quantity : 0;
                  const hasNetAmount = !!selectedClientPackage.netAmount;
                  return service ? (
                    <div className="mt-2 space-y-1">
                      <p className="text-sm text-foreground">
                        Serviço: <strong>{service.name}</strong>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Valor por uso: <strong className="text-primary">R$ {packageValue.toFixed(2)}</strong>
                        {hasNetAmount ? (
                          <span className="ml-2">(líquido R$ {baseAmount.toFixed(2)} ÷ {pkg.quantity} usos)</span>
                        ) : (
                          <span className="ml-2">(pacote R$ {parseFloat(pkg.price).toFixed(2)} ÷ {pkg.quantity} usos)</span>
                        )}
                      </p>
                    </div>
                  ) : null;
                })()}
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                {activeBarbers.map((barber: any) => (
                  <Button
                    key={barber.id}
                    variant="outline"
                    className="h-auto p-4 flex flex-col items-center gap-2 hover:border-green-500 hover:bg-green-500/10"
                    onClick={() => confirmUsePackage(barber.id)}
                    data-testid={`confirm-barber-package-${barber.id}`}
                  >
                    <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 font-bold text-lg">
                      {barber.name.substring(0,2).toUpperCase()}
                    </div>
                    <span className="font-medium">{barber.name}</span>
                    <span className="text-xs text-muted-foreground">{barber.role || 'Barbeiro'}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Desconto por Item */}
      <Dialog open={isDiscountDialogOpen} onOpenChange={setIsDiscountDialogOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Percent className="h-5 w-5 text-green-400" />
              Aplicar Desconto
            </DialogTitle>
            <DialogDescription>
              {discountItem?.name && `Desconto para "${discountItem.name}"`}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Tipo de desconto */}
            <div className="flex gap-2">
              <Button
                variant={discountType === 'percentage' ? "default" : "outline"}
                className={`flex-1 ${discountType === 'percentage' ? 'bg-primary' : ''}`}
                onClick={() => setDiscountType('percentage')}
                data-testid="discount-type-percentage"
              >
                <Percent className="h-4 w-4 mr-2" />
                Porcentagem
              </Button>
              <Button
                variant={discountType === 'fixed' ? "default" : "outline"}
                className={`flex-1 ${discountType === 'fixed' ? 'bg-primary' : ''}`}
                onClick={() => setDiscountType('fixed')}
                data-testid="discount-type-fixed"
              >
                <Tag className="h-4 w-4 mr-2" />
                Valor Fixo
              </Button>
            </div>

            {/* Input do valor */}
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">
                {discountType === 'percentage' ? 'Porcentagem (%)' : 'Valor (R$)'}
              </label>
              <div className="relative">
                <Input
                  type="number"
                  min="0"
                  max={discountType === 'percentage' ? 100 : undefined}
                  step={discountType === 'percentage' ? 1 : 0.01}
                  value={discountInputValue}
                  onChange={(e) => setDiscountInputValue(e.target.value)}
                  placeholder={discountType === 'percentage' ? 'Ex: 10' : 'Ex: 5.00'}
                  className="pr-10"
                  data-testid="input-discount-value"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  {discountType === 'percentage' ? '%' : 'R$'}
                </span>
              </div>
            </div>

            {/* Preview do desconto */}
            {discountItem && discountInputValue && parseFloat(discountInputValue) > 0 && (
              <div className="bg-green-500/10 border border-green-500/30 p-3 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Valor original:</span>
                  <span>R$ {(discountItem.price * discountItem.quantity).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Desconto:</span>
                  <span className="text-red-400">
                    -R$ {(discountType === 'percentage' 
                      ? (discountItem.price * discountItem.quantity * parseFloat(discountInputValue)) / 100 
                      : Math.min(parseFloat(discountInputValue), discountItem.price * discountItem.quantity)
                    ).toFixed(2)}
                  </span>
                </div>
                <Separator className="my-2 bg-green-500/30" />
                <div className="flex justify-between font-bold">
                  <span>Valor final:</span>
                  <span className="text-green-400">
                    R$ {(discountItem.price * discountItem.quantity - (discountType === 'percentage' 
                      ? (discountItem.price * discountItem.quantity * parseFloat(discountInputValue)) / 100 
                      : Math.min(parseFloat(discountInputValue), discountItem.price * discountItem.quantity)
                    )).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setIsDiscountDialogOpen(false);
                setDiscountItem(null);
                setDiscountInputValue('');
              }}
              data-testid="button-cancel-discount"
            >
              Cancelar
            </Button>
            <Button 
              className="bg-green-500 hover:bg-green-600"
              onClick={applyItemDiscount}
              disabled={!discountInputValue || parseFloat(discountInputValue) <= 0}
              data-testid="button-apply-discount"
            >
              <Check className="h-4 w-4 mr-2" />
              Aplicar Desconto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isOpenComandasDialogOpen} onOpenChange={setIsOpenComandasDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-yellow-500" />
              Comandas em Espera
            </DialogTitle>
            <DialogDescription>
              Selecione uma comanda para adicionar mais itens ou finalizar o pagamento.
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-96">
            <div className="space-y-3">
              {oldComandas.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-bold text-destructive mb-2 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    COMANDAS DE DIAS ANTERIORES (finalize ou cancele para liberar o PDV)
                  </p>
                  {oldComandas.map((comanda: any) => {
                    const client = clients.find((c: any) => c.id === comanda.clientId);
                    return (
                      <div 
                        key={comanda.id}
                        className="p-4 border border-red-500/30 bg-red-500/5 rounded-lg cursor-pointer hover:bg-red-500/10 transition-all mb-2"
                        onClick={() => loadOpenComanda(comanda)}
                        data-testid={`open-comanda-${comanda.id}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 font-bold">
                              {client?.name?.substring(0,1) || '?'}
                            </div>
                            <div>
                              <p className="font-bold text-sm">{client?.name || 'Sem cliente'}</p>
                              <p className="text-xs text-muted-foreground">
                                {comanda.barberName || 'Profissional'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <p className="font-bold text-lg text-red-500">
                                R$ {parseFloat(comanda.total || 0).toFixed(2)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(comanda.createdAt).toLocaleString('pt-BR', { 
                                  day: '2-digit', 
                                  month: '2-digit', 
                                  hour: '2-digit', 
                                  minute: '2-digit' 
                                })}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm('Tem certeza que deseja cancelar esta comanda? Esta ação não pode ser desfeita.')) {
                                  updateComandaMutation.mutateAsync({ id: comanda.id, status: 'cancelled' }).then(() => {
                                    toast({ title: "Comanda cancelada!" });
                                    refetchOpenComandas();
                                  });
                                }
                              }}
                              data-testid={`button-cancel-comanda-${comanda.id}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        {comanda.items && comanda.items.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-red-500/20">
                            <p className="text-xs text-muted-foreground">
                              {comanda.items.length} {comanda.items.length === 1 ? 'item' : 'itens'}: {' '}
                              {comanda.items.slice(0, 3).map((i: any) => i.name || 'Item').join(', ')}
                              {comanda.items.length > 3 && '...'}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {todayComandas.length > 0 && (
                <div>
                  {oldComandas.length > 0 && (
                    <p className="text-xs font-bold text-muted-foreground mb-2">COMANDAS DE HOJE</p>
                  )}
                  {todayComandas.map((comanda: any) => {
                    const client = clients.find((c: any) => c.id === comanda.clientId);
                    return (
                      <div 
                        key={comanda.id}
                        className="p-4 border border-yellow-500/30 bg-yellow-500/5 rounded-lg cursor-pointer hover:bg-yellow-500/10 transition-all mb-2"
                        onClick={() => loadOpenComanda(comanda)}
                        data-testid={`open-comanda-${comanda.id}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-500 font-bold">
                              {client?.name?.substring(0,1) || '?'}
                            </div>
                            <div>
                              <p className="font-bold text-sm">{client?.name || 'Sem cliente'}</p>
                              <p className="text-xs text-muted-foreground">
                                {comanda.barberName || 'Profissional'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <p className="font-bold text-lg text-yellow-500">
                                R$ {parseFloat(comanda.total || 0).toFixed(2)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(comanda.createdAt).toLocaleString('pt-BR', { 
                                  day: '2-digit', 
                                  month: '2-digit', 
                                  hour: '2-digit', 
                                  minute: '2-digit' 
                                })}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm('Tem certeza que deseja cancelar esta comanda? Esta ação não pode ser desfeita.')) {
                                  updateComandaMutation.mutateAsync({ id: comanda.id, status: 'cancelled' }).then(() => {
                                    toast({ title: "Comanda cancelada!" });
                                    refetchOpenComandas();
                                  });
                                }
                              }}
                              data-testid={`button-cancel-comanda-${comanda.id}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        {comanda.items && comanda.items.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-yellow-500/20">
                            <p className="text-xs text-muted-foreground">
                              {comanda.items.length} {comanda.items.length === 1 ? 'item' : 'itens'}: {' '}
                              {comanda.items.slice(0, 3).map((i: any) => i.name || 'Item').join(', ')}
                              {comanda.items.length > 3 && '...'}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {openComandas.length === 0 && (
                <div className="p-8 text-center text-muted-foreground border border-dashed border-border rounded-lg">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Nenhuma comanda em espera</p>
                </div>
              )}
            </div>
          </ScrollArea>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpenComandasDialogOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function ItemCard({ item, type, onAdd }: { item: any, type: string, onAdd: () => void }) {
  return (
    <Card 
      className="cursor-pointer hover:border-primary/50 hover:bg-accent/5 transition-all group overflow-hidden" 
      onClick={onAdd}
      data-testid={`item-card-${type}-${item.id}`}
    >
      <CardContent className="p-4 flex flex-col h-full justify-between gap-4">
        <div>
          <div className="flex justify-between items-start mb-2">
            <div className={`
              p-2 rounded-lg 
              ${type === 'service' ? 'bg-blue-500/10 text-blue-500' : type === 'product' ? 'bg-orange-500/10 text-orange-500' : 'bg-purple-500/10 text-purple-500'}
            `}>
              {type === 'service' ? <Scissors className="w-5 h-5" /> : type === 'product' ? <ShoppingBag className="w-5 h-5" /> : <Package className="w-5 h-5" />}
            </div>
            <span className="font-bold text-lg">R$ {parseFloat(item.price).toFixed(2)}</span>
          </div>
          <h3 className="font-bold text-foreground line-clamp-2">{item.name}</h3>
          <p className="text-xs text-muted-foreground mt-1">{item.category || item.description}</p>
        </div>
        
        {type === 'product' && item.quantity !== undefined && (
          <div className="text-xs flex items-center gap-1 text-muted-foreground">
            <div className={`w-2 h-2 rounded-full ${item.quantity > 5 ? 'bg-green-500' : 'bg-red-500'}`} />
            {item.quantity} em estoque
          </div>
        )}
        {type === 'service' && item.duration && (
          <div className="text-xs text-muted-foreground">
            {item.duration} minutos
          </div>
        )}
        {type === 'package' && item.usageCount && (
          <div className="text-xs text-muted-foreground">
            {item.usageCount} usos inclusos
          </div>
        )}
      </CardContent>
    </Card>
  );
}
