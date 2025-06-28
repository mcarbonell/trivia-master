// src/app/admin/settings/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { getScriptSettings, updateScriptSettings, getAvailableModels, type ScriptSettings, type AvailableModels } from '@/services/settingsService';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const settingsFormSchema = z.object({
  targetPerDifficulty: z.number().min(1),
  maxNewPerRun: z.number().min(1),
  batchSize: z.number().min(1),
  defaultModel: z.string().min(1, 'Model name is required.'),
  imageLimit: z.number().min(1),
  imageDelay: z.number().min(0),
  defaultImageModel: z.string().min(1, 'Image model is required.'),
});
type SettingsFormData = z.infer<typeof settingsFormSchema>;

export default function AdminSettingsPage() {
  const t = useTranslations('AdminSettingsPage');
  const tCommon = useTranslations();
  const { toast } = useToast();

  const [initialSettings, setInitialSettings] = useState<ScriptSettings | null>(null);
  const [availableModels, setAvailableModels] = useState<AvailableModels | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<SettingsFormData>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      targetPerDifficulty: 200,
      maxNewPerRun: 25,
      batchSize: 25,
      defaultModel: 'googleai/gemini-2.5-flash',
      imageLimit: 10,
      imageDelay: 2000,
      defaultImageModel: 'googleai/gemini-2.0-flash-preview-image-generation'
    }
  });

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settings, models] = await Promise.all([
        getScriptSettings(),
        getAvailableModels(),
      ]);
      setInitialSettings(settings);
      setAvailableModels(models);

      form.reset({
        targetPerDifficulty: settings.populateQuestions.targetPerDifficulty,
        maxNewPerRun: settings.populateQuestions.maxNewPerRun,
        batchSize: settings.populateQuestions.batchSize,
        defaultModel: settings.populateQuestions.defaultModel,
        imageLimit: settings.populateImages.limit,
        imageDelay: settings.populateImages.delay,
        defaultImageModel: settings.populateImages.defaultImageModel,
      });

    } catch (err) {
      console.error("Error loading settings or models:", err);
      setError(t('errorLoading'));
      toast({ variant: 'destructive', title: tCommon('toastErrorTitle') as string, description: t('errorLoading') });
    } finally {
      setLoading(false);
    }
  }, [form, t, tCommon, toast]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const onSubmit = async (data: SettingsFormData) => {
    setIsSubmitting(true);
    const newSettings: ScriptSettings = {
      populateQuestions: {
        targetPerDifficulty: data.targetPerDifficulty,
        maxNewPerRun: data.maxNewPerRun,
        batchSize: data.batchSize,
        defaultModel: data.defaultModel,
      },
      populateImages: {
        limit: data.imageLimit,
        delay: data.imageDelay,
        defaultImageModel: data.defaultImageModel,
      },
    };

    try {
      await updateScriptSettings(newSettings);
      toast({ title: tCommon('toastSuccessTitle') as string, description: t('toastUpdateSuccess') });
      setInitialSettings(newSettings); // Update local state to reflect changes
    } catch (err) {
      console.error("Error updating settings:", err);
      toast({ variant: 'destructive', title: tCommon('toastErrorTitle') as string, description: t('toastUpdateError') });
    } finally {
      setIsSubmitting(false);
    }
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
        <CardHeader><CardTitle className="text-destructive flex items-center"><AlertTriangle className="mr-2 h-6 w-6" />{tCommon('errorTitle')}</CardTitle></CardHeader>
        <CardContent><p className="text-destructive">{error}</p></CardContent>
        <CardFooter><Button onClick={loadInitialData} variant="outline"><RefreshCw className="mr-2 h-4 w-4" />{tCommon('retryButton')}</Button></CardFooter>
      </Card>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <header className="mb-6">
          <h1 className="text-3xl font-headline text-primary">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>{t('populateQuestions.title')}</CardTitle>
            <CardDescription>{t('populateQuestions.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <FormField control={form.control} name="targetPerDifficulty" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('populateQuestions.targetPerDifficultyLabel')}</FormLabel>
                    <FormControl><Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value, 10) || 0)} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              <FormField control={form.control} name="maxNewPerRun" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('populateQuestions.maxNewPerRunLabel')}</FormLabel>
                    <FormControl><Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value, 10) || 0)} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              <FormField control={form.control} name="batchSize" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('populateQuestions.batchSizeLabel')}</FormLabel>
                    <FormControl><Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value, 10) || 0)} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
            </div>
            <FormField control={form.control} name="defaultModel" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('populateQuestions.defaultModelLabel')}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {availableModels?.textModels.map(model => (
                        <SelectItem key={model} value={model}>{model}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('populateImages.title')}</CardTitle>
            <CardDescription>{t('populateImages.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField control={form.control} name="imageLimit" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('populateImages.limitLabel')}</FormLabel>
                    <FormControl><Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value, 10) || 0)} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              <FormField control={form.control} name="imageDelay" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('populateImages.delayLabel')}</FormLabel>
                    <FormControl><Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value, 10) || 0)} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
            </div>
            <FormField control={form.control} name="defaultImageModel" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('populateImages.defaultImageModelLabel')}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {availableModels?.imageModels.map(model => (
                        <SelectItem key={model} value={model}>{model}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
          </CardContent>
        </Card>
        
        <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tCommon('save')}
            </Button>
        </div>
      </form>
    </Form>
  );
}
