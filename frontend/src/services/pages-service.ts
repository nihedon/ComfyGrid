import { comfyGridApiClient } from '@/api/api-client';
import logger from '@/utils/logger';

export async function loadPages() {
    try {
        const res = await comfyGridApiClient.getPages();
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json;
    } catch (error) {
        logger.error('Failed to fetch pages:', error);
    }
}
