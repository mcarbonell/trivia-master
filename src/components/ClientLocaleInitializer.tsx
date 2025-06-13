'use client';

import { useEffect } from 'react';
import { localeCookieName, supportedLocales, defaultLocale, type AppLocale } from '@/lib/i18n-config';

const LOCALE_RELOAD_ATTEMPTED_KEY = 'localeReloadAttempted';

export function ClientLocaleInitializer() {
  useEffect(() => {
    // Check if we've already attempted a reload in this session to prevent loops
    if (sessionStorage.getItem(LOCALE_RELOAD_ATTEMPTED_KEY)) {
      return;
    }

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
      
      // Attempt to set the cookie
      document.cookie = `${localeCookieName}=${browserLang};path=/;expires=${expiryDate.toUTCString()};SameSite=Lax`;
      
      // Mark that we've attempted a reload
      sessionStorage.setItem(LOCALE_RELOAD_ATTEMPTED_KEY, 'true');
      
      // Refresh to apply the new locale.
      // This is important for the very first load if the browser lang differs from default
      // and no cookie was present. The server will pick up the new cookie on next load.
      window.location.reload();
    }
  }, []);

  return null;
}
