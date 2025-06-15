// src/app/admin/dashboard/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export default function AdminDashboardPage() {
  const t = useTranslations('AdminDashboardPage');
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
      router.push('/login'); 
    } catch (error) {
      console.error('Error signing out:', error);
      setIsSigningOut(false);
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

  return (
    <div className="flex min-h-screen flex-col items-center bg-background p-4">
      <header className="w-full max-w-6xl py-6 flex justify-between items-center">
          <h1 className="text-3xl font-headline text-primary">{t('title')}</h1>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <Button onClick={handleSignOut} variant="outline" disabled={isSigningOut}>
              {isSigningOut ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="mr-2 h-4 w-4" />
              )}
              {t('logoutButton')}
            </Button>
          </div>
      </header>
      <main className="w-full max-w-6xl flex-grow mt-6">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl">{t('welcome', { email: user.email || 'Admin' })}</CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{t('moreFeaturesSoon')}</p>
            {/* Admin dashboard content will go here */}
          </CardContent>
        </Card>
      </main>
      <footer className="mt-auto pt-8 pb-4 text-center text-sm text-muted-foreground">
        <p>{t('footerText', {year: new Date().getFullYear()})}</p>
      </footer>
    </div>
  );
}
