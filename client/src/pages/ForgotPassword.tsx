import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, ArrowLeft, Send, CheckCircle } from "lucide-react";
import bgImage from "@assets/generated_images/luxury_dark_barbershop_background_with_gold_accents.png";
import { useToast } from "@/hooks/use-toast";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao enviar e-mail");
      }

      setIsSent(true);
      toast({
        title: "E-mail enviado!",
        description: data.message,
      });
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível enviar o e-mail.",
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
                Recuperação de Senha
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            {isSent ? (
              <div className="text-center space-y-4 py-6">
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
                <h3 className="text-xl font-semibold text-white">E-mail Enviado!</h3>
                <p className="text-muted-foreground">
                  Se o e-mail <span className="text-primary">{email}</span> estiver cadastrado, 
                  você receberá um link para redefinir sua senha.
                </p>
                <p className="text-sm text-muted-foreground">
                  Verifique também sua pasta de spam.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <p className="text-sm text-muted-foreground text-center">
                  Digite seu e-mail cadastrado e enviaremos um link para você redefinir sua senha.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
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
                      data-testid="input-email"
                    />
                  </div>
                </div>
                <Button 
                  type="submit" 
                  className="w-full font-semibold h-11" 
                  disabled={isLoading}
                  data-testid="button-submit"
                >
                  {isLoading ? "Enviando..." : (
                    <span className="flex items-center gap-2">
                      Enviar Link <Send className="w-4 h-4" />
                    </span>
                  )}
                </Button>
              </form>
            )}
          </CardContent>

          <CardFooter className="text-center text-xs text-muted-foreground flex flex-col gap-2">
            <Link href="/" className="text-white hover:text-primary transition-colors flex items-center gap-1 justify-center">
              <ArrowLeft className="w-3 h-3" /> Voltar para o login
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
