// src/app/admin/suggestions/page.tsx
'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { es as esLocale, enUS as enLocaleUS } from 'date-fns/locale'; 
import { getUserSuggestions, deleteSuggestion } from '@/services/suggestionService';
import type { SuggestionData } from '@/types';
import type { AppLocale } from '@/lib/i18n-config';

import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Loader2, AlertTriangle, RefreshCw, Trash2, Mail, UserCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const ITEMS_PER_PAGE = 10;

export default function AdminSuggestionsPage() {
  const t = useTranslations('AdminSuggestionsPage');
  const tCommon = useTranslations();
  const currentLocale = useLocale() as AppLocale;
  const { toast } = useToast();

  const [suggestions, setSuggestions] = useState<SuggestionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const dateLocale = currentLocale === 'es' ? esLocale : enLocaleUS;

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fetchedSuggestions = await getUserSuggestions();
      setSuggestions(fetchedSuggestions);
    } catch (err) {
      console.error("Error fetching suggestions:", err);
      setError(t('errorLoading'));
      toast({ variant: "destructive", title: tCommon('toastErrorTitle') as string, description: t('errorLoading') });
    } finally {
      setLoading(false);
    }
  }, [t, tCommon, toast]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const paginatedSuggestions = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return suggestions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [suggestions, currentPage]);

  const totalPages = Math.ceil(suggestions.length / ITEMS_PER_PAGE);

  const handleDelete = async (suggestionId: string) => {
    try {
      await deleteSuggestion(suggestionId);
      toast({ title: tCommon('toastSuccessTitle') as string, description: t('toastDeleteSuccess') });
      fetchSuggestions(); 
    } catch (err) {
      console.error("Error deleting suggestion:", err);
      toast({ variant: "destructive", title: tCommon('toastErrorTitle') as string, description: t('toastDeleteError') });
    }
  };

  const truncateText = (text: string | undefined, maxLength: number = 70) => {
    if (!text) return t('notAvailable');
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  if (loading) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  if (error) {
    return (
      <Card className="shadow-lg border-destructive">
        <CardHeader><CardTitle className="text-destructive flex items-center"><AlertTriangle className="mr-2 h-6 w-6" />{tCommon('errorTitle')}</CardTitle></CardHeader>
        <CardContent><p className="text-destructive">{error}</p></CardContent>
        <CardFooter><Button onClick={fetchSuggestions} variant="outline"><RefreshCw className="mr-2 h-4 w-4" />{tCommon('retryButton')}</Button></CardFooter>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-headline text-primary">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </header>

      <Card className="shadow-lg">
        <CardHeader>
            <CardTitle>{t('suggestionsListTitle')}</CardTitle>
            <CardDescription>{t('suggestionsListDescription', { count: suggestions.length })}</CardDescription>
        </CardHeader>
        <CardContent>
          {paginatedSuggestions.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">{t('noSuggestionsFound')}</p>
          ) : (
            <TooltipProvider delayDuration={100}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[15%] hidden sm:table-cell">{t('tableDate')}</TableHead>
                    <TableHead className="w-[20%]">{t('tableSender')}</TableHead>
                    <TableHead className="w-[45%]">{t('tableMessage')}</TableHead>
                    <TableHead className="w-[10%] hidden md:table-cell text-center">{t('tableLocale')}</TableHead>
                    <TableHead className="text-right w-[10%]">{t('tableActions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedSuggestions.map((suggestion) => (
                    <TableRow key={suggestion.id}>
                      <TableCell className="hidden sm:table-cell">
                        {suggestion.submittedAt ? format(new Date(suggestion.submittedAt), 'PPp', { locale: dateLocale }) : t('notAvailable')}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          {suggestion.name && (
                            <span className="font-medium flex items-center text-sm">
                              <UserCircle2 className="mr-1.5 h-4 w-4 text-muted-foreground" />
                              {truncateText(suggestion.name, 25)}
                            </span>
                          )}
                          {suggestion.email && (
                            <span className="text-xs text-muted-foreground flex items-center">
                               <Mail className="mr-1.5 h-3 w-3" />
                               {truncateText(suggestion.email, 25)}
                            </span>
                          )}
                          {!suggestion.name && !suggestion.email && (
                            <span className="text-xs italic text-muted-foreground">{t('anonymousSender')}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild><span className="cursor-default">{truncateText(suggestion.message, 60)}</span></TooltipTrigger>
                          <TooltipContent side="top" className="max-w-md bg-background border shadow-lg p-2 rounded-md">
                            <p className="whitespace-pre-wrap">{suggestion.message}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                       <TableCell className="hidden md:table-cell text-center">
                        <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-secondary text-secondary-foreground">
                            {suggestion.locale.toUpperCase()}
                        </span>
                        </TableCell>
                      <TableCell className="text-right">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive hover:text-destructive-foreground">
                                  <Trash2 className="h-4 w-4" />
                                  <span className="sr-only">{tCommon('deleteButton')}</span>
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t('deleteConfirmTitle')}</AlertDialogTitle>
                                  <AlertDialogDescription>{t('deleteConfirmDescription')}</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(suggestion.id)} className="bg-destructive hover:bg-destructive/90">
                                    {tCommon('deleteButton')}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TooltipTrigger>
                          <TooltipContent side="top"><p>{t('tooltipDeleteSuggestion')}</p></TooltipContent>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TooltipProvider>
          )}
        </CardContent>
        {totalPages > 1 && (
          <CardFooter className="flex items-center justify-between border-t pt-4">
            <div className="text-sm text-muted-foreground">
              {tCommon('AdminQuestionsPage.paginationInfo', { currentPage, totalPages, totalItems: suggestions.length })}
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
    </div>
  );
}

