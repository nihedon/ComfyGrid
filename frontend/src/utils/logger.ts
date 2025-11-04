import log from 'loglevel';
import { appState } from '@/states/app-state.svelte';

const isDev = import.meta.env.DEV;
log.setLevel(isDev || appState.isDebugMode ? 'debug' : 'warn');

const style = {
    color: '#2453da',
    'background-color': '#d1e6f5',
    padding: '0 8px',
    'font-weight': 'bold',
    'border-radius': '3px',
};

const label = 'ComfyGrid';
const css = Object.entries(style).reduce((acc, [key, value]) => `${acc}; ${key}: ${value}`, '');

const logger = new Proxy(log, {
    get(target, prop) {
        const value = target[prop as keyof typeof log];
        if (typeof value === 'function' && ['trace', 'log', 'debug', 'info', 'warn', 'error'].includes(prop as string)) {
            const date = new Date();
            const time = date.toTimeString().replace(/.*(\d{2}:\d{2}:\d{2}).*/, '$1');
            const logLevel = prop.toString().toUpperCase();
            return value.bind(target, `%c${label}%c [${time}] <${logLevel}>`, css, '');
        }
        return value;
    },
});

export default logger;
