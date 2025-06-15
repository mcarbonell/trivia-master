// src/app/admin/dashboard/page.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ListChecks, HelpCircle, ExternalLink } from 'lucide-react';

export default function AdminDashboardPage() {
  const t = useTranslations('AdminDashboardPage');
  const tCommon = useTranslations('AdminLayout'); // For shared titles

  return (
    <div className="space-y-6">
        <header className="mb-6">
            <h1 className="text-3xl font-headline text-primary">{t('title')}</h1>
            <p className="text-muted-foreground">{t('description')}</p>
        </header>

        <Card className="shadow-lg">
            <CardHeader>
            <CardTitle className="text-2xl">{t('quickAccessTitle')}</CardTitle>
            <CardDescription>{t('quickAccessDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
                <Link href="/admin/categories" passHref legacyBehavior>
                    <a className="block">
                        <Card className="hover:shadow-md transition-shadow">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-lg font-medium">{tCommon('navCategories')}</CardTitle>
                                <ListChecks className="h-5 w-5 text-primary" />
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground">{t('manageCategoriesDescription')}</p>
                            </CardContent>
                        </Card>
                    </a>
                </Link>
                <Link href="/admin/questions" passHref legacyBehavior>
                    <a className="block">
                        <Card className="hover:shadow-md transition-shadow">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-lg font-medium">{tCommon('navQuestions')}</CardTitle>
                                <HelpCircle className="h-5 w-5 text-primary" />
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground">{t('manageQuestionsDescription')}</p>
                            </CardContent>
                        </Card>
                    </a>
                </Link>
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>{t('otherActionsTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-4">
                <Button variant="outline" onClick={() => window.open('/','_blank')}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    {t('viewLiveAppButton')}
                </Button>
                <Button variant="outline" onClick={() => window.open('https://console.firebase.google.com/project/' + process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID + '/firestore/data','_blank')} disabled={!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}>
                     <ExternalLink className="mr-2 h-4 w-4" />
                    {t('openFirestoreButton')}
                </Button>
            </CardContent>
        </Card>
    </div>
  );
}
