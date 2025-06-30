// src/app/admin/layout.tsx
'use client';

import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Loader2, LogOut, LayoutDashboard, ListChecks, HelpCircle, ShieldAlert, MessageSquareText, Home, Users, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const t = useTranslations('AdminLayout');
  const tCommon = useTranslations();
  const { user, userProfile, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        // Not logged in at all, redirect to login
        router.replace('/login');
      } else if (userProfile && userProfile.role !== 'admin') {
        // Logged in, but is not an admin, redirect to home page
        router.replace('/play');
        toast({
            variant: "destructive",
            title: tCommon('toastErrorTitle') as string,
            description: t('accessDenied')
        });
      }
      // If user is logged in, but userProfile is still loading, the loading screen will show.
      // Once userProfile loads, this effect will re-run and the role check will trigger.
    }
  }, [user, userProfile, loading, router, toast, t, tCommon]);


  const handleSignOut = async () => {
    try {
      await signOut();
      router.push('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Show loading spinner while auth state is resolving or if user profile is being fetched
  if (loading || !user || !userProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }
  
  // Final check to ensure only admins render the layout content
  if (userProfile.role !== 'admin') {
     // This is a fallback loading state while redirection happens
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
    { href: '/admin/reports', label: t('navReports'), icon: ShieldAlert },
    { href: '/admin/suggestions', label: t('navSuggestions'), icon: MessageSquareText },
    { href: '/admin/users', label: t('navUsers'), icon: Users },
    { href: '/admin/settings', label: t('navSettings'), icon: Settings },
  ];

  return (
    <div className="flex min-h-screen bg-muted/40">
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-60 flex-col border-r bg-background sm:flex">
        <nav className="flex flex-col items-start gap-2 p-4">
          <Link href="/" className="mb-2 self-center">
            <h2 className="text-lg font-semibold tracking-tight text-primary hover:text-primary/80">
              {t('adminPanelTitle')}
            </h2>
          </Link>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary',
                pathname.startsWith(item.href) && (item.href !== '/admin/dashboard' || pathname === item.href) && 'bg-muted text-primary font-semibold'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto p-4 space-y-2">
           <Link href="/play" passHref>
             <Button variant="outline" className="w-full">
              <Home className="mr-2 h-4 w-4" />
              {t('backToGame')}
             </Button>
           </Link>
          <Button onClick={handleSignOut} variant="outline" className="w-full">
            <LogOut className="mr-2 h-4 w-4" />
            {t('logoutButton')}
          </Button>
        </div>
      </aside>
      <div className="flex flex-col sm:gap-4 sm:py-4 sm:pl-64 w-full">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
          <div className="sm:hidden">
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
