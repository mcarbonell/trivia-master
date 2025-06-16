// src/app/admin/questions/page.tsx
'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { getAllPredefinedQuestions, deletePredefinedQuestion, type PredefinedQuestion } from '@/services/triviaService';
import { getAppCategories } from '@/services/categoryService';
import type { CategoryDefinition, DifficultyLevel } from '@/types';
import type { AppLocale } from '@/lib/i18n-config';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, AlertTriangle, PlusCircle, Eye, Edit, Trash2, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const ITEMS_PER_PAGE = 10;
const ALL_FILTER_VALUE = 'all';

interface DisplayQuestion extends PredefinedQuestion {
  categoryName?: string;
}

const ALL_DIFFICULTY_LEVELS: DifficultyLevel[] = ["easy", "medium", "hard"];

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

  const [selectedCategory, setSelectedCategory] = useState<string>(ALL_FILTER_VALUE);
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>(ALL_FILTER_VALUE);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fetchedQuestions, fetchedCategories] = await Promise.all([
        getAllPredefinedQuestions(),
        getAppCategories(),
      ]);
      setAllQuestions(fetchedQuestions);
      setCategories(fetchedCategories.filter(cat => cat.isPredefined !== false));
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

  const filteredQuestions = useMemo(() => {
    return allQuestions
      .filter(q => selectedCategory === ALL_FILTER_VALUE || q.topicValue === selectedCategory)
      .filter(q => selectedDifficulty === ALL_FILTER_VALUE || q.difficulty === selectedDifficulty);
  }, [allQuestions, selectedCategory, selectedDifficulty]);

  const displayQuestions = useMemo(() => {
    return filteredQuestions.map(q => ({
      ...q,
      categoryName: categoryMap.get(q.topicValue) || q.topicValue,
    }));
  }, [filteredQuestions, categoryMap]);

  const paginatedQuestions = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return displayQuestions.slice(startIndex, endIndex);
  }, [displayQuestions, currentPage]);

  const totalPages = Math.ceil(displayQuestions.length / ITEMS_PER_PAGE);

  const handleFilterChange = () => {
    setCurrentPage(1);
  };

  useEffect(handleFilterChange, [selectedCategory, selectedDifficulty]);

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

  const handleDeleteQuestion = async (questionId: string, questionText: string) => {
    try {
      await deletePredefinedQuestion(questionId);
      toast({ title: tCommon('toastSuccessTitle'), description: t('toastDeleteSuccess', { question: truncateText(questionText, 30) }) });
      await fetchAllData(); 
    } catch (err) {
      console.error("Error deleting question:", err);
      toast({ variant: "destructive", title: tCommon('toastErrorTitle'), description: t('toastDeleteError') });
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
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
            <div>
              <CardTitle>{t('questionsListTitle')}</CardTitle>
              <CardDescription>{t('questionsListDescriptionFiltered', { count: displayQuestions.length, total: allQuestions.length })}</CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 md:gap-4">
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder={t('filterCategoryPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>{t('allCategories')}</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat.topicValue} value={cat.topicValue}>
                      {cat.name[locale]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder={t('filterDifficultyPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>{t('allDifficulties')}</SelectItem>
                  {ALL_DIFFICULTY_LEVELS.map(diff => (
                     <SelectItem key={diff} value={diff}>
                        {tCommon(`difficultyLevels.${diff}` as any)}
                     </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {paginatedQuestions.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">{t('noQuestionsFound')}</p>
          ) : (
            <TooltipProvider delayDuration={100}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%] sm:w-[45%] md:w-[50%]">{t('tableQuestion')}</TableHead>
                    <TableHead className="hidden md:table-cell w-[15%] sm:w-[15%] md:w-[15%]">{t('tableCategory')}</TableHead>
                    <TableHead className="w-[15%] sm:w-[15%] md:w-[10%]">{t('tableDifficulty')}</TableHead>
                    <TableHead className="hidden lg:table-cell w-[20%] sm:w-[15%] md:w-[15%]">{t('tableCorrectAnswer')}</TableHead>
                    <TableHead className="text-right w-[10%] sm:w-[10%] md:w-[10%]">{t('tableActions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedQuestions.map((question) => (
                    <TableRow key={question.id}>
                      <TableCell className="font-medium">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="block break-words cursor-default">
                              {truncateText(question.question[locale] || 'N/A', 70)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" align="start">
                            <p className="max-w-md break-words">{question.question[locale] || 'N/A'}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{question.categoryName}</TableCell>
                      <TableCell>{tCommon(`difficultyLevels.${question.difficulty}` as any) || question.difficulty}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                         <span className="block break-words">
                           {truncateText(question.answers[question.correctAnswerIndex]?.[locale] || 'N/A', 40)}
                         </span>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="outline" size="icon" className="h-8 w-8" disabled>
                          <Eye className="h-4 w-4" />
                          <span className="sr-only">{t('viewButton')}</span>
                        </Button>
                         <Button variant="outline" size="icon" className="h-8 w-8" disabled>
                          <Edit className="h-4 w-4" />
                          <span className="sr-only">{t('editButton')}</span>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon" className="h-8 w-8">
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">{t('deleteButton')}</span>
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t('deleteConfirmTitle')}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t('deleteConfirmDescription', { question: truncateText(question.question[locale] || 'N/A', 50) })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteQuestion(question.id, question.question[locale] || 'N/A')} className="bg-destructive hover:bg-destructive/90">
                                {t('deleteButton')}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
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
         {displayQuestions.length === 0 && allQuestions.length > 0 && (
            <CardFooter className="pt-4">
                <p className="text-sm text-muted-foreground">{t('noQuestionsMatchFilters')}</p>
            </CardFooter>
        )}
      </Card>
    </div>
  );
}

