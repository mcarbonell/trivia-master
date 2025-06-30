// src/app/page.tsx (New Landing Page)
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useTranslations, useLocale } from 'next-intl';
import { BrainCircuit, Sparkles, TrendingUp, Languages, PlayCircle } from 'lucide-react';
import type { AppLocale } from '@/lib/i18n-config';

export default function LandingPage() {
  const t = useTranslations('LandingPage');
  const locale = useLocale() as AppLocale;

  const features = [
    {
      icon: BrainCircuit,
      title: t('featureEndlessTopics'),
      description: t('featureEndlessTopicsDesc'),
    },
    {
      icon: Sparkles,
      title: t('featureAiPowered'),
      description: t('featureAiPoweredDesc'),
    },
    {
      icon: TrendingUp,
      title: t('featureAdaptive'),
      description: t('featureAdaptiveDesc'),
    },
    {
      icon: Languages,
      title: t('featureBilingual'),
      description: t('featureBilingualDesc'),
    },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="container mx-auto flex justify-between items-center py-4 px-6">
        <h1 className="text-xl font-bold text-primary font-headline">AI Trivia Master</h1>
        <LanguageSwitcher />
      </header>
      
      <main className="flex-grow">
        {/* Hero Section */}
        <section className="container mx-auto flex flex-col items-center justify-center text-center py-16 md:py-24">
          <h2 className="text-4xl md:text-6xl font-bold font-headline text-primary tracking-tight">
            {t('title')}
          </h2>
          <p className="mt-4 max-w-2xl text-lg md:text-xl text-muted-foreground">
            {t('subtitle')}
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4">
            <Button asChild size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Link href="/play">
                <PlayCircle className="mr-2 h-5 w-5" />
                {t('ctaButton')}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">{t('loginButton')}</Link>
            </Button>
          </div>
        </section>

        {/* Features Section */}
        <section className="bg-secondary/50 py-16 md:py-24">
          <div className="container mx-auto">
            <div className="text-center mb-12">
              <h3 className="text-3xl md:text-4xl font-bold font-headline text-foreground">
                {t('featuresTitle')}
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {features.map((feature, index) => (
                <Card key={index} className="text-center shadow-lg hover:shadow-xl transition-shadow">
                  <CardHeader>
                    <div className="mx-auto bg-primary/10 text-primary rounded-full p-3 w-fit">
                      <feature.icon className="h-8 w-8" />
                    </div>
                    <CardTitle className="mt-4">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
