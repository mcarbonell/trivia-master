// src/app/login/page.tsx
'use client';

import { useState, type FormEvent, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslations } from 'next-intl';
import { Loader2, LogIn, UserPlus } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const t = useTranslations('LoginPage');
  const { signIn, signUp, loading: authLoading, user } = useAuth();
  const router = useRouter();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // If the user is logged in, redirect them away from the login page to the home page.
    if (!authLoading && user) {
      router.replace('/'); 
    }
  }, [authLoading, user, router]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (isSignUp && password !== confirmPassword) {
      setError(t('errorPasswordsDoNotMatch'));
      return;
    }
    
    setIsSubmitting(true);
    try {
      if (isSignUp) {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
      // On success, useEffect will redirect.
    } catch (err: any) {
      if (err.code) {
          switch (err.code) {
              case 'auth/invalid-credential':
              case 'auth/user-not-found':
              case 'auth/wrong-password':
                  setError(t('errorInvalidCredentials'));
                  break;
              case 'auth/email-already-in-use':
                  setError(t('errorEmailInUse'));
                  break;
              case 'auth/weak-password':
                  setError(t('errorWeakPassword'));
                  break;
              case 'auth/invalid-email':
                  setError(t('errorInvalidEmail'));
                  break;
              default:
                  setError(t('errorGeneric'));
                  break;
          }
      } else {
        setError(t('errorGeneric'));
      }
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (authLoading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Link href="/" className="absolute top-4 left-4">
            <Button variant="outline">{t('backToHome')}</Button>
        </Link>
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-headline text-primary">{isSignUp ? t('titleSignUp') : t('title')}</CardTitle>
          <CardDescription>{isSignUp ? t('descriptionSignUp') : t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">{t('emailLabel')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('emailPlaceholder')}
                required
                disabled={isSubmitting || authLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('passwordLabel')}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={isSubmitting || authLoading}
              />
            </div>
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t('confirmPasswordLabel')}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={isSubmitting || authLoading}
                />
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isSubmitting || authLoading}>
              {isSubmitting || authLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : isSignUp ? (
                <UserPlus className="mr-2 h-4 w-4" />
              ) : (
                <LogIn className="mr-2 h-4 w-4" />
              )}
              {isSignUp ? t('submitButtonSignUp') : t('submitButton')}
            </Button>
          </form>
        </CardContent>
         <CardFooter className="flex flex-col items-center justify-center text-sm text-muted-foreground mt-4 gap-2">
            <button onClick={() => setIsSignUp(!isSignUp)} className="hover:text-primary hover:underline">
                {isSignUp ? t('toggleToLogin') : t('toggleToSignUp')}
            </button>
            <p className="text-xs">{t('adminOnlyNote')}</p>
        </CardFooter>
      </Card>
    </div>
  );
}
