import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Layout from "@/components/Layout";
import AuthGuard from "@/components/AuthGuard";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Dashboard from "@/pages/Dashboard";
import Schedule from "@/pages/Schedule";
import POS from "@/pages/POS";
import Clients from "@/pages/Clients";
import Campanhas from "@/pages/Campanhas";
import Services from "@/pages/Services";
import Products from "@/pages/Products";
import Packages from "@/pages/Packages";
import Subscriptions from "@/pages/Subscriptions";
import Barbers from "@/pages/Barbers";
import Finance from "@/pages/Finance";
import Commissions from "@/pages/Commissions";
import Settings from "@/pages/Settings";
import PublicBooking from "@/pages/PublicBooking";
import BarberLogin from "@/pages/BarberLogin";
import BarberDashboard from "@/pages/BarberDashboard";

const PlaceholderPage = ({ title }: { title: string }) => (
  <AuthGuard>
    <Layout>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-serif font-bold text-foreground">{title}</h1>
      </div>
      <div className="border border-dashed border-border rounded-lg p-12 text-center text-muted-foreground">
        Em breve disponível
      </div>
    </Layout>
  </AuthGuard>
);

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/dashboard">
        <AuthGuard>
          <Dashboard />
        </AuthGuard>
      </Route>
      <Route path="/schedule">
        <AuthGuard>
          <Schedule />
        </AuthGuard>
      </Route>
      <Route path="/pos">
        <AuthGuard>
          <POS />
        </AuthGuard>
      </Route>
      <Route path="/clients">
        <AuthGuard>
          <Clients />
        </AuthGuard>
      </Route>
      <Route path="/campanhas">
        <AuthGuard>
          <Campanhas />
        </AuthGuard>
      </Route>
      <Route path="/services">
        <AuthGuard>
          <Services />
        </AuthGuard>
      </Route>
      <Route path="/products">
        <AuthGuard>
          <Products />
        </AuthGuard>
      </Route>
      <Route path="/packages">
        <AuthGuard>
          <Packages />
        </AuthGuard>
      </Route>
      <Route path="/subscriptions">
        <AuthGuard>
          <Subscriptions />
        </AuthGuard>
      </Route>
      <Route path="/barbers">
        <AuthGuard>
          <Barbers />
        </AuthGuard>
      </Route>
      <Route path="/finance">
        <AuthGuard>
          <Finance />
        </AuthGuard>
      </Route>
      <Route path="/comissoes">
        <AuthGuard>
          <Commissions />
        </AuthGuard>
      </Route>
      <Route path="/settings">
        <AuthGuard>
          <Settings />
        </AuthGuard>
      </Route>
      
      {/* Public booking page - no auth required */}
      <Route path="/agendar/:barbershopId" component={PublicBooking} />
      
      {/* Barber panel - separate auth */}
      <Route path="/barbeiro" component={BarberLogin} />
      <Route path="/barbeiro/painel" component={BarberDashboard} />
      
      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
