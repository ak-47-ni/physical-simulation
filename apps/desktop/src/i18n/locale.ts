export const APP_LOCALE_STORAGE_KEY = "physics-sandbox:locale";
export const SUPPORTED_APP_LOCALES = ["en", "zh-CN"] as const;

export type AppLocale = (typeof SUPPORTED_APP_LOCALES)[number];

export function isAppLocale(value: unknown): value is AppLocale {
  return value === "en" || value === "zh-CN";
}

export function resolveInitialLocale(input: {
  navigatorLanguage?: string | null;
  storedLocale?: string | null;
}): AppLocale {
  if (isAppLocale(input.storedLocale)) {
    return input.storedLocale;
  }

  return input.navigatorLanguage?.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function readPreferredLocale(): AppLocale {
  if (typeof window === "undefined") {
    return "en";
  }

  return resolveInitialLocale({
    navigatorLanguage: typeof navigator === "undefined" ? null : navigator.language,
    storedLocale: window.localStorage.getItem(APP_LOCALE_STORAGE_KEY),
  });
}
