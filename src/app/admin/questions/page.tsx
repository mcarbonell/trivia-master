// src/app/admin/questions/page.tsx
'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { getAllPredefinedQuestions, type PredefinedQuestion } from '@/services/triviaService';
import { getAppCategories } from '@/services/categoryService';
import type { CategoryDefinition } from '@/types';
import type { AppLocale } from '@/lib/i18n-config';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, AlertTriangle, PlusCircle, Edit, Trash2, Eye, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const ITEMS_PER_PAGE = 10;

interface DisplayQuestion extends PredefinedQuestion {
  categoryName?: string;
}

export default function AdminQuestionsPage() {
  const t = useTranslations('AdminQuestionsPage');
  const tCommon = useTranslations();
  const locale = useLocale() as AppLocale;
  const { toast } = useToast();

  const [allQuestions, setAllQuestions] = useState<PredefinedQuestion[]>([]);
  const [categories, setCategories] = useState<CategoryDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fetchedQuestions, fetchedCategories] = await Promise.all([
        getAllPredefinedQuestions(),
        getAppCategories(),
      ]);
      setAllQuestions(fetchedQuestions);
      setCategories(fetchedCategories);
    } catch (err) {
      console.error("Error fetching data:", err);
      setError(t('errorLoading'));
      toast({ variant: "destructive", title: tCommon('toastErrorTitle'), description: t('errorLoading') });
    } finally {
      setLoading(false);
    }
  }, [t, tCommon, toast]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const categoryMap = useMemo(() => {
    return new Map(categories.map(cat => [cat.topicValue, cat.name[locale]]));
  }, [categories, locale]);

  const displayQuestions = useMemo(() => {
    return allQuestions.map(q => ({
      ...q,
      categoryName: categoryMap.get(q.topicValue) || q.topicValue,
    }));
  }, [allQuestions, categoryMap]);

  const paginatedQuestions = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return displayQuestions.slice(startIndex, endIndex);
  }, [displayQuestions, currentPage]);

  const totalPages = Math.ceil(displayQuestions.length / ITEMS_PER_PAGE);

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const truncateText = (text: string, maxLength: number = 50) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="shadow-lg border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center"><AlertTriangle className="mr-2 h-6 w-6" />{t('errorTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive">{error}</p>
        </CardContent>
         <CardFooter>
            <Button onClick={fetchAllData} variant="outline">
                <RefreshCw className="mr-2 h-4 w-4" />
                {tCommon('retryButton')}
            </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
         <div>
            <h1 className="text-3xl font-headline text-primary">{t('title')}</h1>
            <p className="text-muted-foreground">{t('description')}</p>
         </div>
         <Button disabled>
            <PlusCircle className="mr-2 h-5 w-5" />
            {t('addButton')}
        </Button>
      </header>
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>{t('questionsListTitle')}</CardTitle>
          <CardDescription>{t('questionsListDescription', { count: displayQuestions.length })}</CardDescription>
        </CardHeader>
        <CardContent>
          {paginatedQuestions.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">{t('noQuestions')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('tableQuestion')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('tableCategory')}</TableHead>
                  <TableHead>{t('tableDifficulty')}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t('tableCorrectAnswer')}</TableHead>
                  <TableHead className="text-right">{t('tableActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedQuestions.map((question) => (
                  <TableRow key={question.id}>
                    <TableCell className="font-medium">{truncateText(question.question[locale] || 'N/A', 70)}</TableCell>
                    <TableCell className="hidden md:table-cell">{question.categoryName}</TableCell>
                    <TableCell>{tCommon(`difficultyLevels.${question.difficulty}` as any) || question.difficulty}</TableCell>
                    <TableCell className="hidden lg:table-cell">{truncateText(question.answers[question.correctAnswerIndex]?.[locale] || 'N/A', 50)}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="outline" size="icon" className="h-8 w-8" disabled>
                        <Eye className="h-4 w-4" />
                        <span className="sr-only">{t('viewButton')}</span>
                      </Button>
                       <Button variant="outline" size="icon" className="h-8 w-8" disabled>
                        <Edit className="h-4 w-4" />
                        <span className="sr-only">{t('editButton')}</span>
                      </Button>
                      <Button variant="destructive" size="icon" className="h-8 w-8" disabled>
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">{t('deleteButton')}</span>
                      </Button>
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
              {t('paginationInfo', { currentPage, totalPages, totalItems: displayQuestions.length })}
            </div>
            <div className="space-x-2">
              <Button variant="outline" size="sm" onClick={handlePreviousPage} disabled={currentPage === 1}>
                {t('previousPage')}
              </Button>
              <Button variant="outline" size="sm" onClick={handleNextPage} disabled={currentPage === totalPages}>
                {t('nextPage')}
              </Button>
            </div>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
