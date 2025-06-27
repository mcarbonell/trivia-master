// src/app/admin/questions/page.tsx
'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { getAllPredefinedQuestionsForAdmin, deletePredefinedQuestion, updatePredefinedQuestion, type PredefinedQuestion } from '@/services/triviaService';
import { getAppCategories } from '@/services/categoryService';
import { findWikimediaImages } from '@/ai/flows/find-wikimedia-images';
import type { FindWikimediaImagesOutput, WikimediaImageCandidate } from '@/types';
import { processWikimediaImage } from '@/ai/flows/process-wikimedia-image';
import type { CategoryDefinition, DifficultyLevel, BilingualText } from '@/types';
import type { AppLocale } from '@/lib/i18n-config';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, PlusCircle, Eye, Edit, Trash2, RefreshCw, Search, ArrowUpDown, Download, ClipboardCopy, Image as ImageIcon, Camera } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import Image from 'next/image';

const ITEMS_PER_PAGE = 10;
const ALL_DIFFICULTY_LEVELS: DifficultyLevel[] = ["easy", "medium", "hard"];

export const questionFormSchema = z.object({
  questionEn: z.string().min(1, { message: "English question is required." }),
  questionEs: z.string().min(1, { message: "Spanish question is required." }),

  correctAnswerEn: z.string().min(1, { message: "Correct Answer (English) is required." }),
  correctAnswerEs: z.string().min(1, { message: "Correct Answer (Spanish) is required." }),

  distractor1En: z.string().min(1, { message: "Distractor 1 (English) is required." }),
  distractor1Es: z.string().min(1, { message: "Distractor 1 (Spanish) is required." }),
  distractor2En: z.string().min(1, { message: "Distractor 2 (English) is required." }),
  distractor2Es: z.string().min(1, { message: "Distractor 2 (Spanish) is required." }),
  distractor3En: z.string().min(1, { message: "Distractor 3 (English) is required." }),
  distractor3Es: z.string().min(1, { message: "Distractor 3 (Spanish) is required." }),

  explanationEn: z.string().min(1, { message: "English explanation is required." }),
  explanationEs: z.string().min(1, { message: "Spanish explanation is required." }),
  hintEn: z.string().optional(),
  hintEs: z.string().optional(),
  difficulty: z.enum(ALL_DIFFICULTY_LEVELS, { required_error: "Difficulty is required." }),
  
  artworkTitle: z.string().optional(),
  artworkAuthor: z.string().optional(),
  imagePrompt: z.string().optional(),
  imageUrl: z.string().optional(),
});
export type QuestionFormData = z.infer<typeof questionFormSchema>;

interface ImageSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLoading: boolean;
  results: FindWikimediaImagesOutput;
  onImageSelect: (image: WikimediaImageCandidate) => void;
  onCancel: () => void;
}

const ImageSearchDialog: React.FC<ImageSearchDialogProps> = ({ open, onOpenChange, isLoading, results, onImageSelect, onCancel }) => {
  const t = useTranslations('AdminQuestionsPage');
  const tCommon = useTranslations();
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{t('imageSearchDialog.title')}</DialogTitle>
          <DialogDescription>{t('imageSearchDialog.description')}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-200px)]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-8 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-lg text-muted-foreground">{t('imageSearchDialog.loading')}</p>
            </div>
          ) : results.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">{t('imageSearchDialog.noResults')}</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 p-4">
              {results.map((image) => (
                <Card 
                  key={image.thumbnailUrl} 
                  className="overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all group"
                  onClick={() => onImageSelect(image)}
                >
                  <CardContent className="p-0">
                    <div className="relative aspect-w-1 aspect-h-1">
                      <Image 
                        src={image.thumbnailUrl} 
                        alt={image.title} 
                        fill
                        className="object-cover transition-transform group-hover:scale-105"
                        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                      />
                    </div>
                  </CardContent>
                  <CardFooter className="p-2 text-xs">
                    <p className="truncate" title={image.title}>{image.title}</p>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>{tCommon('cancel')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


export default function AdminQuestionsPage() {
  const t = useTranslations('AdminQuestionsPage');
  const tForm = useTranslations('AdminQuestionsPage.form');
  const tCommon = useTranslations();
  const locale = useLocale() as AppLocale;
  const { toast } = useToast();

  const [questionsForSelectedCategory, setQuestionsForSelectedCategory] = useState<PredefinedQuestion[]>([]);
  const [categoriesForFilter, setCategoriesForFilter] = useState<CategoryDefinition[]>([]);
  
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortCriteria, setSortCriteria] = useState<'question' | 'answer'>('question');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);


  const [isQuestionDialogOpen, setIsQuestionDialogOpen] = useState(false);
  const [currentQuestionToEdit, setCurrentQuestionToEdit] = useState<PredefinedQuestion | null>(null);
  const [isSubmittingQuestion, setIsSubmittingQuestion] = useState(false);
  
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [currentQuestionToView, setCurrentQuestionToView] = useState<PredefinedQuestion | null>(null);

  // State for image search dialog
  const [isImageSearchOpen, setIsImageSearchOpen] = useState(false);
  const [isImageSearchLoading, setIsImageSearchLoading] = useState(false);
  const [imageSearchResults, setImageSearchResults] = useState<FindWikimediaImagesOutput>([]);


  const form = useForm<QuestionFormData>({
    resolver: zodResolver(questionFormSchema),
  });

  const fetchCategories = useCallback(async () => {
    setLoadingCategories(true);
    setError(null);
    try {
      const fetchedCategories = await getAppCategories();
      setCategoriesForFilter(fetchedCategories);
      if (fetchedCategories.length > 0 && !selectedCategory) {
        setSelectedCategory(fetchedCategories[0]!.topicValue);
      } else if (fetchedCategories.length === 0) {
        setQuestionsForSelectedCategory([]); 
      }
    } catch (err) {
      console.error("Error fetching categories:", err);
      setError(t('errorLoadingCategories'));
      toast({ variant: "destructive", title: tCommon('toastErrorTitle') as string, description: t('errorLoadingCategories') });
    } finally {
      setLoadingCategories(false);
    }
  }, [t, tCommon, toast, selectedCategory]); 

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);


  const fetchQuestionsForCurrentCategory = useCallback(async () => {
    if (!selectedCategory) {
      setQuestionsForSelectedCategory([]);
      return;
    }
    setIsLoadingQuestions(true);
    setSelectedQuestionIds([]); 
    setError(null);
    try {
      const fetchedQuestions = await getAllPredefinedQuestionsForAdmin(selectedCategory);
      setQuestionsForSelectedCategory(fetchedQuestions);
    } catch (err) {
      console.error(`Error fetching questions for category ${selectedCategory}:`, err);
      setError(t('errorLoadingQuestions'));
      toast({ variant: "destructive", title: tCommon('toastErrorTitle') as string, description: t('errorLoadingQuestions') });
      setQuestionsForSelectedCategory([]);
    } finally {
      setIsLoadingQuestions(false);
    }
  }, [selectedCategory, t, tCommon, toast]);

  useEffect(() => {
    if (selectedCategory) {
      fetchQuestionsForCurrentCategory();
    } else {
      setQuestionsForSelectedCategory([]); 
    }
  }, [selectedCategory, fetchQuestionsForCurrentCategory]);


  const categoryMap = useMemo(() => {
    return new Map(categoriesForFilter.map(cat => [cat.topicValue, cat.name[locale]]));
  }, [categoriesForFilter, locale]);

  const filteredQuestions = useMemo(() => {
    const trimmedSearchQuery = searchQuery.trim();
    const lowerSearchQuery = trimmedSearchQuery.toLowerCase();
    
    const getSearchableAnswers = (q: PredefinedQuestion): string[] => {
      const answers: string[] = [];
      if (q.correctAnswer) {
        answers.push(q.correctAnswer.en.toLowerCase(), q.correctAnswer.es.toLowerCase());
      }
      if (q.distractors) {
        q.distractors.forEach(d => answers.push(d.en.toLowerCase(), d.es.toLowerCase()));
      }
      return answers;
    };


    let questions = questionsForSelectedCategory
      .filter(q => selectedDifficulty === 'all' || q.difficulty === selectedDifficulty)
      .filter(q => {
        if (!trimmedSearchQuery) return true;
        if (q.id === trimmedSearchQuery) return true; 
        const inQuestion = q.question.en.toLowerCase().includes(lowerSearchQuery) || q.question.es.toLowerCase().includes(lowerSearchQuery);
        if (inQuestion) return true;
        
        const searchableAnswers = getSearchableAnswers(q);
        return searchableAnswers.some(ans => ans.includes(lowerSearchQuery));
      });

    if (selectedCategory) {
      questions = questions.sort((a, b) => {
        let textA = '';
        let textB = '';

        if (sortCriteria === 'question') {
          textA = a.question[locale]?.toLowerCase() || '';
          textB = b.question[locale]?.toLowerCase() || '';
        } else if (sortCriteria === 'answer') {
          textA = a.correctAnswer?.[locale]?.toLowerCase() || '';
          textB = b.correctAnswer?.[locale]?.toLowerCase() || '';
        }
        
        const comparison = textA.localeCompare(textB);
        return sortOrder === 'asc' ? comparison : -comparison;
      });
    }

    return questions;
  }, [questionsForSelectedCategory, selectedCategory, selectedDifficulty, searchQuery, locale, sortCriteria, sortOrder]);

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
    setSelectedQuestionIds([]); 
  };

  useEffect(handleFilterChange, [selectedCategory, selectedDifficulty, searchQuery, sortCriteria, sortOrder]);


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
      toast({ title: tCommon('toastSuccessTitle') as string, description: t('toastDeleteSuccess', { question: truncateText(questionText, 30) }) });
      if (selectedCategory) {
        fetchQuestionsForCurrentCategory(); 
      }
    } catch (err) {
      console.error("Error deleting question:", err);
      toast({ variant: "destructive", title: tCommon('toastErrorTitle') as string, description: t('toastDeleteError') });
    }
  };

  const handleOpenEditQuestionDialog = (question: PredefinedQuestion) => {
    setCurrentQuestionToEdit(question);
    form.reset({
      questionEn: question.question.en,
      questionEs: question.question.es,
      correctAnswerEn: question.correctAnswer.en,
      correctAnswerEs: question.correctAnswer.es,
      distractor1En: question.distractors[0]?.en || '',
      distractor1Es: question.distractors[0]?.es || '',
      distractor2En: question.distractors[1]?.en || '',
      distractor2Es: question.distractors[1]?.es || '',
      distractor3En: question.distractors[2]?.en || '',
      distractor3Es: question.distractors[2]?.es || '',
      explanationEn: question.explanation.en,
      explanationEs: question.explanation.es,
      hintEn: question.hint?.en || '',
      hintEs: question.hint?.es || '',
      difficulty: question.difficulty,
      artworkTitle: question.artworkTitle || '',
      artworkAuthor: question.artworkAuthor || '',
      imagePrompt: question.imagePrompt || '',
      imageUrl: question.imageUrl || '',
    });
    setIsQuestionDialogOpen(true);
  };
  
  const handleOpenViewDialog = (question: PredefinedQuestion) => {
    setCurrentQuestionToView(question);
    setIsViewDialogOpen(true);
  };

  const handleCopyId = (id: string | undefined) => {
    if (!id) return;
    navigator.clipboard.writeText(id).then(() => {
        toast({
            title: tCommon('toastSuccessTitle') as string,
            description: t('toastIdCopied'),
        });
    }).catch(err => {
        console.error('Failed to copy ID:', err);
        toast({
            variant: 'destructive',
            title: tCommon('toastErrorTitle') as string,
            description: t('toastIdCopyError'),
        });
    });
  };


  const onQuestionSubmit = async (data: QuestionFormData) => {
    if (!currentQuestionToEdit) return;
    setIsSubmittingQuestion(true);

    const updatedQuestionData: Partial<PredefinedQuestion> = {
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
      artworkTitle: data.artworkTitle || undefined,
      artworkAuthor: data.artworkAuthor || undefined,
      imagePrompt: data.imagePrompt || undefined,
      imageUrl: data.imageUrl || undefined,
    };
     if (!updatedQuestionData.hint?.en && !updatedQuestionData.hint?.es) {
        delete updatedQuestionData.hint;
    }

    try {
      await updatePredefinedQuestion(currentQuestionToEdit.id, updatedQuestionData);
      toast({ title: tCommon('toastSuccessTitle') as string, description: t('toastUpdateSuccess') });
      if (selectedCategory) {
        fetchQuestionsForCurrentCategory();
      }
      setIsQuestionDialogOpen(false);
    } catch (err) {
      console.error("Error updating question:", err);
      toast({ variant: "destructive", title: tCommon('toastErrorTitle') as string, description: t('toastUpdateError') });
    } finally {
      setIsSubmittingQuestion(false);
    }
  };

  const handleFindImageOnWikimedia = async () => {
    const formData = form.getValues();
    const { artworkTitle, artworkAuthor } = formData;

    if (!artworkTitle) {
      toast({ variant: 'destructive', title: t('imageSearchDialog.errorTitle'), description: t('imageSearchDialog.errorNoTitle') });
      return;
    }

    setIsImageSearchLoading(true);
    setImageSearchResults([]);
    setIsImageSearchOpen(true);

    try {
      const results = await findWikimediaImages({ artworkTitle, artworkAuthor });
      setImageSearchResults(results);
    } catch (error) {
      console.error("Error finding Wikimedia images:", error);
      toast({ variant: 'destructive', title: t('imageSearchDialog.errorTitle'), description: t('imageSearchDialog.errorApi') });
      setIsImageSearchOpen(false); // Close dialog on error
    } finally {
      setIsImageSearchLoading(false);
    }
  };

  const handleProcessImageSelection = async (image: WikimediaImageCandidate) => {
    if (!currentQuestionToEdit) return;
    setIsImageSearchOpen(false); // Close the search dialog
    
    const { id: processingToastId } = toast({
      title: t('imageSearchDialog.processingTitle'),
      description: t('imageSearchDialog.processingDescription'),
    });

    try {
      const result = await processWikimediaImage({
        imageUrl: image.fullUrl,
        questionId: currentQuestionToEdit.id,
      });
      form.setValue('imageUrl', result.publicUrl, { shouldValidate: true });
      toast({ id: processingToastId, title: t('imageSearchDialog.successTitle'), description: t('imageSearchDialog.successDescription') });
    } catch (error) {
       console.error("Error processing Wikimedia image:", error);
       toast({ id: processingToastId, variant: 'destructive', title: t('imageSearchDialog.errorTitle'), description: t('imageSearchDialog.errorProcessing') });
    }
  };

  const truncateText = (text: string, maxLength: number = 50) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  const handleSort = (criteria: 'question' | 'answer') => {
    if (sortCriteria === criteria) {
      setSortOrder(prevOrder => prevOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCriteria(criteria);
      setSortOrder('asc');
    }
  };

  const handleSelectQuestion = (questionId: string) => {
    setSelectedQuestionIds(prevSelected =>
      prevSelected.includes(questionId)
        ? prevSelected.filter(id => id !== questionId)
        : [...prevSelected, questionId]
    );
  };

  const handleSelectAllVisible = () => {
    const visibleQuestionIds = paginatedQuestions.map(q => q.id);
    const allVisibleSelected = visibleQuestionIds.length > 0 && visibleQuestionIds.every(id => selectedQuestionIds.includes(id));

    if (allVisibleSelected) {
      setSelectedQuestionIds(prevSelected => prevSelected.filter(id => !visibleQuestionIds.includes(id)));
    } else {
      setSelectedQuestionIds(prevSelected => [...new Set([...prevSelected, ...visibleQuestionIds])]);
    }
  };

  const isAllVisibleSelected = paginatedQuestions.length > 0 && paginatedQuestions.every(q => selectedQuestionIds.includes(q.id));
  const isSomeVisibleSelected = paginatedQuestions.some(q => selectedQuestionIds.includes(q.id));


  const handleBulkDelete = async () => {
    if (selectedQuestionIds.length === 0) {
      toast({ variant: "destructive", title: t('noQuestionsSelected') as string });
      return;
    }

    const results = await Promise.allSettled(
      selectedQuestionIds.map(id => deletePredefinedQuestion(id))
    );

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failCount = results.filter(r => r.status === 'rejected').length;

    if (failCount === 0) {
      toast({ title: tCommon('toastSuccessTitle') as string, description: t('toastBulkDeleteSuccess', { count: successCount }) });
    } else if (successCount > 0) {
      toast({ variant: "destructive", title: tCommon('toastErrorTitle') as string, description: t('toastBulkDeletePartialError', { successCount, failCount }) });
    } else {
      toast({ variant: "destructive", title: tCommon('toastErrorTitle') as string, description: t('toastBulkDeleteError') });
    }
    
    if (selectedCategory) {
      fetchQuestionsForCurrentCategory(); 
    }
  };

  const handleExportQuestions = () => {
    if (!selectedCategory || displayQuestions.length === 0) {
      toast({ variant: 'destructive', title: tCommon('toastErrorTitle') as string, description: t('noQuestionsToExport') });
      return;
    }

    const questionsToExport = displayQuestions.map(q => {
      const { categoryName, ...exportableQuestion } = q;
      return exportableQuestion;
    });

    const jsonString = JSON.stringify(questionsToExport, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `exported-questions-${selectedCategory}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: tCommon('toastSuccessTitle') as string, description: t('exportSuccess', { count: questionsToExport.length, category: categoryMap.get(selectedCategory) || selectedCategory }) });
  };


  if (loadingCategories) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4">{t('loadingCategories')}</p>
      </div>
    );
  }

  if (error && !selectedCategory) { 
    return (
      <Card className="shadow-lg border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center"><AlertTriangle className="mr-2 h-6 w-6" />{t('errorTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive">{error}</p>
        </CardContent>
         <CardFooter>
            <Button onClick={fetchCategories} variant="outline">
                <RefreshCw className="mr-2 h-4 w-4" />
                {tCommon('retryButton')}
            </Button>
        </CardFooter>
      </Card>
    );
  }

  if (categoriesForFilter.length === 0) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{t('noCategoriesFoundAdmin')}</p>
        </CardContent>
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
         <div className="flex gap-2">
            {selectedQuestionIds.length > 0 && (
                 <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t('deleteSelectedButton', { count: selectedQuestionIds.length })}
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                        <AlertDialogTitle>{t('bulkDeleteConfirmTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('bulkDeleteConfirmDescription', { count: selectedQuestionIds.length })}
                        </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                        <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive hover:bg-destructive/90">
                            {t('deleteButton')}
                        </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
            <Button onClick={handleExportQuestions} variant="outline" disabled={!selectedCategory || displayQuestions.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                {t('exportButton')}
            </Button>
            <Button disabled> 
                <PlusCircle className="mr-2 h-5 w-5" />
                {t('addButton')}
            </Button>
         </div>
      </header>

      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
            <div className="flex-grow">
              <CardTitle>{t('questionsListTitle')}</CardTitle>
              <CardDescription>
                {selectedCategory
                  ? t('questionsListDescriptionCategory', { category: categoryMap.get(selectedCategory) || selectedCategory, count: displayQuestions.length })
                  : t('selectCategoryPrompt')
                }
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 md:gap-4 w-full md:w-auto">
              <div className="relative w-full sm:w-auto md:flex-grow">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder={t('searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 w-full sm:w-[200px] md:w-full"
                    disabled={!selectedCategory || isLoadingQuestions}
                  />
              </div>
              <Select value={selectedCategory} onValueChange={setSelectedCategory} disabled={loadingCategories || isLoadingQuestions}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder={t('filterCategoryPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {categoriesForFilter.map(cat => (
                    <SelectItem key={cat.topicValue} value={cat.topicValue}>
                      {cat.name[locale]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty} disabled={!selectedCategory || isLoadingQuestions}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder={t('filterDifficultyPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={'all'}>{t('allDifficulties')}</SelectItem>
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
          {isLoadingQuestions ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="ml-3">{t('loadingQuestionsForCategory', { category: categoryMap.get(selectedCategory) || selectedCategory })}</p>
            </div>
          ) : error && selectedCategory ? ( 
            <div className="text-destructive text-center py-4">
              <AlertTriangle className="inline-block mr-2 h-5 w-5" />
              {t('errorLoadingQuestions')}
              <Button onClick={fetchQuestionsForCurrentCategory} variant="outline" size="sm" className="ml-2">
                <RefreshCw className="mr-2 h-4 w-4" />
                {tCommon('retryButton')}
              </Button>
            </div>
          ) : !selectedCategory ? (
             <p className="text-muted-foreground text-center py-4">{t('selectCategoryPromptTable')}</p>
          ) : paginatedQuestions.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">{t('noQuestionsFound')}</p>
          ) : (
            <TooltipProvider delayDuration={100}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px] sm:w-[60px]">
                       <Checkbox
                        checked={isAllVisibleSelected ? true : (isSomeVisibleSelected && !isAllVisibleSelected ? 'indeterminate' : false)}
                        onCheckedChange={handleSelectAllVisible}
                        aria-label={t('selectAllVisible') as string}
                      />
                    </TableHead>
                    <TableHead className="w-[35%] sm:w-[40%] md:w-[45%] max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl">
                      <Button variant="ghost" onClick={() => handleSort('question')} className="px-1 py-0.5 h-auto hover:bg-muted">
                        {t('tableQuestion')}
                        <ArrowUpDown className="ml-2 h-3 w-3" />
                      </Button>
                    </TableHead>
                    <TableHead className="hidden md:table-cell w-[15%] sm:w-[15%] md:w-[15%]">{t('tableCategory')}</TableHead>
                    <TableHead className="w-[15%] sm:w-[15%] md:w-[10%]">{t('tableDifficulty')}</TableHead>
                    <TableHead className="hidden lg:table-cell w-[20%] sm:w-[15%] md:w-[15%] max-w-[150px]">
                      <Button variant="ghost" onClick={() => handleSort('answer')} className="px-1 py-0.5 h-auto hover:bg-muted">
                        {t('tableCorrectAnswer')}
                        <ArrowUpDown className="ml-2 h-3 w-3" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-right w-[10%] sm:w-[10%] md:w-[10%]">{t('tableActions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedQuestions.map((question) => (
                    <TableRow key={question.id} data-state={selectedQuestionIds.includes(question.id) ? "selected" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={selectedQuestionIds.includes(question.id)}
                          onCheckedChange={() => handleSelectQuestion(question.id)}
                          aria-labelledby={`question-label-${question.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {question.imageUrl && (
                            <Tooltip>
                              <TooltipTrigger>
                                <ImageIcon className="h-4 w-4 text-primary shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{t('imageAvailableTooltip')}</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span id={`question-label-${question.id}`} className="block break-words cursor-default">
                                {truncateText(question.question[locale] || 'N/A', 70)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" align="start" className="max-w-md break-words bg-background border shadow-lg p-2 rounded-md">
                              <p>{question.question[locale] || 'N/A'}</p>
                            </TooltipContent>
                          </Tooltip>
                          {question.status && (
                            <Badge variant={question.status === 'fixed' ? 'secondary' : 'default'} className="whitespace-nowrap capitalize">
                              {t(`statuses.${question.status}`)}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{question.categoryName}</TableCell>
                      <TableCell>{tCommon(`difficultyLevels.${question.difficulty}` as any) || question.difficulty}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                         <span className="block break-words">
                           {truncateText(question.correctAnswer?.[locale] || 'N/A', 40)}
                         </span>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleOpenViewDialog(question)}>
                          <Eye className="h-4 w-4" />
                          <span className="sr-only">{t('viewButton')}</span>
                        </Button>
                         <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleOpenEditQuestionDialog(question)}>
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
        {totalPages > 1 && selectedCategory && !isLoadingQuestions && (
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
         {displayQuestions.length === 0 && selectedCategory && !isLoadingQuestions && (
            <CardFooter className="pt-4">
                <p className="text-sm text-muted-foreground">{t('noQuestionsMatchFilters')}</p>
            </CardFooter>
        )}
      </Card>

      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex justify-between items-center">
              <span>{tForm('viewDialogTitle')}</span>
              {currentQuestionToView?.id && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-muted-foreground bg-secondary px-2 py-1 rounded-md">{currentQuestionToView.id}</span>
                  <Button variant="outline" size="icon" onClick={() => handleCopyId(currentQuestionToView?.id)} className="h-8 w-8">
                      <ClipboardCopy className="h-4 w-4" />
                      <span className="sr-only">{t('copyIdButton')}</span>
                  </Button>
                </div>
              )}
            </DialogTitle>
            <DialogDescription>
              {tForm('viewDialogDescription', { topic: currentQuestionToView?.categoryName || currentQuestionToView?.topicValue || '' })}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-200px)] pr-6">
            {currentQuestionToView && (
              <div className="space-y-4 py-4 text-sm">
                {currentQuestionToView.imageUrl && (
                  <div className="relative mb-4 w-full aspect-video">
                    <Image
                      src={currentQuestionToView.imageUrl}
                      alt={t('imageAlt', { question: truncateText(currentQuestionToView.question[locale] || '', 50) })}
                      fill
                      className="rounded-lg object-contain"
                    />
                  </div>
                )}
                <div className="flex items-center gap-4">
                  <p><span className="font-semibold">{tForm('difficultyLabel')}:</span> {tCommon(`difficultyLevels.${currentQuestionToView.difficulty}` as any)}</p>
                  {currentQuestionToView.status && (
                    <div className="flex items-center gap-1">
                      <span className="font-semibold">{t('tableStatus')}:</span>
                      <Badge variant={currentQuestionToView.status === 'fixed' ? 'secondary' : 'default'} className="capitalize">{t(`statuses.${currentQuestionToView.status}`)}</Badge>
                    </div>
                  )}
                </div>
                
                <Card>
                  <CardHeader><CardTitle className="text-base">{tForm('questionLabel')}</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    <p><strong>{tCommon('english')}:</strong> {currentQuestionToView.question.en}</p>
                    <p><strong>{tCommon('spanish')}:</strong> {currentQuestionToView.question.es}</p>
                  </CardContent>
                </Card>
                
                <Card className="border-green-500 ring-2 ring-green-500">
                    <CardHeader className="py-2">
                      <CardTitle className="text-base text-green-600">
                        {tForm('correctAnswerLabel')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 pt-0 pb-2">
                      <p><strong>{tCommon('english')}:</strong> {currentQuestionToView.correctAnswer.en}</p>
                      <p><strong>{tCommon('spanish')}:</strong> {currentQuestionToView.correctAnswer.es}</p>
                    </CardContent>
                </Card>

                {currentQuestionToView.distractors.map((distractor, idx) => (
                  <Card key={idx}>
                    <CardHeader className="py-2"><CardTitle className="text-base">{tForm('distractorLabel', { number: idx + 1 })}</CardTitle></CardHeader>
                    <CardContent className="space-y-2 pt-0 pb-2">
                      <p><strong>{tCommon('english')}:</strong> {distractor.en}</p>
                      <p><strong>{tCommon('spanish')}:</strong> {distractor.es}</p>
                    </CardContent>
                  </Card>
                ))}

                <Card>
                  <CardHeader><CardTitle className="text-base">{tForm('explanationLabel')}</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    <p><strong>{tCommon('english')}:</strong> {currentQuestionToView.explanation.en}</p>
                    <p><strong>{tCommon('spanish')}:</strong> {currentQuestionToView.explanation.es}</p>
                  </CardContent>
                </Card>

                {currentQuestionToView.hint && (
                  <Card>
                    <CardHeader><CardTitle className="text-base">{tForm('hintLabelOptional')}</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      <p><strong>{tCommon('english')}:</strong> {currentQuestionToView.hint.en}</p>
                      <p><strong>{tCommon('spanish')}:</strong> {currentQuestionToView.hint.es}</p>
                    </CardContent>
                  </Card>
                )}

                {currentQuestionToView.imagePrompt && (
                   <Card>
                    <CardHeader><CardTitle className="text-base">{tForm('imagePromptLabel')}</CardTitle></CardHeader>
                    <CardContent>
                       <p className="font-mono text-xs bg-muted p-2 rounded-md">{currentQuestionToView.imagePrompt}</p>
                    </CardContent>
                  </Card>
                )}

                 {currentQuestionToView.imageUrl && (
                   <Card>
                    <CardHeader><CardTitle className="text-base">{tForm('imageUrlLabel')}</CardTitle></CardHeader>
                    <CardContent>
                       <p className="font-mono text-xs bg-muted p-2 rounded-md break-all">{currentQuestionToView.imageUrl}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </ScrollArea>
          <DialogFooter className="pt-4">
            <DialogClose asChild>
              <Button type="button" variant="outline">{tCommon('close')}</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImageSearchDialog
        open={isImageSearchOpen}
        onOpenChange={setIsImageSearchOpen}
        isLoading={isImageSearchLoading}
        results={imageSearchResults}
        onImageSelect={handleProcessImageSelection}
        onCancel={() => setIsImageSearchOpen(false)}
      />

      <Dialog open={isQuestionDialogOpen} onOpenChange={setIsQuestionDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{tForm('editDialogTitle')}</DialogTitle>
            <DialogDescription>{tForm('editDialogDescription', { topic: currentQuestionToEdit?.categoryName || currentQuestionToEdit?.topicValue || '' })}</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-200px)] pr-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onQuestionSubmit)} className="space-y-6 py-4">
                <FormField
                  control={form.control}
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
                          {ALL_DIFFICULTY_LEVELS.map(diff => (
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
                    <FormField control={form.control} name="questionEn" render={({ field }) => ( <FormItem> <FormLabel>{tCommon('english')}</FormLabel> <FormControl><Textarea placeholder={tForm('questionPlaceholder')} {...field} rows={3} /></FormControl> <FormMessage /> </FormItem> )}/>
                    <FormField control={form.control} name="questionEs" render={({ field }) => ( <FormItem> <FormLabel>{tCommon('spanish')}</FormLabel> <FormControl><Textarea placeholder={tForm('questionPlaceholder')} {...field} rows={3} /></FormControl> <FormMessage /> </FormItem> )}/>
                  </CardContent>
                </Card>

                <Card className="border-green-500 ring-2 ring-green-500">
                  <CardHeader><CardTitle className="text-lg text-green-600">{tForm('correctAnswerLabel')}</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                      <FormField control={form.control} name="correctAnswerEn" render={({ field }) => ( <FormItem> <FormLabel>{tCommon('english')}</FormLabel> <FormControl><Input placeholder={tForm('answerPlaceholder')} {...field} /></FormControl> <FormMessage /> </FormItem> )}/>
                      <FormField control={form.control} name="correctAnswerEs" render={({ field }) => ( <FormItem> <FormLabel>{tCommon('spanish')}</FormLabel> <FormControl><Input placeholder={tForm('answerPlaceholder')} {...field} /></FormControl> <FormMessage /> </FormItem> )}/>
                  </CardContent>
                </Card>

                {[1, 2, 3].map(idx => (
                  <Card key={idx}>
                    <CardHeader><CardTitle className="text-lg">{tForm('distractorLabel', { number: idx })}</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <FormField control={form.control} name={`distractor${idx}En` as keyof QuestionFormData} render={({ field }) => ( <FormItem> <FormLabel>{tCommon('english')}</FormLabel> <FormControl><Input placeholder={tForm('answerPlaceholder')} {...field} /></FormControl> <FormMessage /> </FormItem> )}/>
                      <FormField control={form.control} name={`distractor${idx}Es` as keyof QuestionFormData} render={({ field }) => ( <FormItem> <FormLabel>{tCommon('spanish')}</FormLabel> <FormControl><Input placeholder={tForm('answerPlaceholder')} {...field} /></FormControl> <FormMessage /> </FormItem> )}/>
                    </CardContent>
                  </Card>
                ))}

                <Card>
                  <CardHeader><CardTitle className="text-lg">{tForm('explanationLabel')}</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <FormField control={form.control} name="explanationEn" render={({ field }) => ( <FormItem> <FormLabel>{tCommon('english')}</FormLabel> <FormControl><Textarea placeholder={tForm('explanationPlaceholder')} {...field} rows={4} /></FormControl> <FormMessage /> </FormItem> )}/>
                    <FormField control={form.control} name="explanationEs" render={({ field }) => ( <FormItem> <FormLabel>{tCommon('spanish')}</FormLabel> <FormControl><Textarea placeholder={tForm('explanationPlaceholder')} {...field} rows={4} /></FormControl> <FormMessage /> </FormItem> )}/>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-lg">{tForm('hintLabelOptional')}</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <FormField control={form.control} name="hintEn" render={({ field }) => ( <FormItem> <FormLabel>{tCommon('english')}</FormLabel> <FormControl><Textarea placeholder={tForm('hintPlaceholder')} {...field} rows={2} /></FormControl> <FormMessage /> </FormItem> )}/>
                    <FormField control={form.control} name="hintEs" render={({ field }) => ( <FormItem> <FormLabel>{tCommon('spanish')}</FormLabel> <FormControl><Textarea placeholder={tForm('hintPlaceholder')} {...field} rows={2} /></FormControl> <FormMessage /> </FormItem> )}/>
                  </CardContent>
                </Card>

                 <Card>
                  <CardHeader><CardTitle className="text-lg">{tForm('visualsLabel')}</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <FormField control={form.control} name="artworkTitle" render={({ field }) => ( <FormItem> <FormLabel>{tForm('artworkTitleLabel')}</FormLabel> <FormControl><Input placeholder={tForm('artworkTitlePlaceholder')} {...field} /></FormControl> <FormMessage /> </FormItem> )}/>
                    <FormField control={form.control} name="artworkAuthor" render={({ field }) => ( <FormItem> <FormLabel>{tForm('artworkAuthorLabel')}</FormLabel> <FormControl><Input placeholder={tForm('artworkAuthorPlaceholder')} {...field} /></FormControl> <FormMessage /> </FormItem> )}/>
                    <FormField control={form.control} name="imagePrompt" render={({ field }) => ( <FormItem> <FormLabel>{tForm('imagePromptLabel')}</FormLabel> <FormControl><Textarea placeholder={tForm('imagePromptPlaceholder')} {...field} rows={3} /></FormControl> <FormMessage /> </FormItem> )}/>
                    <FormField control={form.control} name="imageUrl" render={({ field }) => ( 
                      <FormItem> 
                        <FormLabel>{tForm('imageUrlLabel')}</FormLabel>
                        <div className="flex gap-2 items-center">
                          <FormControl><Input placeholder={tForm('imageUrlPlaceholder')} {...field} /></FormControl> 
                          <Button type="button" variant="outline" onClick={handleFindImageOnWikimedia}>
                            <Camera className="mr-2 h-4 w-4" />
                            {t('imageSearchDialog.findButton')}
                          </Button>
                        </div>
                        <FormMessage /> 
                      </FormItem> 
                    )}/>
                  </CardContent>
                </Card>

                <DialogFooter className="pt-4">
                  <DialogClose asChild>
                      <Button type="button" variant="outline" disabled={isSubmittingQuestion}>{tCommon('cancel')}</Button>
                  </DialogClose>
                  <Button type="submit" disabled={isSubmittingQuestion} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                    {isSubmittingQuestion && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
