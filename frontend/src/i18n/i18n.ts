import { derived, get, writable } from 'svelte/store';
import logger from '@/utils/logger';

type Translations = Record<string, string>;

const browserLang = navigator.language.split('-')[0]; // "ja-JP" -> "ja"
function createTranslationState() {
    return {
        currentLang: writable(browserLang),
        translations: writable<Record<string, Translations>>({}),
    };
}

// HMR can evaluate this module under multiple timestamps in a cyclic import graph.
const state: ReturnType<typeof createTranslationState> = import.meta.hot?.data.translationState ?? createTranslationState();
if (import.meta.hot) import.meta.hot.data.translationState = state;
const { currentLang, translations } = state;

async function loadTranslation(lang: string) {
    if (get(translations)[lang]) {
        return;
    }
    try {
        const module = await import(`./locales/${lang}.json`);
        translations.update((loaded) => ({ ...loaded, [lang]: module.default }));
    } catch (error) {
        logger.warn(`Missing translation file for "${lang}"`, error);
    }
}

export async function loadTranslations(languages: string[]) {
    await Promise.all(languages.map((lang) => loadTranslation(lang)));
}

export const t = derived([currentLang, translations], ([$lang, $translations]) => {
    return (key: string, params?: Record<string, string | number>, defaultValue?: string): string => {
        let text = $translations[$lang]?.[key] || $translations['en']?.[key] || null;
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
    const loaded = get(translations);
    let detectedLang: string;
    if (!lang || lang === 'auto') {
        detectedLang = browserLang in loaded ? browserLang : 'en';
    } else {
        detectedLang = lang in loaded ? lang : 'en';
    }

    await loadTranslation(detectedLang);
    currentLang.set(detectedLang);
    localStorage.setItem('lang', detectedLang);
}
