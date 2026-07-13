import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, History, Settings, Car, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import WhatsNewDialog from '@/components/WhatsNewDialog';
import NotificationBell from '@/components/NotificationBell';
import { useAuth } from '@/lib/AuthContext';

const navItems = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'History', path: '/history', icon: History },
  { label: 'Sold Units', path: '/sold-trackers', icon: Tag, adminOnly: true },
  { label: 'Settings', path: '/settings', icon: Settings },
];

export default function Layout() {
  const location = useLocation();
  const { user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-secondary/50">
      <aside className="md:w-60 bg-sidebar text-sidebar-foreground flex md:flex-col md:min-h-screen shrink-0">
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-white/10">
          <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
            <Car className="w-5 h-5 text-white" />
          </div>
          <div className="hidden md:block">
            <p className="font-heading font-semibold text-white text-sm leading-tight">Repair Pass</p>
            <p className="text-xs text-sidebar-foreground/70">Vehicle Tracker</p>
          </div>
        </div>
        <nav className="flex md:flex-col gap-1 p-3 flex-1">
          {navItems.filter(item => !item.adminOnly || user?.role === 'admin').map(({ label, path, icon: Icon }) => {
            const active = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-white/10 text-white'
                    : 'text-sidebar-foreground hover:bg-white/5 hover:text-white'
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden md:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-end px-4 md:px-8 py-2 border-b bg-background">
          <NotificationBell />
        </div>
        <div className="flex-1">
          <Outlet />
        </div>
      </main>
      <WhatsNewDialog />
    </div>
  );
}