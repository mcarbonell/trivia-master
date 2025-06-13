
import {getRequestConfig} from 'next-intl/server';

// Can be imported from a shared config
// For now, to ensure no external dependencies are causing issues in config loading:
// import {defaultLocale, type AppLocale} from '@/lib/i18n-config';

export default getRequestConfig(async () => {
  // For extreme debugging: Temporarily hardcode the locale directly.
  const locale = 'en';

  // Load messages for the hardcoded locale.
  // The path is relative from this file (src/i18n.ts) to src/messages/en.json
  const messages = (await import(`./messages/${locale}.json`)).default;

  return {
    locale,
    messages
  };
});

