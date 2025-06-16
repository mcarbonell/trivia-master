// src/components/game/ReportQuestionDialog.tsx
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useTranslations, useLocale } from 'next-intl';
import type { ReportReason, DifficultyLevel, BilingualText } from '@/types';
import { addReport } from '@/services/reportService';
import type { AppLocale } from '@/lib/i18n-config';
import { Loader2 } from 'lucide-react';

const reportReasons: ReportReason[] = [
  'incorrect_info',
  'poorly_worded',
  'typo_grammar',
  'duplicate_question',
  'offensive_content',
  'other',
];

const reportFormSchema = z.object({
  reason: z.enum(reportReasons, {
    required_error: "Please select a reason for reporting.",
  }),
  details: z.string().max(500, "Details must be 500 characters or less.").optional(),
});

type ReportFormData = z.infer<typeof reportFormSchema>;

interface ReportQuestionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questionId?: string; // Firestore ID if available
  bilingualQuestionText: BilingualText;
  categoryTopicValue: string;
  difficulty: DifficultyLevel;
}

export function ReportQuestionDialog({
  open,
  onOpenChange,
  questionId,
  bilingualQuestionText,
  categoryTopicValue,
  difficulty,
}: ReportQuestionDialogProps) {
  const t = useTranslations('ReportDialog');
  const tCommon = useTranslations();
  const currentLocale = useLocale() as AppLocale;
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ReportFormData>({
    resolver: zodResolver(reportFormSchema),
    defaultValues: {
      reason: undefined,
      details: '',
    },
  });

  const onSubmit = async (data: ReportFormData) => {
    setIsSubmitting(true);
    try {
      await addReport({
        questionId,
        questionTextEn: bilingualQuestionText.en,
        questionTextEs: bilingualQuestionText.es,
        categoryTopicValue,
        difficulty,
        reason: data.reason,
        details: data.details,
        locale: currentLocale,
      });
      toast({
        title: tCommon('toastSuccessTitle') as string,
        description: t('reportSubmittedSuccess'),
      });
      onOpenChange(false); // Close dialog on success
      form.reset(); // Reset form for next time
    } catch (error) {
      console.error("Failed to submit report:", error);
      toast({
        variant: "destructive",
        title: tCommon('toastErrorTitle') as string,
        description: t('reportSubmittedError'),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isSubmitting) { // Prevent closing while submitting
        onOpenChange(isOpen);
        if (!isOpen) form.reset(); // Reset form if dialog is closed manually
      }
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('reasonLabel')}</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('reasonPlaceholder')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {reportReasons.map((reason) => (
                        <SelectItem key={reason} value={reason}>
                          {t(`reasons.${reason}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="details"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('detailsLabel')}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t('detailsPlaceholder')}
                      className="resize-none"
                      {...field}
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="gap-2 sm:gap-0">
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isSubmitting}>
                  {tCommon('cancel')}
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('submitButton')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
