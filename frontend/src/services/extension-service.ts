import logger from '@/utils/logger';

async function loadExtensionModule(jsUrl: string, { useCache = false } = {}): Promise<void> {
    let apiUrl = `/comfygrid/api/file=${jsUrl}`;
    if (!useCache) apiUrl += `?_=${Date.now()}`;
    try {
        await import(/* @vite-ignore */ apiUrl);
        logger.log(`Loaded extension module: ${jsUrl}`);
    } catch (error) {
        logger.error(`Failed to load extension module: ${jsUrl}`, error);
        throw error;
    }
}

function addStyle(cssUrl: string, { useCache = false } = {}) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    let apiUrl = `/comfygrid/api/file=${cssUrl}`;
    if (!useCache) apiUrl += `?_=${Date.now()}`;
    link.href = apiUrl;
    document.head.appendChild(link);
}

export async function loadExtensions() {
    try {
        const resp = await fetch('/comfygrid/api/extension/resources');
        if (!resp.ok) {
            throw new Error(`HTTP error! status: ${resp.status}`);
        }
        const resources = await resp.json();
        if (Array.isArray(resources)) {
            const promises: Promise<void>[] = [];
            resources.forEach((resource) => {
                if (resource.toLowerCase().endsWith('.js')) {
                    promises.push(loadExtensionModule(resource, { useCache: false }));
                } else if (resource.toLowerCase().endsWith('.css')) {
                    addStyle(resource, { useCache: false });
                }
            });
            await Promise.all(promises);
            logger.log('All extension scripts loaded.');
        }
    } catch (error) {
        logger.error('Failed to fetch extension JS:', error);
    }
}
