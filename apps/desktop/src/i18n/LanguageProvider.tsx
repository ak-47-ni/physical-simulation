import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import {
  APP_LOCALE_STORAGE_KEY,
  SUPPORTED_APP_LOCALES,
  type AppLocale,
  readPreferredLocale,
} from "./locale";
import { formatMessage, messages, type MessageKey } from "./messages";

type I18nContextValue = {
  locale: AppLocale;
  locales: readonly AppLocale[];
  setLocale: (locale: AppLocale) => void;
  t: (key: MessageKey, variables?: Record<string, number | string>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function LanguageProvider(props: PropsWithChildren) {
  const { children } = props;
  const [locale, setLocale] = useState<AppLocale>(readPreferredLocale);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      locales: SUPPORTED_APP_LOCALES,
      setLocale,
      t: (key, variables) => formatMessage(messages[locale][key], variables),
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);

  if (!value) {
    throw new Error("useI18n must be used within a LanguageProvider.");
  }

  return value;
}
