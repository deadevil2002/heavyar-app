import { Link, useLocation } from 'wouter';
import { 
  LayoutDashboard, Users, Truck, Wrench, FileText, 
  CreditCard, FileBox, Undo2, AlertOctagon, ShieldCheck, 
  Settings, Database, History, Bell, LogOut, Globe, Menu, X
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useAppState } from '@/lib/app-state';
import { useAdminSession } from '@/lib/api';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function Sidebar() {
  const [location] = useLocation();
  const { logout } = useAuth();
  const { language, toggleLanguage, direction } = useAppState();
  const { data: session } = useAdminSession();
  const [isOpen, setIsOpen] = useState(false);

  const t = (ar: string, en: string) => language === 'ar' ? ar : en;

  const links = [
    { href: '/', icon: LayoutDashboard, label: t('لوحة القيادة', 'Dashboard') },
    { href: '/users', icon: Users, label: t('المستخدمين', 'Users') },
    { href: '/providers', icon: Truck, label: t('المزودين', 'Providers') },
    { href: '/equipment', icon: Wrench, label: t('المعدات', 'Equipment') },
    { href: '/requests', icon: FileText, label: t('الطلبات', 'Requests') },
    { href: '/payments', icon: CreditCard, label: t('المدفوعات', 'Payments') },
    { href: '/invoices', icon: FileBox, label: t('الفواتير', 'Invoices') },
    { href: '/refunds', icon: Undo2, label: t('المستردات', 'Refunds') },
    { href: '/complaints', icon: AlertOctagon, label: t('الشكاوى', 'Complaints') },
    { href: '/verification', icon: ShieldCheck, label: t('التحقق', 'Verification') },
    { href: '/notifications', icon: Bell, label: t('الإشعارات', 'Notifications') },
  ];

  const adminLinks = [
    { href: '/providers-config', icon: Settings, label: t('إعدادات المزودين', 'Provider Configs') },
    { href: '/configuration', icon: Database, label: t('تكوين النظام', 'Configuration') },
    { href: '/audit', icon: History, label: t('سجل التدقيق', 'Audit Log') },
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

  return (
    <>
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-card border-b border-border z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setIsOpen(!isOpen)} aria-label={t('فتح القائمة', 'Open menu')} aria-expanded={isOpen}>
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </Button>
          <div className="font-bold text-xl tracking-tight text-primary">HEAVYAR</div>
        </div>
         <Button variant="ghost" size="icon" onClick={toggleLanguage} title={t('تغيير اللغة', 'Toggle Language')} aria-label={t('تغيير اللغة', 'Toggle Language')}>
          <Globe className="w-5 h-5" />
        </Button>
      </div>
      
      {isOpen && (
        <div className="md:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-40" onClick={() => setIsOpen(false)} />
      )}
      
      <aside className={`fixed inset-y-0 start-0 z-50 w-64 bg-sidebar border-e border-sidebar-border transition-transform transform ${isOpen ? 'translate-x-0' : 'rtl:translate-x-full ltr:-translate-x-full md:translate-x-0'} flex flex-col`}>
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border/50">
          <div className="font-bold text-2xl tracking-tight text-primary">HEAVYAR<span className="text-muted-foreground text-sm ms-2 font-normal">ADMIN</span></div>
        </div>
        
        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
          {links.map(link => <NavLink key={link.href} {...link} />)}
          
          {(session?.role === 'super_admin' || session?.role === 'admin') && (
            <>
              <div className="pt-6 pb-2 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t('الإدارة', 'Administration')}
              </div>
              {adminLinks.map(link => <NavLink key={link.href} {...link} />)}
            </>
          )}
        </div>
        
        <div className="p-4 border-t border-sidebar-border/50 space-y-2">
          <Button variant="outline" className="w-full justify-start gap-3 bg-transparent border-white/10 hover:bg-white/5" onClick={toggleLanguage}>
            <Globe className="w-4 h-4" />
            {t('English', 'عربي')}
          </Button>
          <Button variant="destructive" className="w-full justify-start gap-3 bg-red-500/10 text-red-500 hover:bg-red-500/20 hover:text-red-400 border-none" onClick={logout}>
            <LogOut className="w-4 h-4" />
            {t('تسجيل الخروج', 'Logout')}
          </Button>
        </div>
      </aside>
    </>
  );
}
