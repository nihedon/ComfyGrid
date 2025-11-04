import logger from '@/utils/logger';

export async function loadPages(): Promise<Array<{ id: string; title: string }>> {
    try {
        const resp = await fetch('/comfygrid/api/pages');
        if (!resp.ok) {
            throw new Error(`HTTP error! status: ${resp.status}`);
        }
        const pages = await resp.json();
        return pages;
    } catch (error) {
        logger.error('Failed to fetch pages:', error);
    }
}
