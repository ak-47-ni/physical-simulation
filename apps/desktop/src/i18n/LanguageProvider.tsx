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
const defaultI18nContextValue: I18nContextValue = {
  locale: "en",
  locales: SUPPORTED_APP_LOCALES,
  setLocale: () => undefined,
  t: (key, variables) => formatMessage(messages.en[key], variables),
};

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

  return value ?? defaultI18nContextValue;
}
