// src/app/about/page.tsx
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useTranslations, useLocale } from 'next-intl';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send, Info, Lightbulb } from 'lucide-react';
import { addSuggestion } from '@/services/suggestionService';
import type { AppLocale } from '@/lib/i18n-config';
import Link from 'next/link';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

const suggestionFormSchema = z.object({
  name: z.string().max(100, { message: "Name must be 100 characters or less." }).optional(),
  email: z.string().email({ message: "Invalid email address." }).max(100, { message: "Email must be 100 characters or less." }).optional().or(z.literal('')),
  message: z.string().min(10, { message: "Message must be at least 10 characters." }).max(2000, { message: "Message must be 2000 characters or less." }),
});

type SuggestionFormData = z.infer<typeof suggestionFormSchema>;

export default function AboutPage() {
  const t = useTranslations('AboutPage');
  const tCommon = useTranslations();
  const locale = useLocale() as AppLocale;
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());


  const form = useForm<SuggestionFormData>({
    resolver: zodResolver(suggestionFormSchema),
    defaultValues: {
      name: '',
      email: '',
      message: '',
    },
  });

  const onSubmit = async (data: SuggestionFormData) => {
    setIsSubmitting(true);
    try {
      await addSuggestion({ ...data, locale });
      toast({
        title: tCommon('toastSuccessTitle') as string,
        description: t('contactForm.submitSuccess'),
      });
      form.reset();
    } catch (error) {
      console.error("Failed to submit suggestion:", error);
      toast({
        variant: "destructive",
        title: tCommon('toastErrorTitle') as string,
        description: t('contactForm.submitError'),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto p-4 flex flex-col items-center min-h-screen text-foreground bg-muted/80">
      <header className="my-6 sm:my-8 text-center w-full max-w-3xl">
        <div className="flex justify-between items-center mb-2 sm:mb-4">
          <Button variant="outline" asChild>
            <Link href="/">{t('backToGame')}</Link>
          </Button>
          <h1 className="text-3xl sm:text-4xl font-headline font-bold text-primary">{t('title')}</h1>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="w-full max-w-3xl flex-grow space-y-8">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center text-2xl">
              <Info className="mr-3 h-7 w-7 text-primary" />
              {t('aboutSection.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>{t('aboutSection.intro')}</p>
            <p>{t('aboutSection.featuresTitle')}</p>
            <ul className="list-disc list-inside space-y-1 pl-4">
              <li>{t('aboutSection.featureAI')}</li>
              <li>{t('aboutSection.featureCategories')}</li>
              <li>{t('aboutSection.featureDifficulty')}</li>
              <li>{t('aboutSection.featureBilingual')}</li>
            </ul>
            <p>{t('aboutSection.techStack', { nextjs: 'Next.js', genkit: 'Genkit', shadcn: 'ShadCN UI', tailwind: 'Tailwind CSS', firebase: 'Firebase' })}</p>
            <p>{t('aboutSection.feedbackEncouragement')}</p>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center text-2xl">
              <Lightbulb className="mr-3 h-7 w-7 text-primary" />
              {t('contactForm.title')}
            </CardTitle>
            <CardDescription>{t('contactForm.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('contactForm.nameLabel')}</FormLabel>
                        <FormControl>
                          <Input placeholder={t('contactForm.namePlaceholder')} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('contactForm.emailLabel')}</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder={t('contactForm.emailPlaceholder')} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('contactForm.messageLabel')}</FormLabel>
                      <FormControl>
                        <Textarea placeholder={t('contactForm.messagePlaceholder')} {...field} rows={5} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  {t('contactForm.submitButton')}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </main>

      <footer className="mt-auto pt-8 pb-4 text-center text-sm text-muted-foreground">
        <p>{tCommon('footerText', { year: currentYear })}</p>
      </footer>
    </div>
  );
}
