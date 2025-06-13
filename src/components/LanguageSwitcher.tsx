'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation'; // Using next/navigation for App Router
import { localeCookieName } from '@/i18n';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Globe } from 'lucide-react';

export function LanguageSwitcher() {
  const currentLocale = useLocale();
  const router = useRouter();
  const t = useTranslations();

  const handleChangeLanguage = (newLocale: string) => {
    if (newLocale !== currentLocale) {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 30); // Cookie expires in 30 days
      document.cookie = `${localeCookieName}=${newLocale};path=/;expires=${expiryDate.toUTCString()};SameSite=Lax`;
      // Instead of full reload, router.refresh() re-renders Server Components
      // and allows next-intl to pick up the new locale from the cookie.
      router.refresh(); 
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label={t('languageSwitcherDescription')}>
          <Globe className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => handleChangeLanguage('en')}
          disabled={currentLocale === 'en'}
        >
          {t('english')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleChangeLanguage('es')}
          disabled={currentLocale === 'es'}
        >
          {t('spanish')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
