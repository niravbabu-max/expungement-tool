import { Switch, Route, Router, Link, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider, useAuth } from "./lib/auth";
import { Toaster } from "@/components/ui/toaster";
import LoginPage from "./pages/login";
import Dashboard from "./pages/dashboard";
import CaseForm from "./pages/case-form";
import NotFound from "./pages/not-found";
import RecordAnalysis from "./pages/record-analysis";
import { LayoutDashboard, FileText, LogOut, Shield, Users } from "lucide-react";

function Sidebar() {
  const [location] = useLocation();
  const { logout } = useAuth();

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/case/new", label: "New Case", icon: FileText },
    { href: "/record-analysis", label: "Full Record", icon: Users },
  ];

  return (
    <aside className="w-56 bg-[#1B2A4A] min-h-screen flex flex-col print:hidden">
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#01696F] flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white text-sm font-semibold leading-tight">Innovate</p>
            <p className="text-white/60 text-xs leading-tight">Expungement Tool</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const active = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <div className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm cursor-pointer transition-colors ${
                active ? "bg-white/15 text-white" : "text-white/70 hover:text-white hover:bg-white/10"
              }`} data-testid={`nav-${item.label.toLowerCase().replace(" ", "-")}`}>
                <item.icon className="w-4 h-4" />
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-white/10">
        <button onClick={logout} className="flex items-center gap-2 px-3 py-2 text-sm text-white/60 hover:text-white w-full rounded-md hover:bg-white/10 transition-colors" data-testid="button-logout">
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </div>
    </aside>
  );
}

function AppLayout() {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/case/new" component={CaseForm} />
          <Route path="/case/:id" component={CaseForm} />
          <Route path="/record-analysis" component={RecordAnalysis} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function AuthGate() {
  const { authenticated } = useAuth();
  if (!authenticated) return <LoginPage />;
  return <AppLayout />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router hook={useHashLocation}>
          <AuthGate />
        </Router>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
