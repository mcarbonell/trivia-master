// src/app/admin/layout.tsx
'use client';

import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Loader2, LogOut, LayoutDashboard, ListChecks, HelpCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { cn } from '@/lib/utils';

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const t = useTranslations('AdminLayout');
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push('/login');
    } catch (error) {
      console.error('Error signing out:', error);
      // Consider showing a toast message for sign-out errors
    }
  };

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  const navItems = [
    { href: '/admin/dashboard', label: t('navDashboard'), icon: LayoutDashboard },
    { href: '/admin/categories', label: t('navCategories'), icon: ListChecks },
    { href: '/admin/questions', label: t('navQuestions'), icon: HelpCircle },
  ];

  return (
    <div className="flex min-h-screen bg-muted/40">
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-60 flex-col border-r bg-background sm:flex">
        <nav className="flex flex-col items-start gap-2 p-4">
          <h2 className="mb-2 text-lg font-semibold tracking-tight text-primary self-center">
            {t('adminPanelTitle')}
          </h2>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary',
                pathname === item.href && 'bg-muted text-primary font-semibold'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto p-4">
          <Button onClick={handleSignOut} variant="outline" className="w-full">
            <LogOut className="mr-2 h-4 w-4" />
            {t('logoutButton')}
          </Button>
        </div>
      </aside>
      <div className="flex flex-col sm:gap-4 sm:py-4 sm:pl-64 w-full">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
          {/* Mobile Nav Trigger could go here if needed */}
          <div className="sm:hidden"> {/* Placeholder for mobile nav trigger */}
             <h1 className="text-xl font-semibold text-primary">{t('adminPanelTitle')}</h1>
          </div>
          <div className="flex items-center gap-4 ml-auto">
            <LanguageSwitcher />
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {t('loggedInAs', { email: user.email || 'Admin' })}
            </span>
          </div>
        </header>
        <main className="flex-1 p-4 sm:px-6 sm:py-0 bg-background sm:bg-transparent">
          {children}
        </main>
        <footer className="mt-auto pt-8 pb-4 text-center text-sm text-muted-foreground">
            <p>{t('footerText', {year: new Date().getFullYear()})}</p>
        </footer>
      </div>
    </div>
  );
}
