import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Mail, ArrowRight, User, Store } from "lucide-react";
import bgImage from "@assets/generated_images/luxury_dark_barbershop_background_with_gold_accents.png";
import { useSignup } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function Signup() {
  const [barbershopName, setBarbershopName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const signupMutation = useSignup();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await signupMutation.mutateAsync({ barbershopName, name, email, password });
      toast({
        title: "Conta criada com sucesso!",
        description: "Bem-vindo ao BarberGold. Configure sua barbearia agora.",
      });
      setLocation("/dashboard");
    } catch (error: any) {
      toast({
        title: "Erro ao criar conta",
        description: error.message || "Tente novamente mais tarde.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-background relative overflow-hidden">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0 z-0">
        <img 
          src={bgImage} 
          alt="Luxury Barbershop" 
          className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" />
      </div>

      <div className="w-full flex items-center justify-center z-10 p-4">
        <Card className="w-full max-w-md border-primary/20 bg-black/80 backdrop-blur-md shadow-2xl">
          <CardHeader className="space-y-4 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-[0_0_20px_rgba(212,175,55,0.4)]">
              <span className="font-serif font-bold text-3xl">B</span>
            </div>
            <div className="space-y-1">
              <CardTitle className="text-3xl font-serif tracking-wide text-foreground">Criar Conta</CardTitle>
              <CardDescription className="text-muted-foreground text-sm">
                Configure sua barbearia em minutos
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="barbershopName">Nome da Barbearia</Label>
                <div className="relative">
                  <Store className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="barbershopName" 
                    type="text" 
                    placeholder="Barbearia Elegance" 
                    className="pl-10 bg-white/5 border-white/10 focus:border-primary/50 transition-colors"
                    value={barbershopName}
                    onChange={(e) => setBarbershopName(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Seu Nome</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="name" 
                    type="text" 
                    placeholder="João Silva" 
                    className="pl-10 bg-white/5 border-white/10 focus:border-primary/50 transition-colors"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="seu@email.com" 
                    className="pl-10 bg-white/5 border-white/10 focus:border-primary/50 transition-colors"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="password" 
                    type="password" 
                    placeholder="••••••••" 
                    className="pl-10 bg-white/5 border-white/10 focus:border-primary/50 transition-colors"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Mínimo de 6 caracteres</p>
              </div>
              <Button 
                type="submit" 
                className="w-full font-semibold h-11" 
                disabled={signupMutation.isPending}
              >
                {signupMutation.isPending ? "Criando..." : (
                  <span className="flex items-center gap-2">
                    Criar Conta <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="text-center text-xs text-muted-foreground flex flex-col gap-2">
            <p>Já tem uma conta? <a href="/" className="text-white hover:text-primary transition-colors">Fazer login</a></p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
