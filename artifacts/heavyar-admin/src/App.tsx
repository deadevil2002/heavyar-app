import { type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';
import { useAdminSession, queryClient, fetchApi } from '@/lib/api';
import { AuthProvider, useAuth } from '@/lib/auth';
import { AppStateProvider } from '@/lib/app-state';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { LogOut, ShieldAlert, Loader2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';

// Pages
import Dashboard from '@/pages/dashboard';
import Users from '@/pages/users';
import Providers from '@/pages/providers';
import Drivers from '@/pages/drivers';
import Equipment from '@/pages/equipment';
import Requests from '@/pages/requests';
import Payments from '@/pages/payments';
import Invoices from '@/pages/invoices';
import Refunds from '@/pages/refunds';
import Complaints from '@/pages/complaints';
import Verification from '@/pages/verification';
import ProviderConfigs from '@/pages/providers-config';
import Configuration from '@/pages/configuration';
import Audit from '@/pages/audit';
import Notifications from '@/pages/notifications';
import Login from '@/pages/login';
import AcceptInvite from '@/pages/accept-invite';
import PublicPage, { type PublicPageKind } from '@/pages/public';
import Security from '@/pages/security';
import Campaigns from '@/pages/campaigns';
import Staff from '@/pages/staff';
import Gateways from '@/pages/gateways';
import IdentityIntegrations from '@/pages/identity-integrations';

function BootstrapRequired() {
  const { logout, refreshClaims } = useAuth();

  const bootstrapMutation = useMutation({
    mutationFn: () => fetchApi('/owner-bootstrap', { method: 'POST' }),
    onSuccess: async () => {
      await refreshClaims();
    },
  });

  return (
    <div className="flex flex-col h-screen items-center justify-center bg-background text-center p-4">
      <ShieldAlert className="w-16 h-16 text-primary mb-4" />
      <h1 className="text-2xl font-bold mb-2">Bootstrap Required</h1>
      <p className="text-muted-foreground mb-8 max-w-md">
        This system has no registered owner. As a legacy super admin, you must bootstrap your account to assume ownership before accessing the system.
      </p>
      <div className="flex gap-4">
        <Button onClick={() => bootstrapMutation.mutate()} disabled={bootstrapMutation.isPending}>
          {bootstrapMutation.isPending && <Loader2 className="ms-2 h-4 w-4 animate-spin" />}
          Bootstrap Owner Account
        </Button>
        <Button variant="outline" onClick={logout} disabled={bootstrapMutation.isPending}>
          <LogOut className="w-4 h-4 me-2" /> Sign Out
        </Button>
      </div>
    </div>
  );
}

function Router() {
  const [location] = useLocation();
  const { user, loading, logout } = useAuth();
  const publicPages: Record<string, PublicPageKind> = {
    '/privacy': 'privacy',
    '/terms': 'terms',
    '/support': 'support',
    '/account-deletion': 'account-deletion',
  };

  if (publicPages[location]) return <PublicPage kind={publicPages[location]} />;

  // Accept Invite route needs to be accessible before session validation
  // so non-staff users can authenticate and then accept their invite.
  if (location.startsWith('/accept-invite')) {
    return <AcceptInvite />;
  }

  const { data: session, isLoading: isSessionLoading, error } = useAdminSession();

  if (loading || (user && isSessionLoading)) {
    return <div className="flex h-screen items-center justify-center bg-background"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  }

  if (!user) {
    return <Login />;
  }

  if (error) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-background text-center p-4">
        <ShieldAlert className="w-16 h-16 text-destructive mb-4" />
        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
        <p className="text-muted-foreground mb-8">You do not have permission to access the Heavyar Admin Dashboard.</p>
        <div className="flex gap-4">
          <Button variant="outline" onClick={logout} className="gap-2">
            <LogOut className="w-4 h-4" /> Sign Out
          </Button>
        </div>
      </div>
    );
  }

  if (session?.bootstrapRequired) {
    return <BootstrapRequired />;
  }

  return (
    <Layout>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/users" component={Users} />
          <Route path="/providers" component={Providers} />
          <Route path="/drivers" component={Drivers} />
          <Route path="/equipment" component={Equipment} />
          <Route path="/requests" component={Requests} />
          <Route path="/payments" component={Payments} />
          <Route path="/invoices" component={Invoices} />
          <Route path="/refunds" component={Refunds} />
          <Route path="/complaints" component={Complaints} />
          <Route path="/verification" component={Verification} />
          <Route path="/identity-integrations" component={IdentityIntegrations} />
          <Route path="/providers-config" component={ProviderConfigs} />
          <Route path="/configuration" component={Configuration} />
          <Route path="/audit" component={Audit} />
          <Route path="/notifications" component={Notifications} />
          <Route path="/security" component={Security} />
          <Route path="/campaigns" component={Campaigns} />
          <Route path="/staff" component={Staff} />
          <Route path="/gateways" component={Gateways} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </Layout>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppStateProvider>
        <AuthProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </AppStateProvider>
    </QueryClientProvider>
  );
}

export default App;
