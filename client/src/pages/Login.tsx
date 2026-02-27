import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Mail, ArrowRight } from "lucide-react";
import bgImage from "@assets/generated_images/luxury_dark_barbershop_background_with_gold_accents.png";
import { useLogin } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const loginMutation = useLogin();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await loginMutation.mutateAsync({ email, password });
      setLocation("/dashboard");
    } catch (error: any) {
      toast({
        title: "Erro ao fazer login",
        description: error.message || "Verifique suas credenciais e tente novamente.",
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
              <CardTitle className="text-3xl font-serif tracking-wide text-foreground">BARBER<span className="text-primary">GOLD</span></CardTitle>
              <CardDescription className="text-muted-foreground text-sm uppercase tracking-widest">
                Gestão Premium para Barbearias
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-6">
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
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Senha</Label>
                  <a href="/forgot-password" className="text-xs text-primary hover:underline">Esqueceu a senha?</a>
                </div>
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
                  />
                </div>
              </div>
              <Button 
                type="submit" 
                className="w-full font-semibold h-11" 
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? "Entrando..." : (
                  <span className="flex items-center gap-2">
                    Acessar Sistema <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="text-center text-xs text-muted-foreground flex flex-col gap-2">
            <p>Não tem uma conta? <a href="/signup" className="text-white hover:text-primary transition-colors">Cadastre sua barbearia</a></p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
