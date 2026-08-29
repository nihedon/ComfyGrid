import logger from '@/utils/logger';

export interface NodeWidgetMatch {
    widgetClassName?: string;
    widgetName?: string;
    widgetType?: string;
    nodeType?: string;
    comfyClass?: string;
}

export interface NodeWidgetRegistration {
    match: NodeWidgetMatch;
    element: string;
}

export interface HeaderButtonRegistration {
    id: string;
    icon?: string;
    title?: string;
    onClick: (app: unknown) => void;
}

export interface ComfyGridExtension {
    name: string;
    version?: string;
    description?: string;
    nodeWidgets?: NodeWidgetRegistration[];
    headerButtons?: HeaderButtonRegistration[];
    init?: (api: unknown) => void | Promise<void>;
    onBeforeExecute?: (workflow: unknown) => void | Promise<void>;
    onExecutionCompleted?: (job: unknown) => void | Promise<void>;
}

class ComfyGridExtensionManager {
    readonly #extensions = new Map<string, ComfyGridExtension>();
    readonly #nodeWidgetRegistrations: NodeWidgetRegistration[] = [];
    readonly #headerButtonRegistrations: HeaderButtonRegistration[] = [];

    registerExtension(extension: ComfyGridExtension): void {
        if (!extension?.name) {
            logger.error('Invalid extension registration: missing name');
            return;
        }

        if (this.#extensions.has(extension.name)) {
            logger.warn(`Extension "${extension.name}" is already registered. Overwriting.`);
        }

        this.#extensions.set(extension.name, extension);

        if (extension.nodeWidgets) {
            this.#nodeWidgetRegistrations.push(...extension.nodeWidgets);
        }

        if (extension.headerButtons) {
            this.#headerButtonRegistrations.push(...extension.headerButtons);
        }

        logger.log(`[ExtensionManager] Registered extension: ${extension.name}`);
    }

    getExtensions(): ReadonlyMap<string, ComfyGridExtension> {
        return this.#extensions;
    }

    getNodeWidgetRegistrations(): ReadonlyArray<NodeWidgetRegistration> {
        return this.#nodeWidgetRegistrations;
    }

    getHeaderButtons(): ReadonlyArray<HeaderButtonRegistration> {
        return this.#headerButtonRegistrations;
    }

    async runInitHooks(api: unknown): Promise<void> {
        for (const [name, ext] of this.#extensions) {
            if (typeof ext.init === 'function') {
                try {
                    await ext.init(api);
                } catch (error) {
                    logger.error(`[ExtensionManager] Error initializing extension "${name}":`, error);
                }
            }
        }
    }
}

export const extensionManager = new ComfyGridExtensionManager();

declare global {
    interface Window {
        comfygrid?: {
            registerExtension: (ext: ComfyGridExtension) => void;
            getExtensions: () => ReadonlyMap<string, ComfyGridExtension>;
            version: string;
        };
    }
}

// Expose global comfygrid object for extension scripts
if (typeof window !== 'undefined') {
    window.comfygrid = {
        registerExtension: (ext: ComfyGridExtension) => extensionManager.registerExtension(ext),
        getExtensions: () => extensionManager.getExtensions(),
        version: '1.0.0',
    };
}
