// src/app/admin/reports/page.tsx
'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { es as esLocale, enUS as enLocale } from 'date-fns/locale';
import { getReportedQuestions, updateReportStatus, deleteReport } from '@/services/reportService';
import { deletePredefinedQuestion, updatePredefinedQuestion, getNormalizedQuestionById } from '@/services/triviaService';
import { getAppCategories } from '@/services/categoryService';
import { validateSingleTriviaQuestion, type ValidateSingleQuestionOutput, type QuestionData } from '@/ai/flows/validate-single-trivia-question';
import type { ReportData, ReportStatus, CategoryDefinition, DifficultyLevel, PredefinedQuestion } from '@/types';
import type { AppLocale } from '@/lib/i18n-config';
import type { GenerateTriviaQuestionOutput } from '@/ai/flows/generate-trivia-question';
import { questionFormSchema, type QuestionFormData } from '@/app/admin/questions/page';

import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, AlertTriangle, RefreshCw, Trash2, ClipboardCopy, Edit, Ban, ShieldCheck, CheckCircle, AlertCircle, Wand2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const ITEMS_PER_PAGE = 10;
const REPORT_STATUSES: ReportStatus[] = ['new', 'reviewed', 'resolved', 'ignored'];
const ALL_DIFFICULTY_LEVELS_CONST: DifficultyLevel[] = ["easy", "medium", "hard"];

export default function AdminReportsPage() {
  const t = useTranslations('AdminReportsPage');
  const tCommon = useTranslations();
  const tForm = useTranslations('AdminQuestionsPage.form');
  const currentLocale = useLocale() as AppLocale;
  const { toast } = useToast();

  const [reports, setReports] = useState<ReportData[]>([]);
  const [categories, setCategories] = useState<CategoryDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeFilters, setActiveFilters] = useState<{ status: ReportStatus | 'all' }>({ status: 'new' });

  // For editing a question
  const [isEditQuestionDialogOpen, setIsEditQuestionDialogOpen] = useState(false);
  const [questionToEditData, setQuestionToEditData] = useState<PredefinedQuestion | null>(null);
  const [isSubmittingEditQuestion, setIsSubmittingEditQuestion] = useState(false);
  
  // For AI Validation
  const [isValidationDialogOpen, setIsValidationDialogOpen] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidateSingleQuestionOutput | null>(null);
  const [currentReportForValidation, setCurrentReportForValidation] = useState<ReportData | null>(null);
  const [questionForValidation, setQuestionForValidation] = useState<QuestionData | null>(null);


  const dateLocale = currentLocale === 'es' ? esLocale : enLocale;

  const questionEditForm = useForm<QuestionFormData>({
    resolver: zodResolver(questionFormSchema),
  });

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fetchedReports, fetchedCategories] = await Promise.all([
        getReportedQuestions(),
        getAppCategories(),
      ]);
      setReports(fetchedReports);
      setCategories(fetchedCategories);
    } catch (err) {
      console.error("Error fetching data:", err);
      setError(t('errorLoading'));
      toast({ variant: "destructive", title: tCommon('toastErrorTitle') as string, description: t('errorLoading') });
    } finally {
      setLoading(false);
    }
  }, [t, tCommon, toast]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const categoryMap = useMemo(() => {
    return new Map(categories.map(cat => [cat.topicValue, cat.name[currentLocale]]));
  }, [categories, currentLocale]);

  const filteredReports = useMemo(() => {
    return reports.filter(report => {
      if (activeFilters.status !== 'all' && report.status !== activeFilters.status) {
        return false;
      }
      return true;
    }).sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime());
  }, [reports, activeFilters]);

  const paginatedReports = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredReports.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredReports, currentPage]);

  const totalPages = Math.ceil(filteredReports.length / ITEMS_PER_PAGE);

  const handleFilterChange = () => {
    setCurrentPage(1);
  };

  useEffect(handleFilterChange, [activeFilters]);

  const handleStatusChange = async (reportId: string, newStatus: ReportStatus) => {
    try {
      await updateReportStatus(reportId, newStatus);
      toast({ title: tCommon('toastSuccessTitle') as string, description: t('toastStatusUpdateSuccess') });
      setReports(prev => prev.map(r => r.id === reportId ? { ...r, status: newStatus } : r));
    } catch (err) {
      console.error("Error updating report status:", err);
      toast({ variant: "destructive", title: tCommon('toastErrorTitle') as string, description: t('toastStatusUpdateError') });
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    try {
      await deleteReport(reportId);
      toast({ title: tCommon('toastSuccessTitle') as string, description: t('toastReportDeleteSuccess') });
      fetchAllData(); 
    } catch (err) {
      console.error("Error deleting report:", err);
      toast({ variant: "destructive", title: tCommon('toastErrorTitle') as string, description: t('toastReportDeleteError') });
    }
  };
  
  const handleDeletePredefinedQuestion = async (questionId: string) => {
    try {
      await deletePredefinedQuestion(questionId);
      toast({ title: tCommon('toastSuccessTitle') as string, description: t('toastPredefinedQuestionDeleteSuccess') });
      fetchAllData(); 
    } catch (err) {
      console.error("Error deleting predefined question:", err);
      toast({ variant: "destructive", title: tCommon('toastErrorTitle') as string, description: t('toastPredefinedQuestionDeleteError') });
    }
  };

  const copyToClipboard = (text: string | undefined) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: tCommon('toastSuccessTitle') as string, description: t('questionIdCopied') });
    }).catch(err => {
      console.error('Failed to copy question ID:', err);
      toast({ variant: "destructive", title: tCommon('toastErrorTitle') as string, description: t('questionIdCopyError') });
    });
  };

  const truncateText = (text: string | undefined, maxLength: number = 50) => {
    if (!text) return t('notAvailable');
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  const getQuestionTextForLocale = (report: ReportData) => {
    return report.locale === 'es' ? report.questionTextEs : report.questionTextEn;
  };

  const handleOpenEditQuestionDialog = async (report: ReportData) => {
    if (!report.questionId) {
      toast({ variant: "destructive", title: tCommon('toastErrorTitle') as string, description: t('errorNoQuestionIdToEdit') });
      return;
    }
    try {
      const questionData = await getNormalizedQuestionById(report.questionId);
      
      if (questionData) {
        setQuestionToEditData(questionData);
        questionEditForm.reset({
          questionEn: questionData.question.en,
          questionEs: questionData.question.es,
          correctAnswerEn: questionData.correctAnswer.en,
          correctAnswerEs: questionData.correctAnswer.es,
          distractor1En: questionData.distractors[0]?.en || '',
          distractor1Es: questionData.distractors[0]?.es || '',
          distractor2En: questionData.distractors[1]?.en || '',
          distractor2Es: questionData.distractors[1]?.es || '',
          distractor3En: questionData.distractors[2]?.en || '',
          distractor3Es: questionData.distractors[2]?.es || '',
          explanationEn: questionData.explanation.en,
          explanationEs: questionData.explanation.es,
          hintEn: questionData.hint?.en || '',
          hintEs: questionData.hint?.es || '',
          difficulty: questionData.difficulty,
        });
        setIsEditQuestionDialogOpen(true);
      } else {
        toast({ variant: "destructive", title: t('errorQuestionNotFoundForEditTitle') as string, description: t('errorQuestionNotFoundForAction', { questionId: report.questionId }) });
      }
    } catch (err) {
      console.error("Error fetching question for edit:", err);
      toast({ variant: "destructive", title: tCommon('toastErrorTitle') as string, description: t('errorFetchingQuestionForEdit') });
    }
  };

  const onEditQuestionSubmit = async (data: QuestionFormData) => {
    if (!questionToEditData) return;
    setIsSubmittingEditQuestion(true);

    const updatedQuestionData: Partial<GenerateTriviaQuestionOutput> = {
      question: { en: data.questionEn, es: data.questionEs },
      correctAnswer: { en: data.correctAnswerEn, es: data.correctAnswerEs },
      distractors: [
        { en: data.distractor1En, es: data.distractor1Es },
        { en: data.distractor2En, es: data.distractor2Es },
        { en: data.distractor3En, es: data.distractor3Es },
      ],
      explanation: { en: data.explanationEn, es: data.explanationEs },
      hint: (data.hintEn || data.hintEs) ? { en: data.hintEn || '', es: data.hintEs || '' } : undefined,
      difficulty: data.difficulty,
    };
    if (!updatedQuestionData.hint?.en && !updatedQuestionData.hint?.es) {
        delete updatedQuestionData.hint;
    }

    try {
      await updatePredefinedQuestion(questionToEditData.id, updatedQuestionData);
      toast({ title: tCommon('toastSuccessTitle') as string, description: t('toastQuestionUpdateSuccess') });
      setIsEditQuestionDialogOpen(false);
    } catch (err) {
      console.error("Error updating question:", err);
      toast({ variant: "destructive", title: tCommon('toastErrorTitle') as string, description: t('toastQuestionUpdateError') });
    } finally {
      setIsSubmittingEditQuestion(false);
    }
  };

  const handleValidateWithAI = async (report: ReportData) => {
    if (!report.questionId) {
        toast({ variant: "destructive", title: t('errorNoQuestionIdToValidate') });
        return;
    }
    setIsValidating(true);
    setValidationResult(null);
    setCurrentReportForValidation(report);
    setQuestionForValidation(null); // Reset
    setIsValidationDialogOpen(true);

    try {
        const questionData = await getNormalizedQuestionById(report.questionId);
        if (!questionData) {
            setValidationResult({ validationStatus: 'Reject', reasoning: t('errorQuestionNotFoundForAction', { questionId: report.questionId }) });
            setQuestionForValidation(null);
            return;
        }
        setQuestionForValidation(questionData);
        const result = await validateSingleTriviaQuestion({ questionData });
        setValidationResult(result);
    } catch (error: any) {
        console.error("AI Validation failed:", error);
        setValidationResult({ validationStatus: 'Reject', reasoning: t('errorValidationAI', { error: error.message || 'Unknown error' }) });
    } finally {
        setIsValidating(false);
    }
  };

  const handleApplyFix = async () => {
    if (!validationResult || validationResult.validationStatus !== 'Fix' || !validationResult.fixedQuestionData || !currentReportForValidation?.questionId) {
        return;
    }
    setIsValidating(true);
    try {
        const dataToUpdate = { ...validationResult.fixedQuestionData, status: 'fixed' as const };
        await updatePredefinedQuestion(currentReportForValidation.questionId, dataToUpdate);
        toast({ title: t('toastFixAppliedSuccess') });
        setIsValidationDialogOpen(false);
    } catch (error) {
        console.error("Error applying AI fix:", error);
        toast({ variant: 'destructive', title: t('toastFixAppliedError') });
    } finally {
        setIsValidating(false);
    }
  };

  const handleDeleteFromValidation = async () => {
    if (!currentReportForValidation?.questionId) return;
    setIsValidating(true);
    try {
      await handleDeletePredefinedQuestion(currentReportForValidation.questionId);
      setIsValidationDialogOpen(false);
    } catch (error) {
        toast({ variant: 'destructive', title: t('toastPredefinedQuestionDeleteError') });
    } finally {
      setIsValidating(false);
    }
  };


  if (loading) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  if (error) {
    return (
      <Card className="shadow-lg border-destructive">
        <CardHeader><CardTitle className="text-destructive flex items-center"><AlertTriangle className="mr-2 h-6 w-6" />{tCommon('errorTitle')}</CardTitle></CardHeader>
        <CardContent><p className="text-destructive">{error}</p></CardContent>
        <CardFooter><Button onClick={fetchAllData} variant="outline"><RefreshCw className="mr-2 h-4 w-4" />{tCommon('retryButton')}</Button></CardFooter>
      </Card>
    );
  }

  const renderQuestionForDialog = (q: QuestionData | Omit<QuestionData, 'id' | 'topicValue' | 'source' | 'createdAt' | 'status'>, title: string) => (
    <div>
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <div className="space-y-3 text-sm p-3 border rounded-md bg-muted/50">
        <p><strong>{tForm('questionLabel')}:</strong> {q.question.en}</p>
        <p><strong>{tForm('correctAnswerLabel')}:</strong> <span className="text-green-600">{q.correctAnswer.en}</span></p>
        <div>
          <strong>{tForm('distractorsLabel')}:</strong>
          <ul className="list-disc pl-5">
            {q.distractors.map((d, i) => <li key={i}>{d.en}</li>)}
          </ul>
        </div>
        <p><strong>{tForm('explanationLabel')}:</strong> {q.explanation.en}</p>
        <p><strong>{tForm('difficultyLabel')}:</strong> {q.difficulty}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-headline text-primary">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </header>

      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
            <div className="flex-grow">
              <CardTitle>{t('reportsListTitle')}</CardTitle>
              <CardDescription>{t('reportsListDescription', { count: filteredReports.length, total: reports.length })}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t('filterByStatus')}:</span>
              <Select
                value={activeFilters.status}
                onValueChange={(value) => setActiveFilters(prev => ({ ...prev, status: value as ReportStatus | 'all' }))}
              >
                <SelectTrigger className="w-auto sm:w-[180px]">
                  <SelectValue placeholder={t('allStatuses')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('allStatuses')}</SelectItem>
                  {REPORT_STATUSES.map(status => (
                    <SelectItem key={status} value={status}>{t(`statuses.${status}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {paginatedReports.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">{t('noReportsFound')}</p>
          ) : (
            <TooltipProvider delayDuration={100}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[10%] hidden sm:table-cell">{t('tableDate')}</TableHead>
                    <TableHead className="w-[25%]">{t('tableQuestion')}</TableHead>
                    <TableHead className="w-[10%] hidden lg:table-cell">{t('tableCategory')}</TableHead>
                    <TableHead className="w-[10%] hidden md:table-cell">{t('tableDifficulty')}</TableHead>
                    <TableHead className="w-[15%]">{t('tableReason')}</TableHead>
                    <TableHead className="w-[10%] text-center">{t('tableStatus')}</TableHead>
                    <TableHead className="text-right w-[20%]">{t('tableActions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedReports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell className="hidden sm:table-cell">
                        {report.reportedAt ? format(new Date(report.reportedAt), 'PPp', { locale: dateLocale }) : t('notAvailable')}
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild><span className="cursor-default">{truncateText(getQuestionTextForLocale(report), 40)}</span></TooltipTrigger>
                          <TooltipContent side="top" className="max-w-md bg-background border shadow-lg p-2 rounded-md">
                            <p><strong>EN:</strong> {report.questionTextEn || t('notAvailable')}</p>
                            <p><strong>ES:</strong> {report.questionTextEs || t('notAvailable')}</p>
                            {report.questionId && <p className="mt-1 text-xs text-muted-foreground">ID: {report.questionId}</p>}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">{categoryMap.get(report.categoryTopicValue) || report.categoryTopicValue}</TableCell>
                      <TableCell className="hidden md:table-cell">{tCommon(`difficultyLevels.${report.difficulty}` as any)}</TableCell>
                      <TableCell>
                        <Tooltip>
                            <TooltipTrigger asChild><span className="cursor-default">{t(`reasons.${report.reason}`)}</span></TooltipTrigger>
                            {report.details && (
                                <TooltipContent side="top" className="max-w-xs bg-background border shadow-lg p-2 rounded-md">
                                    <p>{report.details}</p>
                                </TooltipContent>
                            )}
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Select value={report.status} onValueChange={(newStatus) => handleStatusChange(report.id, newStatus as ReportStatus)}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {REPORT_STATUSES.map(s => (
                              <SelectItem key={s} value={s} className="text-xs">{t(`statuses.${s}`)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleValidateWithAI(report)} disabled={!report.questionId}>
                                    <ShieldCheck className="h-4 w-4" />
                                    <span className="sr-only">{t('validateWithAIButton')}</span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>{report.questionId ? t('validateWithAITooltip') : t('editQuestionDisabledTooltip')}</p></TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleOpenEditQuestionDialog(report)} disabled={!report.questionId}>
                                    <Edit className="h-4 w-4" />
                                    <span className="sr-only">{t('editReportedQuestionButton')}</span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>{report.questionId ? t('editReportedQuestionButtonTooltip') : t('editQuestionDisabledTooltip')}</p></TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(report.questionId)} disabled={!report.questionId}>
                                    <ClipboardCopy className="h-4 w-4" />
                                    <span className="sr-only">{t('copyQuestionIdButton')}</span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>{report.questionId ? t('copyQuestionIdButton') : t('editQuestionDisabledTooltip')}</p></TooltipContent>
                        </Tooltip>
                      <Tooltip>
                        <AlertDialog>
                            <TooltipTrigger asChild>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive hover:text-destructive-foreground">
                                <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                            </TooltipTrigger>
                            <TooltipContent><p>{t('deleteReportButton')}</p></TooltipContent>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                <AlertDialogTitle>{t('deleteReportConfirmTitle')}</AlertDialogTitle>
                                <AlertDialogDescription>{t('deleteReportConfirmDescription')}</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteReport(report.id)} className="bg-destructive hover:bg-destructive/90">{tCommon('deleteButton')}</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
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
              {tCommon('AdminQuestionsPage.paginationInfo', { currentPage, totalPages, totalItems: filteredReports.length })}
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

      {/* Dialog for AI Validation Result */}
        <Dialog open={isValidationDialogOpen} onOpenChange={setIsValidationDialogOpen}>
            <DialogContent className="sm:max-w-4xl max-h-[90vh]">
                <DialogHeader>
                    <DialogTitle>{t('validationResultTitle')}</DialogTitle>
                    <DialogDescription>{t('validationResultDescription', { questionId: currentReportForValidation?.questionId || '...' })}</DialogDescription>
                </DialogHeader>
                {isValidating ? (
                    <div className="flex flex-col items-center justify-center p-8 space-y-4">
                        <Loader2 className="h-12 w-12 animate-spin text-primary" />
                        <p className="text-lg text-muted-foreground">{t('validatingInProgress')}</p>
                    </div>
                ) : validationResult && (
                    <ScrollArea className="max-h-[calc(90vh-200px)]">
                        <div className="p-4 space-y-4">
                            {validationResult.validationStatus === 'Accept' && (
                                <div className="p-4 rounded-md bg-green-50 border border-green-200 text-green-800">
                                    <div className="flex items-center gap-2 font-bold text-lg"><CheckCircle /> {t('validationStatus.Accept')}</div>
                                    <p className="mt-2 text-sm">{validationResult.reasoning}</p>
                                </div>
                            )}
                             {validationResult.validationStatus === 'Reject' && (
                                <div className="p-4 rounded-md bg-red-50 border border-red-200 text-red-800">
                                    <div className="flex items-center gap-2 font-bold text-lg"><AlertCircle /> {t('validationStatus.Reject')}</div>
                                    <p className="mt-2 text-sm">{validationResult.reasoning}</p>
                                </div>
                            )}
                            {validationResult.validationStatus === 'Fix' && questionForValidation && (
                                <>
                                <div className="p-4 rounded-md bg-blue-50 border border-blue-200 text-blue-800">
                                    <div className="flex items-center gap-2 font-bold text-lg"><Wand2 /> {t('validationStatus.Fix')}</div>
                                    <p className="mt-2 text-sm">{validationResult.reasoning}</p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                     {renderQuestionForDialog(questionForValidation, t('originalQuestion'))}
                                     {validationResult.fixedQuestionData && renderQuestionForDialog(validationResult.fixedQuestionData, t('aiSuggestedFix'))}
                                </div>
                                </>
                            )}
                        </div>
                    </ScrollArea>
                )}
                 <DialogFooter>
                    <DialogClose asChild><Button variant="outline">{tCommon('close')}</Button></DialogClose>
                    {validationResult?.validationStatus === 'Fix' && (
                        <Button onClick={handleApplyFix} disabled={isValidating}>
                            {isValidating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {t('applyFixButton')}
                        </Button>
                    )}
                    {validationResult?.validationStatus === 'Reject' && (
                         <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" disabled={isValidating}>{t('deleteQuestionButton')}</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>{t('deletePredefinedQuestionConfirmTitle')}</AlertDialogTitle>
                                    <AlertDialogDescription>{t('deletePredefinedQuestionConfirmDescriptionAI')}</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDeleteFromValidation} className="bg-destructive hover:bg-destructive/90">{tCommon('deleteButton')}</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>


      {/* Dialog for Editing Question */}
      <Dialog open={isEditQuestionDialogOpen} onOpenChange={setIsEditQuestionDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{t('editQuestionDialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('editQuestionDialogDescription', { 
                topic: questionToEditData ? (categoryMap.get(questionToEditData.topicValue) || questionToEditData.topicValue) : '',
                questionId: questionToEditData?.id || ''
              })}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-200px)] pr-6"> 
            <Form {...questionEditForm}>
              <form onSubmit={questionEditForm.handleSubmit(onEditQuestionSubmit)} className="space-y-6 py-4">
                <FormField
                  control={questionEditForm.control}
                  name="difficulty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{tForm('difficultyLabel')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={tForm('difficultyPlaceholder')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {ALL_DIFFICULTY_LEVELS_CONST.map(diff => (
                            <SelectItem key={diff} value={diff}>{tCommon(`difficultyLevels.${diff}` as any)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Card>
                  <CardHeader><CardTitle className="text-lg">{tForm('questionLabel')}</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <FormField control={questionEditForm.control} name="questionEn" render={({ field }) => ( <FormItem> <FormLabel>{tCommon('english')}</FormLabel> <FormControl><Textarea placeholder={tForm('questionPlaceholder')} {...field} rows={3} /></FormControl> <FormMessage /> </FormItem> )}/>
                    <FormField control={questionEditForm.control} name="questionEs" render={({ field }) => ( <FormItem> <FormLabel>{tCommon('spanish')}</FormLabel> <FormControl><Textarea placeholder={tForm('questionPlaceholder')} {...field} rows={3} /></FormControl> <FormMessage /> </FormItem> )}/>
                  </CardContent>
                </Card>

                <Card className="border-green-500 ring-2 ring-green-500">
                  <CardHeader><CardTitle className="text-lg text-green-600">{tForm('correctAnswerLabel')}</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                      <FormField control={questionEditForm.control} name="correctAnswerEn" render={({ field }) => ( <FormItem> <FormLabel>{tCommon('english')}</FormLabel> <FormControl><Input placeholder={tForm('answerPlaceholder')} {...field} /></FormControl> <FormMessage /> </FormItem> )}/>
                      <FormField control={questionEditForm.control} name="correctAnswerEs" render={({ field }) => ( <FormItem> <FormLabel>{tCommon('spanish')}</FormLabel> <FormControl><Input placeholder={tForm('answerPlaceholder')} {...field} /></FormControl> <FormMessage /> </FormItem> )}/>
                  </CardContent>
                </Card>

                {[1, 2, 3].map(idx => (
                  <Card key={idx}>
                    <CardHeader><CardTitle className="text-lg">{tForm('distractorLabel', { number: idx })}</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <FormField control={questionEditForm.control} name={`distractor${idx}En` as keyof QuestionFormData} render={({ field }) => ( <FormItem> <FormLabel>{tCommon('english')}</FormLabel> <FormControl><Input placeholder={tForm('answerPlaceholder')} {...field} /></FormControl> <FormMessage /> </FormItem> )}/>
                      <FormField control={questionEditForm.control} name={`distractor${idx}Es` as keyof QuestionFormData} render={({ field }) => ( <FormItem> <FormLabel>{tCommon('spanish')}</FormLabel> <FormControl><Input placeholder={tForm('answerPlaceholder')} {...field} /></FormControl> <FormMessage /> </FormItem> )}/>
                    </CardContent>
                  </Card>
                ))}
                
                <Card>
                  <CardHeader><CardTitle className="text-lg">{tForm('explanationLabel')}</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <FormField control={questionEditForm.control} name="explanationEn" render={({ field }) => ( <FormItem> <FormLabel>{tCommon('english')}</FormLabel> <FormControl><Textarea placeholder={tForm('explanationPlaceholder')} {...field} rows={4} /></FormControl> <FormMessage /> </FormItem> )}/>
                    <FormField control={questionEditForm.control} name="explanationEs" render={({ field }) => ( <FormItem> <FormLabel>{tCommon('spanish')}</FormLabel> <FormControl><Textarea placeholder={tForm('explanationPlaceholder')} {...field} rows={4} /></FormControl> <FormMessage /> </FormItem> )}/>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-lg">{tForm('hintLabelOptional')}</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <FormField control={questionEditForm.control} name="hintEn" render={({ field }) => ( <FormItem> <FormLabel>{tCommon('english')}</FormLabel> <FormControl><Textarea placeholder={tForm('hintPlaceholder')} {...field} rows={2} /></FormControl> <FormMessage /> </FormItem> )}/>
                    <FormField control={questionEditForm.control} name="hintEs" render={({ field }) => ( <FormItem> <FormLabel>{tCommon('spanish')}</FormLabel> <FormControl><Textarea placeholder={tForm('hintPlaceholder')} {...field} rows={2} /></FormControl> <FormMessage /> </FormItem> )}/>
                  </CardContent>
                </Card>

                <DialogFooter className="pt-4">
                  <DialogClose asChild>
                      <Button type="button" variant="outline" disabled={isSubmittingEditQuestion}>{tCommon('cancel')}</Button>
                  </DialogClose>
                  <Button type="submit" disabled={isSubmittingEditQuestion} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                    {isSubmittingEditQuestion && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {tCommon('save')}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
