// The app's language: stored on the device, mirrored to the account when there is one, applied to i18next
// and to the reading direction of the whole screen tree (no restart).
import * as React from "react";

import { DEFAULT_LOCALE, isSupportedLocale, type SupportedLocale } from "@kawase/config";
import { isRtlLocale } from "@kawase/i18n";
import { Direction } from "@kawase/ui-native/components/direction";

import { deviceLocale, initI18n, setLocale as applyLocale } from "@/i18n";
import { useSession } from "@/session/session-provider";
import { sessionStorage } from "@/session/storage";

type LocaleState = {
  locale: SupportedLocale;
  /** Set by the user: stored, applied, and sent to the api when signed in. */
  chooseLocale: (locale: SupportedLocale) => Promise<void>;
  rtl: boolean;
};

const LocaleContext = React.createContext<LocaleState | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const { status, user, update } = useSession();
  const [locale, setLocaleState] = React.useState<SupportedLocale | undefined>();

  React.useEffect(() => {
    void sessionStorage
      .getLocale()
      .catch(() => undefined)
      .then((stored) => {
        const initial = stored && isSupportedLocale(stored) ? stored : deviceLocale();
        initI18n(initial);
        setLocaleState(initial);
      });
  }, []);

  // The account's language wins over the device's once the user is known.
  React.useEffect(() => {
    if (status === "account" && user && isSupportedLocale(user.locale) && user.locale !== locale) {
      void applyLocale(user.locale);
      void sessionStorage.setLocale(user.locale).catch(() => undefined);
      setLocaleState(user.locale);
    }
  }, [status, user, locale]);

  const value = React.useMemo<LocaleState>(
    () => ({
      locale: locale ?? DEFAULT_LOCALE,
      rtl: isRtlLocale(locale ?? DEFAULT_LOCALE),
      async chooseLocale(next) {
        await applyLocale(next);
        setLocaleState(next);
        await sessionStorage.setLocale(next).catch(() => undefined);
        if (status === "guest" || status === "account") await update({ locale: next }).catch(() => undefined);
      },
    }),
    [locale, status, update],
  );

  if (!locale) return null;
  return (
    <LocaleContext.Provider value={value}>
      <Direction rtl={value.rtl} className="flex-1">
        {children}
      </Direction>
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleState {
  const state = React.useContext(LocaleContext);
  if (!state) throw new Error("useLocale must be used inside LocaleProvider");
  return state;
}
