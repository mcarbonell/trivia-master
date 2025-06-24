// src/app/profile/page.tsx
'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { getUserGameSessions } from '@/services/gameSessionService';
import type { GameSession, BilingualText } from '@/types';
import type { AppLocale } from '@/lib/i18n-config';
import { format } from 'date-fns';
import { es as esLocale, enUS as enLocaleUS } from 'date-fns/locale';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, RefreshCw, ArrowLeft, LogOut, UserCircle, Trophy, TrendingDown, Percent, Gamepad2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Label } from 'recharts';


const ITEMS_PER_PAGE = 10;
const HIGHLIGHTS_THRESHOLD = 5; // Min questions in a category to be considered for highlights

interface CategoryPerformance {
  topicValue: string;
  name: string;
  accuracy: number;
  totalQuestions: number;
  isCustom: boolean;
}

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
      toast({ variant: 'destructive', title: tCommon('toastErrorTitle') as string, description: t('errorLoadingHistory') });
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

  const stats = useMemo(() => {
    if (!sessions || sessions.length === 0) {
      return null;
    }

    const totalCorrect = sessions.reduce((acc, s) => acc + s.finalScoreCorrect, 0);
    const totalIncorrect = sessions.reduce((acc, s) => acc + s.finalScoreIncorrect, 0);
    const totalQuestions = totalCorrect + totalIncorrect;

    const categoryMap = new Map<string, { name: BilingualText; correct: number; total: number; isCustom: boolean }>();

    sessions.forEach(session => {
      const entry = categoryMap.get(session.categoryTopicValue) || {
        name: session.categoryName,
        correct: 0,
        total: 0,
        isCustom: session.isCustomTopic
      };
      entry.correct += session.finalScoreCorrect;
      entry.total += session.totalQuestions;
      categoryMap.set(session.categoryTopicValue, entry);
    });

    const categoryPerformance: CategoryPerformance[] = Array.from(categoryMap.entries()).map(([topicValue, data]) => ({
      topicValue,
      name: data.name[currentLocale],
      accuracy: data.total > 0 ? parseFloat(((data.correct / data.total) * 100).toFixed(1)) : 0,
      totalQuestions: data.total,
      isCustom: data.isCustom,
    })).sort((a,b) => b.totalQuestions - a.totalQuestions);
    
    const significantCategories = categoryPerformance.filter(c => c.totalQuestions >= HIGHLIGHTS_THRESHOLD);

    let bestCategory: CategoryPerformance | null = null;
    let worstCategory: CategoryPerformance | null = null;

    if (significantCategories.length > 0) {
      significantCategories.sort((a, b) => b.accuracy - a.accuracy || b.totalQuestions - a.totalQuestions);
      bestCategory = significantCategories[0]!;
      worstCategory = significantCategories[significantCategories.length - 1]!;
    }
    
    return {
      totalGames: sessions.length,
      totalQuestions,
      totalCorrect,
      overallAccuracy: totalQuestions > 0 ? parseFloat(((totalCorrect / totalQuestions) * 100).toFixed(1)) : 0,
      categoryPerformance,
      bestCategory,
      worstCategory,
    };
  }, [sessions, currentLocale, t]);


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
      toast({ variant: 'destructive', title: tCommon('toastErrorTitle') as string, description: tCommon('errorGeneric') as string });
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border bg-background p-2 shadow-sm">
          <p className="text-sm font-bold text-primary">{`${label}`}</p>
          <p className="text-xs text-muted-foreground">{`${t('accuracy')}: ${payload[0].value}%`}</p>
        </div>
      );
    }
    return null;
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
      <header className="my-6 sm:my-8 text-center w-full max-w-4xl">
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

      <main className="w-full max-w-4xl flex-grow space-y-8">
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

        {loadingSessions ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        ) : error ? (
           <Card className="shadow-lg border-destructive">
            <CardHeader><CardTitle className="text-destructive flex items-center"><AlertTriangle className="mr-2 h-6 w-6" />{tCommon('errorTitle')}</CardTitle></CardHeader>
            <CardContent><p className="text-destructive">{error}</p></CardContent>
            <CardFooter><Button onClick={() => fetchGameSessions(user.uid)} variant="outline"><RefreshCw className="mr-2 h-4 w-4" />{tCommon('retryButton')}</Button></CardFooter>
          </Card>
        ) : !stats ? (
          <Card className="shadow-lg">
            <CardHeader><CardTitle>{t('historyTitle')}</CardTitle></CardHeader>
            <CardContent><p className="text-muted-foreground text-center py-4">{t('noHistory')}</p></CardContent>
          </Card>
        ) : (
          <>
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>{t('statsTitle')}</CardTitle>
                <CardDescription>{t('statsDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-secondary/50 flex flex-col items-center justify-center">
                    <Gamepad2 className="h-8 w-8 text-primary mb-2"/>
                    <p className="text-2xl font-bold">{stats.totalGames}</p>
                    <p className="text-sm text-muted-foreground">{t('totalGames')}</p>
                </div>
                <div className="p-4 rounded-lg bg-secondary/50 flex flex-col items-center justify-center">
                    <Percent className="h-8 w-8 text-primary mb-2"/>
                    <p className="text-2xl font-bold">{stats.overallAccuracy}%</p>
                    <p className="text-sm text-muted-foreground">{t('overallAccuracy')}</p>
                </div>
                <div className="p-4 rounded-lg bg-secondary/50 flex flex-col items-center justify-center">
                    <Trophy className="h-8 w-8 text-green-500 mb-2"/>
                    <p className="text-base font-semibold">{stats.bestCategory?.name || t('notEnoughData')}</p>
                    <p className="text-sm text-muted-foreground">{t('bestCategory')}</p>
                </div>
                 <div className="p-4 rounded-lg bg-secondary/50 flex flex-col items-center justify-center">
                    <TrendingDown className="h-8 w-8 text-red-500 mb-2"/>
                    <p className="text-base font-semibold">{stats.worstCategory?.name || t('notEnoughData')}</p>
                    <p className="text-sm text-muted-foreground">{t('worstCategory')}</p>
                </div>
              </CardContent>
               {(!stats.bestCategory || !stats.worstCategory) && (
                <CardFooter>
                  <p className="text-xs text-muted-foreground">{t('notEnoughDataForHighlights', { count: HIGHLIGHTS_THRESHOLD })}</p>
                </CardFooter>
              )}
            </Card>

            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>{t('categoryPerformanceTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stats.categoryPerformance}>
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-45} textAnchor="end" height={80} />
                    <YAxis>
                      <Label value={t('chartYAxisLabel')} angle={-90} position="insideLeft" style={{ textAnchor: 'middle' }} />
                    </YAxis>
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))' }} />
                    <Bar dataKey="accuracy" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>{t('historyTitle')}</CardTitle>
                <CardDescription>{t('historyDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
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
          </>
        )}
      </main>
    </div>
  );
}
