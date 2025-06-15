// src/app/admin/questions/page.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';

export default function AdminQuestionsPage() {
  const t = useTranslations('AdminQuestionsPage');

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
          <CardDescription>{t('questionsListDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{t('comingSoon')}</p>
          {/* Placeholder for questions list and management tools */}
        </CardContent>
      </Card>
    </div>
  );
}
