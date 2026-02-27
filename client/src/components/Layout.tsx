import { useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Calendar, 
  Scissors, 
  Users, 
  ShoppingBag, 
  Package, 
  CreditCard, 
  DollarSign,
  Percent,
  Settings,
  LogOut,
  Menu,
  X,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Agenda", href: "/schedule", icon: Calendar },
    { name: "Comanda/POS", href: "/pos", icon: CreditCard },
    { name: "Clientes", href: "/clients", icon: Users },
    { name: "Barbeiros", href: "/barbers", icon: Users },
    { name: "Serviços", href: "/services", icon: Scissors },
    { name: "Produtos", href: "/products", icon: ShoppingBag },
    { name: "Pacotes", href: "/packages", icon: Package },
    { name: "Assinaturas", href: "/subscriptions", icon: RefreshCw },
    { name: "Caixa", href: "/finance", icon: DollarSign },
    { name: "Comissões", href: "/comissoes", icon: Percent },
    { name: "Configurações", href: "/settings", icon: Settings },
  ];

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-64 border-r border-sidebar-border bg-sidebar h-screen sticky top-0">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold font-serif text-xl shadow-[0_0_15px_rgba(212,175,55,0.3)]">
            B
          </div>
          <div>
            <h1 className="font-serif font-bold text-lg tracking-wide text-primary">BARBER<span className="text-foreground">GOLD</span></h1>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">Premium Cuts</p>
          </div>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          {navigation.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.name} href={item.href}>
                <div 
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-all duration-200 cursor-pointer
                    ${isActive 
                      ? "bg-sidebar-primary/10 text-primary border-r-2 border-primary" 
                      : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"}
                  `}
                >
                  <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                  {item.name}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 mb-4 px-2">
            <Avatar className="h-10 w-10 border border-primary/20">
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback>AD</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Admin User</p>
              <p className="text-xs text-muted-foreground truncate">admin@barbergold.com</p>
            </div>
          </div>
          <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10" asChild>
            <Link href="/">
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Link>
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-border bg-sidebar">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold font-serif">B</div>
            <span className="font-serif font-bold text-primary">BARBER<span className="text-foreground">GOLD</span></span>
          </div>
          <Button variant="ghost" size="icon" onClick={toggleMobileMenu}>
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </header>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-16 left-0 right-0 bottom-0 bg-background z-50 p-4 border-t border-border">
            <nav className="space-y-2">
              {navigation.map((item) => (
                <Link key={item.name} href={item.href} onClick={() => setIsMobileMenuOpen(false)}>
                  <div className={`flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium ${location === item.href ? "bg-sidebar-primary/10 text-primary" : "text-foreground"}`}>
                    <item.icon className="w-5 h-5" />
                    {item.name}
                  </div>
                </Link>
              ))}
            </nav>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 md:p-8 relative">
           {/* Background texture/glow effect */}
           <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none -z-10" />
           {children}
        </main>
      </div>
    </div>
  );
}
