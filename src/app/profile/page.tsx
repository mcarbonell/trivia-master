// src/app/profile/page.tsx
'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { getUserGameSessions } from '@/services/gameSessionService';
import type { GameSession } from '@/types';
import type { AppLocale } from '@/lib/i18n-config';
import { format } from 'date-fns';
import { es as esLocale, enUS as enLocaleUS } from 'date-fns/locale';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, RefreshCw, ArrowLeft, LogOut, UserCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

const ITEMS_PER_PAGE = 10;

export default function ProfilePage() {
  const t = useTranslations('ProfilePage');
  const tCommon = useTranslations();
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const currentLocale = useLocale() as AppLocale;
  const { toast } = useToast();

  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const dateLocale = currentLocale === 'es' ? esLocale : enLocaleUS;

  const fetchGameSessions = useCallback(async (userId: string) => {
    setLoadingSessions(true);
    setError(null);
    try {
      const fetchedSessions = await getUserGameSessions(userId);
      setSessions(fetchedSessions);
    } catch (err) {
      console.error("Error fetching game sessions:", err);
      setError(t('errorLoadingHistory'));
      toast({ variant: 'destructive', title: tCommon('toastErrorTitle'), description: t('errorLoadingHistory') });
    } finally {
      setLoadingSessions(false);
    }
  }, [t, tCommon, toast]);

  useEffect(() => {
    if (!authLoading) {
      if (user) {
        fetchGameSessions(user.uid);
      } else {
        router.replace('/login');
      }
    }
  }, [user, authLoading, router, fetchGameSessions]);

  const paginatedSessions = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return sessions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [sessions, currentPage]);

  const totalPages = Math.ceil(sessions.length / ITEMS_PER_PAGE);

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push('/');
    } catch (error) {
      console.error('Error signing out from profile:', error);
      toast({ variant: 'destructive', title: tCommon('toastErrorTitle'), description: tCommon('errorGeneric') });
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 flex flex-col items-center min-h-screen bg-background text-foreground">
      <header className="my-6 sm:my-8 text-center w-full max-w-3xl">
        <div className="flex justify-between items-center mb-2 sm:mb-4">
          <Button variant="outline" asChild>
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('backToGame')}
            </Link>
          </Button>
          <h1 className="text-3xl sm:text-4xl font-headline font-bold text-primary">{t('title')}</h1>
          <div className="w-24" />
        </div>
      </header>

      <main className="w-full max-w-3xl flex-grow space-y-8">
        <Card className="shadow-lg">
          <CardHeader className="flex-row items-center gap-4 space-y-0">
            <UserCircle className="h-12 w-12 text-muted-foreground" />
            <div>
              <CardTitle className="text-2xl">{t('welcome')}</CardTitle>
              <CardDescription>{user.email}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button onClick={handleSignOut} variant="outline">
              <LogOut className="mr-2 h-4 w-4" />
              {tCommon('logoutButton')}
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>{t('historyTitle')}</CardTitle>
            <CardDescription>{t('historyDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingSessions ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
              </div>
            ) : error ? (
              <div className="text-destructive text-center py-4">
                <AlertTriangle className="inline-block mr-2 h-5 w-5" />
                {error}
                <Button onClick={() => fetchGameSessions(user.uid)} variant="outline" size="sm" className="ml-2">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {tCommon('retryButton')}
                </Button>
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">{t('noHistory')}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[25%] hidden sm:table-cell">{t('tableDate')}</TableHead>
                    <TableHead className="w-[40%]">{t('tableCategory')}</TableHead>
                    <TableHead className="w-[20%] hidden sm:table-cell">{t('tableDifficulty')}</TableHead>
                    <TableHead className="w-[15%] text-right">{t('tableScore')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedSessions.map(session => (
                    <TableRow key={session.id}>
                      <TableCell className="hidden sm:table-cell">
                        {format(new Date(session.completedAt), 'PPp', { locale: dateLocale })}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{session.categoryName[currentLocale]}</div>
                        {session.isCustomTopic && <Badge variant="secondary">{t('customTopicBadge')}</Badge>}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {tCommon(`difficultyLevels.${session.difficultyMode}` as any, { defaultValue: session.difficultyMode })}
                      </TableCell>
                      <TableCell className="text-right">
                        {session.finalScoreCorrect}/{session.totalQuestions}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
          {totalPages > 1 && (
            <CardFooter className="flex items-center justify-between border-t pt-4">
              <div className="text-sm text-muted-foreground">
                {tCommon('AdminQuestionsPage.paginationInfo', { currentPage, totalPages, totalItems: sessions.length })}
              </div>
              <div className="space-x-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                  {tCommon('AdminQuestionsPage.previousPage')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                  {tCommon('AdminQuestionsPage.nextPage')}
                </Button>
              </div>
            </CardFooter>
          )}
        </Card>
      </main>
    </div>
  );
}
