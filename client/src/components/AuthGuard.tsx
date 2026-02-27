import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/api";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: auth, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !auth?.user) {
      setLocation("/");
    }
  }, [auth, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary mx-auto flex items-center justify-center text-primary-foreground shadow-[0_0_20px_rgba(212,175,55,0.4)] animate-pulse">
            <span className="font-serif font-bold text-3xl">B</span>
          </div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!auth?.user) {
    return null;
  }

  return <>{children}</>;
}
