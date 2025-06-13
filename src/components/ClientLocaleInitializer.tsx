'use client';

import { useEffect } from 'react';
import { localeCookieName, supportedLocales, defaultLocale, type AppLocale } from '@/lib/i18n-config';

export function ClientLocaleInitializer() {
  useEffect(() => {
    const currentCookie = document.cookie
      .split('; ')
      .find(row => row.startsWith(`${localeCookieName}=`));
    
    if (!currentCookie) {
      let browserLang = navigator.language.split('-')[0];
      if (!supportedLocales.includes(browserLang as AppLocale)) {
        browserLang = defaultLocale;
      }
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 30); // Cookie expires in 30 days
      document.cookie = `${localeCookieName}=${browserLang};path=/;expires=${expiryDate.toUTCString()};SameSite=Lax`;
      
      // Refresh to apply the new locale if it differs from what might have been SSR'd
      // This is important for the very first load.
      window.location.reload();
    }
  }, []);

  return null;
}
