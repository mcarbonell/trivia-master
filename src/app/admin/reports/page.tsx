// src/app/admin/reports/page.tsx
'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { es as esLocale, enUS as enLocale } from 'date-fns/locale';
import { getReportedQuestions, updateReportStatus, deleteReport } from '@/services/reportService';
import { deletePredefinedQuestion, updatePredefinedQuestion } from '@/services/triviaService'; // Added updatePredefinedQuestion
import { getAppCategories } from '@/services/categoryService';
import type { ReportData, ReportStatus, CategoryDefinition, DifficultyLevel, PredefinedQuestion } from '@/types'; // Added PredefinedQuestion
import type { AppLocale } from '@/lib/i18n-config';
import type { GenerateTriviaQuestionOutput } from '@/ai/flows/generate-trivia-question';

import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog'; // Added Dialog components
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'; // Added Form components
import { Input } from '@/components/ui/input'; // Added Input
import { Textarea } from '@/components/ui/textarea'; // Added Textarea
import { ScrollArea } from '@/components/ui/scroll-area'; // Added ScrollArea
import { Loader2, AlertTriangle, RefreshCw, Trash2, ClipboardCopy, Edit } from 'lucide-react'; // Added Edit
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase'; // For getDoc
import { doc, getDoc } from 'firebase/firestore'; // For getDoc
// Removed import of PREDEFINED_QUESTIONS_COLLECTION
import { questionFormSchema, type QuestionFormData } from '@/app/admin/questions/page'; // Import schema and type

const ITEMS_PER_PAGE = 10;
const REPORT_STATUSES: ReportStatus[] = ['new', 'reviewed', 'resolved', 'ignored'];
const ALL_DIFFICULTY_LEVELS_CONST: DifficultyLevel[] = ["easy", "medium", "hard"]; // Replicate or import from questions page
const PREDEFINED_QUESTIONS_COLLECTION = 'predefinedTriviaQuestions'; // Define constant locally

export default function AdminReportsPage() {
  const t = useTranslations('AdminReportsPage');
  const tCommon = useTranslations();
  const tForm = useTranslations('AdminQuestionsPage.form'); // Use translations from questions page for form
  const currentLocale = useLocale() as AppLocale;
  const { toast } = useToast();

  const [reports, setReports] = useState<ReportData[]>([]);
  const [categories, setCategories] = useState<CategoryDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeFilters, setActiveFilters] = useState<{ status: ReportStatus | 'all' }>({ status: 'new' });

  const [isEditQuestionDialogOpen, setIsEditQuestionDialogOpen] = useState(false);
  const [questionToEditData, setQuestionToEditData] = useState<PredefinedQuestion | null>(null);
  const [isSubmittingEditQuestion, setIsSubmittingEditQuestion] = useState(false);

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
  
  const handleDeletePredefinedQuestion = async (questionId: string | undefined, questionText: string) => {
    if (!questionId) {
        toast({ variant: "destructive", title: tCommon('toastErrorTitle') as string, description: t('errorNoQuestionIdForDelete') });
        return;
    }
    try {
      await deletePredefinedQuestion(questionId);
      toast({ title: tCommon('toastSuccessTitle') as string, description: t('toastPredefinedQuestionDeleteSuccess', { question: truncateText(questionText, 30) }) });
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
      const questionRef = doc(db, PREDEFINED_QUESTIONS_COLLECTION, report.questionId);
      const docSnap = await getDoc(questionRef);
      if (docSnap.exists()) {
        const questionData = { id: docSnap.id, ...docSnap.data() } as PredefinedQuestion;
        setQuestionToEditData(questionData);
        questionEditForm.reset({
          questionEn: questionData.question.en,
          questionEs: questionData.question.es,
          answer1En: questionData.answers[0]?.en || '',
          answer1Es: questionData.answers[0]?.es || '',
          answer2En: questionData.answers[1]?.en || '',
          answer2Es: questionData.answers[1]?.es || '',
          answer3En: questionData.answers[2]?.en || '',
          answer3Es: questionData.answers[2]?.es || '',
          answer4En: questionData.answers[3]?.en || '',
          answer4Es: questionData.answers[3]?.es || '',
          correctAnswerIndex: String(questionData.correctAnswerIndex),
          explanationEn: questionData.explanation.en,
          explanationEs: questionData.explanation.es,
          hintEn: questionData.hint?.en || '',
          hintEs: questionData.hint?.es || '',
          difficulty: questionData.difficulty,
        });
        setIsEditQuestionDialogOpen(true);
      } else {
        toast({ variant: "destructive", title: tCommon('toastErrorTitle') as string, description: t('errorQuestionNotFoundForEdit', {questionId: report.questionId}) });
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
      answers: [
        { en: data.answer1En, es: data.answer1Es },
        { en: data.answer2En, es: data.answer2Es },
        { en: data.answer3En, es: data.answer3Es },
        { en: data.answer4En, es: data.answer4Es },
      ],
      correctAnswerIndex: parseInt(data.correctAnswerIndex, 10),
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
      // Note: fetchAllData() might be too broad if only question content changed,
      // but report list itself doesn't change from this action.
      // Consider if a more targeted update is needed or if this is acceptable.
      // For now, keeping it simple and not re-fetching reports.
      setIsEditQuestionDialogOpen(false);
    } catch (err) {
      console.error("Error updating question:", err);
      toast({ variant: "destructive", title: tCommon('toastErrorTitle') as string, description: t('toastQuestionUpdateError') });
    } finally {
      setIsSubmittingEditQuestion(false);
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
                        {report.questionId && (
                           <>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleOpenEditQuestionDialog(report)}>
                                        <Edit className="h-4 w-4" />
                                        <span className="sr-only">{t('editReportedQuestionButton')}</span>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>{t('editReportedQuestionButtonTooltip')}</p></TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(report.questionId)}>
                                        <ClipboardCopy className="h-4 w-4" />
                                        <span className="sr-only">{t('copyQuestionIdButton')}</span>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>{t('copyQuestionIdButton')}</p></TooltipContent>
                            </Tooltip>
                            <Tooltip>
                             <AlertDialog>
                                <TooltipTrigger asChild={true}>
                                  <AlertDialogTrigger asChild={true}>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive hover:text-destructive-foreground">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                </TooltipTrigger>
                                <TooltipContent><p>{t('deleteReportedQuestionButton')}</p></TooltipContent>
                                <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>{t('deletePredefinedQuestionConfirmTitle')}</AlertDialogTitle>
                                    <AlertDialogDescription>{t('deletePredefinedQuestionConfirmDescription', { question: truncateText(getQuestionTextForLocale(report), 50) })}</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDeletePredefinedQuestion(report.questionId, getQuestionTextForLocale(report))} className="bg-destructive hover:bg-destructive/90">{tCommon('deleteButton')}</AlertDialogAction>
                                </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                          </Tooltip>
                           </>
                        )}
                        <Tooltip>
                        <AlertDialog>
                            <TooltipTrigger asChild={true}>
                              <AlertDialogTrigger asChild={true}>
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

                {[1, 2, 3, 4].map(idx => (
                  <Card key={idx}>
                    <CardHeader><CardTitle className="text-lg">{tForm('answerLabel', { letter: String.fromCharCode(64 + idx) })}</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <FormField control={questionEditForm.control} name={`answer${idx}En` as keyof QuestionFormData} render={({ field }) => ( <FormItem> <FormLabel>{tCommon('english')}</FormLabel> <FormControl><Input placeholder={tForm('answerPlaceholder')} {...field} /></FormControl> <FormMessage /> </FormItem> )}/>
                      <FormField control={questionEditForm.control} name={`answer${idx}Es` as keyof QuestionFormData} render={({ field }) => ( <FormItem> <FormLabel>{tCommon('spanish')}</FormLabel> <FormControl><Input placeholder={tForm('answerPlaceholder')} {...field} /></FormControl> <FormMessage /> </FormItem> )}/>
                    </CardContent>
                  </Card>
                ))}
                
                <FormField
                  control={questionEditForm.control}
                  name="correctAnswerIndex"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{tForm('correctAnswerLabel')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={tForm('correctAnswerPlaceholder')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {['0', '1', '2', '3'].map(idx_str => ( 
                            <SelectItem key={idx_str} value={idx_str}>{tForm('answerOption', { letter: String.fromCharCode(65 + parseInt(idx_str)) })}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
