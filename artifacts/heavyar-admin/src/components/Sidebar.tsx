import { Link, useLocation } from 'wouter';
import { 
  LayoutDashboard, Users, Truck, Wrench, FileText, 
  CreditCard, FileBox, Undo2, AlertOctagon, ShieldCheck, 
  Settings, Database, History, Bell, LogOut, Globe, Menu, X,
  Shield, Megaphone, UserCog, Wallet, Car, Search, Rocket, ShieldAlert
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useAppState } from '@/lib/app-state';
import { useAdminSession } from '@/lib/api';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

export function Sidebar() {
  const [location] = useLocation();
  const { logout } = useAuth();
  const { language, toggleLanguage, direction } = useAppState();
  const { data: session } = useAdminSession();
  const [isOpen, setIsOpen] = useState(false);

  // Close sidebar when location changes (mobile)
  useEffect(() => {
    setIsOpen(false);
  }, [location]);

  const t = (ar: string, en: string) => language === 'ar' ? ar : en;

  const groups: {
    title: string;
    adminOnly?: boolean;
    links: { href: string; icon: any; label: string; allowedRoles?: string[] }[];
  }[] = [
    {
      title: t('الرئيسية', 'Main'),
      links: [
        { href: '/', icon: LayoutDashboard, label: t('لوحة القيادة', 'Dashboard') },
      ]
    },
    {
      title: t('السوق', 'Marketplace'),
      links: [
        { href: '/users', icon: Users, label: t('المستخدمين', 'Users') },
        { href: '/account-integrity', icon: ShieldAlert, label: t('سلامة الحسابات', 'Account Integrity'), allowedRoles: ['owner', 'super_admin'] },
        { href: '/providers', icon: Truck, label: t('المزودين', 'Providers') },
        { href: '/drivers', icon: Car, label: t('السائقين', 'Drivers') },
        { href: '/equipment', icon: Wrench, label: t('المعدات', 'Equipment') },
        { href: '/requests', icon: FileText, label: t('الطلبات', 'Requests') },
      ]
    },
    {
      title: t('المالية', 'Finance'),
      links: [
        { href: '/payments', icon: CreditCard, label: t('المدفوعات', 'Payments') },
        { href: '/invoices', icon: FileBox, label: t('الفواتير', 'Invoices') },
        { href: '/refunds', icon: Undo2, label: t('المستردات', 'Refunds') },
        { href: '/fees', icon: FileText, label: t('العمولات والرسوم', 'Fees & Commission') },
        { href: '/gateways', icon: Wallet, label: t('بوابات الدفع', 'Payment Gateways') },
      ]
    },
    {
      title: t('الثقة والدعم', 'Trust & Support'),
      links: [
        { href: '/complaints', icon: AlertOctagon, label: t('الشكاوى', 'Complaints') },
        { href: '/verification', icon: ShieldCheck, label: t('التحقق', 'Verification') },
        { href: '/identity-integrations', icon: Shield, label: t('تكامل الهوية', 'Identity Integrations') },
        { href: '/notifications', icon: Bell, label: t('الإشعارات', 'Notifications') },
      ]
    },
    {
      title: t('التسويق', 'Marketing'),
      links: [
        { href: '/campaigns', icon: Megaphone, label: t('الحملات الترويجية', 'Marketing Campaigns') },
        { href: '/early-access', icon: Rocket, label: t('الوصول المبكر', 'Early Access'), allowedRoles: ['owner', 'super_admin', 'marketing', 'admin', 'auditor'] },
        { href: '/seo', icon: Search, label: t('تحسين الظهور والبحث', 'SEO & Search') },
      ]
    },
    {
      title: t('الإدارة', 'Administration'),
      adminOnly: true,
      links: [
        { href: '/staff', icon: UserCog, label: t('فريق العمل', 'Staff & Permissions') },
        { href: '/configuration', icon: Database, label: t('تكوين النظام', 'System Configuration') },
        { href: '/providers-config', icon: Settings, label: t('إعدادات المزودين', 'Provider Configs') },
        { href: '/audit', icon: History, label: t('سجل التدقيق', 'Audit Log') },
        { href: '/security', icon: Shield, label: t('الأمان', 'Security') },
      ]
    }
  ];

  const NavLink = ({ href, icon: Icon, label }: any) => {
    const isActive = location === href || (href !== '/' && location.startsWith(href));
    return (
      <Link href={href} onClick={() => setIsOpen(false)}>
        <div aria-current={isActive ? 'page' : undefined} className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors cursor-pointer ${isActive ? 'bg-primary/20 text-primary font-medium' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}>
          <Icon className="w-5 h-5 flex-shrink-0" />
          <span>{label}</span>
        </div>
      </Link>
    );
  };

  const sidebarContent = (mobile: boolean) => (
    <>
      <div className="h-16 flex items-center justify-between px-6 border-b border-sidebar-border/50 shrink-0">
        <div className="font-bold text-2xl tracking-tight text-primary">
          HEAVYAR
          <span className="text-muted-foreground text-sm ms-2 font-normal">ADMIN</span>
        </div>
        {mobile && (
          <Button
            variant="ghost"
            size="icon"
            className="-me-2"
            onClick={() => setIsOpen(false)}
            aria-label={t('إغلاق القائمة', 'Close menu')}
          >
            <X className="w-5 h-5" />
          </Button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto py-4 px-4 space-y-6">
        {groups.map((group, i) => {
          if (group.adminOnly && !(session?.role === 'owner' || session?.role === 'super_admin' || session?.role === 'admin')) {
            return null;
          }
          return (
            <div key={i} className="space-y-1">
              <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {group.title}
              </div>
              {group.links.map(link => {
                if (link.allowedRoles && !link.allowedRoles.includes(session?.role || '')) {
                  return null;
                }
                return <NavLink key={link.href} {...link} />;
              })}
            </div>
          );
        })}
      </div>

      <div className="p-4 border-t border-sidebar-border/50 space-y-2 shrink-0">
        <Button variant="outline" className="w-full justify-start gap-3 bg-transparent border-white/10 hover:bg-white/5" onClick={toggleLanguage}>
          <Globe className="w-4 h-4" />
          {t('English', 'عربي')}
        </Button>
        <Button variant="destructive" className="w-full justify-start gap-3 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive border-none" onClick={logout}>
          <LogOut className="w-4 h-4" />
          {t('تسجيل الخروج', 'Logout')}
        </Button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Top Header */}
      <div className="md:hidden fixed top-0 inset-x-0 h-16 bg-background border-b border-border z-40 flex items-center justify-between px-4 transition-opacity">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setIsOpen(true)} aria-label={t('فتح القائمة', 'Open menu')}>
            <Menu className="w-6 h-6" />
          </Button>
          <div className={`font-bold text-xl tracking-tight text-primary transition-opacity ${isOpen ? 'opacity-0' : 'opacity-100'}`}>HEAVYAR</div>
        </div>
         <Button variant="ghost" size="icon" onClick={toggleLanguage} title={t('تغيير اللغة', 'Toggle Language')} aria-label={t('تغيير اللغة', 'Toggle Language')}>
          <Globe className="w-5 h-5" />
        </Button>
      </div>
      
      {/* Mobile Backdrop */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-40" onClick={() => setIsOpen(false)} />
      )}

      {/* Desktop sidebar: persistent and never controlled by mobile drawer state. */}
      <aside className="hidden md:flex fixed inset-y-0 start-0 z-30 w-64 bg-sidebar border-e border-sidebar-border flex-col">
        {sidebarContent(false)}
      </aside>

      {/* Mobile drawer: direction is explicit and cannot affect the desktop sidebar. */}
      <aside
        aria-hidden={!isOpen}
        className={`md:hidden fixed inset-y-0 start-0 z-50 w-64 bg-sidebar border-e border-sidebar-border transition-transform flex flex-col ${
          isOpen ? 'translate-x-0' : direction === 'rtl' ? 'translate-x-full' : '-translate-x-full'
        }`}
      >
        {sidebarContent(true)}
      </aside>
    </>
  );
}
