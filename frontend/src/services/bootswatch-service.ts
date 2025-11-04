import { appState } from '@/states/app-state.svelte';

export interface BootswatchTheme {
    name: string;
    description: string;
    thumbnail: string;
    preview: string;
    css: string;
    cssMin: string;
    cssCdn: string;
}

const BOOTSWATCH_API_URL = 'https://bootswatch.com/api/5.json';
const BOOTSWATCH_LINK_ID = 'bootswatch-theme-css';
export const BOOTSWATCH_THEME_OPT_KEY = 'bootswatch_theme_url';

export async function fetchBootswatchThemes(): Promise<BootswatchTheme[]> {
    const resp = await fetch(BOOTSWATCH_API_URL);
    if (!resp.ok) {
        throw new Error(`HTTP error! status: ${resp.status}`);
    }
    const data = await resp.json();
    return data.themes as BootswatchTheme[];
}

export function applyBootswatchTheme(cssCdnUrl: string | null): void {
    let linkEl = document.getElementById(BOOTSWATCH_LINK_ID) as HTMLLinkElement | null;
    if (!cssCdnUrl) {
        linkEl?.remove();
        return;
    }
    if (!linkEl) {
        linkEl = document.createElement('link');
        linkEl.id = BOOTSWATCH_LINK_ID;
        linkEl.rel = 'stylesheet';
        document.head.appendChild(linkEl);
    }
    linkEl.href = cssCdnUrl;
}

export function selectBootswatchTheme(cssCdnUrl: string): void {
    appState.optionState.setOptionValue(BOOTSWATCH_THEME_OPT_KEY, cssCdnUrl);
    applyBootswatchTheme(cssCdnUrl || null);
}
