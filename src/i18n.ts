
import {getRequestConfig} from 'next-intl/server';
import {defaultLocale} from '@/lib/i18n-config';

// Import message files statically
import enMessages from '@/messages/en.json';
// Import esMessages as well, though we won't use it in this simplified version immediately
// This ensures it's still part of the build if needed later, and confirms path resolution.
import esMessages from '@/messages/es.json';

export default getRequestConfig(async ({locale: localeFromNextIntl}) => {
  // For now, always serve English to test if the config file is found and processed at all.
  // We're ignoring localeFromNextIntl and any cookie logic for this test.
  let messages = enMessages;
  let resolvedLocale = defaultLocale; // Or simply 'en'

  // Basic example of how you might select messages if you were using localeFromNextIntl:
  // if (localeFromNextIntl === 'es') {
  //   messages = esMessages;
  //   resolvedLocale = 'es';
  // }

  return {
    locale: resolvedLocale,
    messages: messages,
  };
});

