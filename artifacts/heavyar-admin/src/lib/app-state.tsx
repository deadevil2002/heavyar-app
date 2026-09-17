import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Direction = 'rtl' | 'ltr';
type Language = 'ar' | 'en';

type AppStateContextType = {
  direction: Direction;
  language: Language;
  toggleLanguage: () => void;
};

const AppStateContext = createContext<AppStateContextType>({
  direction: 'rtl',
  language: 'ar',
  toggleLanguage: () => {},
});

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    return (localStorage.getItem('heavyar-admin-lang') as Language) || 'ar';
  });

  const direction = language === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.dir = direction;
    document.documentElement.lang = language;
    localStorage.setItem('heavyar-admin-lang', language);
  }, [direction, language]);

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'ar' ? 'en' : 'ar');
  };

  return (
    <AppStateContext.Provider value={{ direction, language, toggleLanguage }}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  return useContext(AppStateContext);
}
