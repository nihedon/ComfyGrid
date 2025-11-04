import { derived, writable } from 'svelte/store';
import logger from '@/utils/logger';

type Translations = Record<string, string>;

const currentLang = writable<string>('');

const browserLang = navigator.language.split('-')[0]; // "ja-JP" -> "ja"
currentLang.set(browserLang);

const translations: Record<string, Translations> = {};

async function loadTranslation(lang: string) {
    if (translations[lang]) {
        return;
    }
    try {
        const module = await import(`./locales/${lang}.json`);
        translations[lang] = module.default;
    } catch (error) {
        logger.warn(`Missing translation file for "${lang}"`, error);
    }
}

export async function loadTranslations(languages: string[]) {
    await Promise.all(languages.map((lang) => loadTranslation(lang)));
}

export const t = derived(currentLang, ($lang) => {
    return (key: string, params?: Record<string, string | number>, defaultValue?: string): string => {
        let text = translations[$lang]?.[key] || translations['en']?.[key] || null;
        if (!text) {
            return defaultValue ?? null;
        }

        if (params) {
            Object.entries(params).forEach(([k, v]) => {
                text = text!.replace(`{${k}}`, String(v));
            });
        }

        return text;
    };
});

export async function setLanguage(lang: string) {
    let detectedLang = lang;
    if (!lang || lang === 'auto') {
        detectedLang = browserLang in translations ? browserLang : 'en';
    } else {
        detectedLang = lang in translations ? lang : 'en';
    }

    await loadTranslation(detectedLang);
    currentLang.set(detectedLang);
    localStorage.setItem('lang', detectedLang);
}
