import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, ArrowRight, CheckCircle, XCircle } from "lucide-react";
import bgImage from "@assets/generated_images/luxury_dark_barbershop_background_with_gold_accents.png";
import { useToast } from "@/hooks/use-toast";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get("token");

  useEffect(() => {
    if (!token) {
      setError("Link inválido. Solicite uma nova recuperação de senha.");
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast({
        title: "Erro",
        description: "As senhas não coincidem.",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Erro",
        description: "A senha deve ter pelo menos 6 caracteres.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao redefinir senha");
      }

      setIsSuccess(true);
      toast({
        title: "Sucesso!",
        description: data.message,
      });

      setTimeout(() => {
        setLocation("/");
      }, 3000);
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err.message || "Não foi possível redefinir a senha.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-background relative overflow-hidden">
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
              <CardTitle className="text-3xl font-serif tracking-wide text-foreground">
                BARBER<span className="text-primary">GOLD</span>
              </CardTitle>
              <CardDescription className="text-muted-foreground text-sm uppercase tracking-widest">
                Redefinir Senha
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            {error ? (
              <div className="text-center space-y-4 py-6">
                <XCircle className="w-16 h-16 text-red-500 mx-auto" />
                <h3 className="text-xl font-semibold text-white">Link Inválido</h3>
                <p className="text-muted-foreground">{error}</p>
                <Link href="/forgot-password">
                  <Button className="mt-4">Solicitar Nova Recuperação</Button>
                </Link>
              </div>
            ) : isSuccess ? (
              <div className="text-center space-y-4 py-6">
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
                <h3 className="text-xl font-semibold text-white">Senha Redefinida!</h3>
                <p className="text-muted-foreground">
                  Sua senha foi alterada com sucesso. Você será redirecionado para o login...
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <p className="text-sm text-muted-foreground text-center">
                  Digite sua nova senha abaixo.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="password">Nova Senha</Label>
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
                      data-testid="input-password"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input 
                      id="confirmPassword" 
                      type="password" 
                      placeholder="••••••••" 
                      className="pl-10 bg-white/5 border-white/10 focus:border-primary/50 transition-colors"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      data-testid="input-confirm-password"
                    />
                  </div>
                </div>
                <Button 
                  type="submit" 
                  className="w-full font-semibold h-11" 
                  disabled={isLoading}
                  data-testid="button-submit"
                >
                  {isLoading ? "Redefinindo..." : (
                    <span className="flex items-center gap-2">
                      Redefinir Senha <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </Button>
              </form>
            )}
          </CardContent>

          <CardFooter className="text-center text-xs text-muted-foreground flex flex-col gap-2">
            <Link href="/" className="text-white hover:text-primary transition-colors">
              Voltar para o login
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
