/* eslint-disable @typescript-eslint/no-explicit-any */
import type { bootstrap } from 'bootstrap';
import type { JQueryStatic } from 'jquery';

declare global {
    var bootstrap: bootstrap;
    var $: JQueryStatic;
    var jQuery: JQueryStatic;
    var opts: { [key: string]: any };
    var forms: { [key: string]: any };
    var extForms: { [key: string]: any };
    var onUiLoaded: (callback: () => void) => void;
    var onOptionsChanged: (callback: () => void) => void;
    var onLayoutChanged: (callback: () => void) => void;
    interface JQuery {
        autoComplete(options?: any): this;
    }
}
export {};
