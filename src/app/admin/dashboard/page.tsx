// src/app/admin/dashboard/page.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ListChecks, HelpCircle, ExternalLink, ShieldAlert, MessageSquare } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function AdminDashboardPage() {
  const t = useTranslations('AdminDashboardPage');
  const tCommon = useTranslations('AdminLayout'); 
  const { user } = useAuth(); // No need for userProfile here if we just need the project ID

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
            <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Link href="/admin/categories" className="block">
                    <Card className="hover:shadow-md transition-shadow h-full">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-lg font-medium">{tCommon('navCategories')}</CardTitle>
                            <ListChecks className="h-5 w-5 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">{t('manageCategoriesDescription')}</p>
                        </CardContent>
                    </Card>
                </Link>
                <Link href="/admin/questions" className="block">
                    <Card className="hover:shadow-md transition-shadow h-full">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-lg font-medium">{tCommon('navQuestions')}</CardTitle>
                            <HelpCircle className="h-5 w-5 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">{t('manageQuestionsDescription')}</p>
                        </CardContent>
                    </Card>
                </Link>
                 <Link href="/admin/reports" className="block">
                    <Card className="hover:shadow-md transition-shadow h-full">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-lg font-medium">{tCommon('navReports')}</CardTitle>
                            <ShieldAlert className="h-5 w-5 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">{t('manageReportsDescription')}</p>
                        </CardContent>
                    </Card>
                </Link>
                 <Link href="/admin/suggestions" className="block">
                    <Card className="hover:shadow-md transition-shadow h-full">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-lg font-medium">{tCommon('navSuggestions')}</CardTitle>
                            <MessageSquare className="h-5 w-5 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">{t('manageSuggestionsDescription')}</p>
                        </CardContent>
                    </Card>
                </Link>
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>{t('otherActionsTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-4">
                <Button asChild variant="outline">
                    <Link href="/" target="_blank">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        {t('viewLiveAppButton')}
                    </Link>
                </Button>
                <Button asChild variant="outline" disabled={!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}>
                    <Link href={'https://console.firebase.google.com/project/' + process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID + '/firestore/data/users'} target="_blank">
                         <ExternalLink className="mr-2 h-4 w-4" />
                        {t('openUsersInFirestoreButton')}
                    </Link>
                </Button>
            </CardContent>
        </Card>
    </div>
  );
}
