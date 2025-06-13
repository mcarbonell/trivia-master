// src/lib/i18n-config.ts
export const supportedLocales = ['en', 'es'] as const;
export type AppLocale = typeof supportedLocales[number];
export const defaultLocale: AppLocale = 'en';
export const localeCookieName = 'NEXT_LOCALE';
