// src/app/admin/categories/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { getAppCategories, addCategory, updateCategory, deleteCategory } from '@/services/categoryService';
import type { CategoryDefinition, BilingualText, DifficultyLevel } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2, PlusCircle, Edit, Trash2, AlertTriangle, RefreshCw } from 'lucide-react'; // Added RefreshCw
import { useTranslations, useLocale } from 'next-intl';
import type { AppLocale } from '@/lib/i18n-config';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase'; // Import db for Firestore queries
import { collection, query, where, getCountFromServer } from 'firebase/firestore';

const categoryFormSchema = z.object({
  topicValue: z.string().min(1, { message: "Topic Value is required." }).max(100, { message: "Topic Value must be 100 characters or less." }),
  nameEn: z.string().min(1, { message: "English name is required." }),
  nameEs: z.string().min(1, { message: "Spanish name is required." }),
  icon: z.string().min(1, { message: "Icon name is required." }).max(50, { message: "Icon name must be 50 characters or less." }),
  detailedPromptInstructions: z.string().min(1, { message: "Detailed prompt instructions are required." }),
  isPredefined: z.boolean().default(true),
  difficultyEasy: z.string().optional(),
  difficultyMedium: z.string().optional(),
  difficultyHard: z.string().optional(),
});
export type CategoryFormData = z.infer<typeof categoryFormSchema>;

interface QuestionCounts {
  easy: number;
  medium: number;
  hard: number;
}

interface CategoryWithCounts extends CategoryDefinition {
  questionCounts?: QuestionCounts;
  isLoadingCounts?: boolean;
}

const DIFFICULTIES: DifficultyLevel[] = ['easy', 'medium', 'hard'];

export default function AdminCategoriesPage() {
  const t = useTranslations('AdminCategoriesPage');
  const tCommon = useTranslations();
  const locale = useLocale() as AppLocale;
  const { toast } = useToast();

  const [categories, setCategories] = useState<CategoryWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentCategory, setCurrentCategory] = useState<CategoryWithCounts | null>(null);
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CategoryFormData>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      topicValue: '',
      nameEn: '',
      nameEs: '',
      icon: '',
      detailedPromptInstructions: '',
      isPredefined: true,
      difficultyEasy: '',
      difficultyMedium: '',
      difficultyHard: '',
    },
  });

  const fetchCategoriesAndCounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fetchedCategories = await getAppCategories();
      // Initialize categories with isLoadingCounts true for all categories
      // as question counts are relevant for any category defined in Firestore
      const categoriesWithLoadingState: CategoryWithCounts[] = fetchedCategories.map(cat => ({
        ...cat,
        isLoadingCounts: true, 
      }));
      setCategories(categoriesWithLoadingState);
      setLoading(false); // Base categories loaded

      // Now fetch counts for ALL categories
      const countPromises = fetchedCategories.map(async (category) => {
        try {
          const counts: Partial<QuestionCounts> = {};
          const questionsRef = collection(db, 'predefinedTriviaQuestions');
          
          for (const diff of DIFFICULTIES) {
            const q = query(questionsRef, where('topicValue', '==', category.topicValue), where('difficulty', '==', diff));
            const snapshot = await getCountFromServer(q);
            counts[diff] = snapshot.data().count;
          }
          return { ...category, questionCounts: counts as QuestionCounts, isLoadingCounts: false };
        } catch (countError) {
          console.error(`Error fetching counts for category ${category.topicValue}:`, countError);
          return { ...category, questionCounts: undefined, isLoadingCounts: false }; 
        }
      });

      const categoriesWithCounts = await Promise.all(countPromises);
      setCategories(categoriesWithCounts as CategoryWithCounts[]);

    } catch (err) {
      console.error("Error fetching categories:", err);
      setError(t('errorLoading'));
      toast({ variant: "destructive", title: tCommon('toastErrorTitle') as string, description: t('errorLoading') });
      setLoading(false); 
    }
  }, [t, tCommon, toast]);

  useEffect(() => {
    fetchCategoriesAndCounts();
  }, [fetchCategoriesAndCounts]);

  const handleOpenDialog = (mode: 'add' | 'edit', category?: CategoryWithCounts) => {
    setFormMode(mode);
    setCurrentCategory(category || null);
    form.reset(category ? {
      topicValue: category.topicValue,
      nameEn: category.name.en,
      nameEs: category.name.es,
      icon: category.icon,
      detailedPromptInstructions: category.detailedPromptInstructions,
      isPredefined: category.isPredefined === undefined ? true : category.isPredefined,
      difficultyEasy: category.difficultySpecificGuidelines?.easy || '',
      difficultyMedium: category.difficultySpecificGuidelines?.medium || '',
      difficultyHard: category.difficultySpecificGuidelines?.hard || '',
    } : {
      topicValue: '',
      nameEn: '',
      nameEs: '',
      icon: '',
      detailedPromptInstructions: '',
      isPredefined: true,
      difficultyEasy: '',
      difficultyMedium: '',
      difficultyHard: '',
    });
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: CategoryFormData) => {
    setIsSubmitting(true);
    const categoryDataToSave: Omit<CategoryDefinition, 'id'> = {
      topicValue: data.topicValue,
      name: { en: data.nameEn, es: data.nameEs },
      icon: data.icon,
      detailedPromptInstructions: data.detailedPromptInstructions,
      isPredefined: data.isPredefined,
      difficultySpecificGuidelines: {
        ...(data.difficultyEasy && { easy: data.difficultyEasy }),
        ...(data.difficultyMedium && { medium: data.difficultyMedium }),
        ...(data.difficultyHard && { hard: data.difficultyHard }),
      },
    };
    if (Object.keys(categoryDataToSave.difficultySpecificGuidelines || {}).length === 0) {
        delete categoryDataToSave.difficultySpecificGuidelines;
    }

    try {
      if (formMode === 'add') {
        await addCategory(categoryDataToSave);
        toast({ title: tCommon('toastSuccessTitle') as string, description: t('toastAddSuccess') });
      } else if (currentCategory) {
        await updateCategory(currentCategory.id, categoryDataToSave);
        toast({ title: tCommon('toastSuccessTitle') as string, description: t('toastUpdateSuccess') });
      }
      await fetchCategoriesAndCounts(); 
      setIsDialogOpen(false);
    } catch (err: any) {
      console.error("Error saving category:", err);
      const errorMessage = err.message.includes("already exists") ? t('errorTopicValueExists', {topicValue: data.topicValue}) : (formMode === 'add' ? t('toastAddError') : t('toastUpdateError'));
      toast({ variant: "destructive", title: tCommon('toastErrorTitle') as string, description: errorMessage });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCategory = async (categoryId: string, categoryName: string) => {
    try {
      await deleteCategory(categoryId);
      toast({ title: tCommon('toastSuccessTitle') as string, description: t('toastDeleteSuccess', { name: categoryName }) });
      await fetchCategoriesAndCounts(); 
    } catch (err) {
      console.error("Error deleting category:", err);
      toast({ variant: "destructive", title: tCommon('toastErrorTitle') as string, description: t('toastDeleteError') });
    }
  };
  
  if (loading) { // Initial loading for categories
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
            <Button onClick={fetchCategoriesAndCounts} variant="outline">
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
        <Button onClick={() => handleOpenDialog('add')}>
          <PlusCircle className="mr-2 h-5 w-5" />
          {t('addButton')}
        </Button>
      </header>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>{t('categoriesListTitle')}</CardTitle>
          <CardDescription>{t('categoriesListDescription', { count: categories.length })}</CardDescription>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">{t('noCategories')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('tableName')}</TableHead>
                  <TableHead>{t('tableTopicValue')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('tableIcon')}</TableHead>
                  <TableHead className="text-center hidden sm:table-cell">{t('tableIsPredefined')}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t('tableQuestionCounts')}</TableHead>
                  <TableHead className="text-right">{t('tableActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell className="font-medium">{category.name[locale]}</TableCell>
                    <TableCell>{category.topicValue}</TableCell>
                    <TableCell className="hidden md:table-cell">{category.icon}</TableCell>
                    <TableCell className="text-center hidden sm:table-cell">{category.isPredefined ? t('yes') : t('no')}</TableCell>
                    <TableCell className="hidden lg:table-cell text-xs">
                      {category.isLoadingCounts ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : category.questionCounts ? (
                        <div className="flex flex-col">
                          <span>{t('difficultyShort.easy')}: {category.questionCounts.easy}</span>
                          <span>{t('difficultyShort.medium')}: {category.questionCounts.medium}</span>
                          <span>{t('difficultyShort.hard')}: {category.questionCounts.hard}</span>
                        </div>
                      ) : (
                        t('noCounts')
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="outline" size="icon" onClick={() => handleOpenDialog('edit', category)} className="h-8 w-8">
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
                              {t('deleteConfirmDescription', { name: category.name[locale] })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteCategory(category.id, category.name[locale])} className="bg-destructive hover:bg-destructive/90">
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
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{formMode === 'add' ? t('addDialogTitle') : t('editDialogTitle')}</DialogTitle>
            <DialogDescription>
              {formMode === 'add' ? t('addDialogDescription') : t('editDialogDescription')}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
              <FormField
                control={form.control}
                name="topicValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('formTopicValue')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('formTopicValuePlaceholder')} {...field} disabled={formMode === 'edit'} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="nameEn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('formNameEn')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('formNameEnPlaceholder')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="nameEs"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('formNameEs')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('formNameEsPlaceholder')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="icon"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('formIcon')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('formIconPlaceholder')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="detailedPromptInstructions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('formDetailedInstructions')}</FormLabel>
                    <FormControl>
                      <Textarea placeholder={t('formDetailedInstructionsPlaceholder')} {...field} rows={5} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="isPredefined"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                    <div className="space-y-0.5">
                        <FormLabel>{t('formIsPredefined')}</FormLabel>
                        <p className="text-xs text-muted-foreground">
                           {t('formIsPredefinedHint')}
                        </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <Card>
                <CardHeader>
                    <CardTitle className="text-lg">{t('formDifficultyGuidelinesTitle')}</CardTitle>
                    <CardDescription>{t('formDifficultyGuidelinesDesc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <FormField
                    control={form.control}
                    name="difficultyEasy"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>{t('formDifficultyEasy')}</FormLabel>
                        <FormControl>
                            <Textarea placeholder={t('formDifficultyPlaceholder', {level: tCommon('difficultyLevels.easy') as string})} {...field} rows={3} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="difficultyMedium"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>{t('formDifficultyMedium')}</FormLabel>
                        <FormControl>
                            <Textarea placeholder={t('formDifficultyPlaceholder', {level: tCommon('difficultyLevels.medium') as string})} {...field} rows={3}/>
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="difficultyHard"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>{t('formDifficultyHard')}</FormLabel>
                        <FormControl>
                            <Textarea placeholder={t('formDifficultyPlaceholder', {level: tCommon('difficultyLevels.hard') as string})} {...field} rows={3}/>
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                </CardContent>
              </Card>

              <DialogFooter>
                <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={isSubmitting}>{tCommon('cancel')}</Button>
                </DialogClose>
                <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {tCommon('save')}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

