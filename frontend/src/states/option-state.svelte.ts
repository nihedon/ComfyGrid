/* eslint-disable @typescript-eslint/no-explicit-any */
import { SvelteMap } from 'svelte/reactivity';

interface BaseFormInfo {
    type: string;
    group?: string;
    label?: string;
    hint?: string;
    default?: unknown;
}

/** @public */
export interface CheckboxFormInfo extends BaseFormInfo {
    type: 'checkbox';
    default?: boolean;
}

/** @public */
export interface SliderFormInfo extends BaseFormInfo {
    type: 'slider';
    minimum?: number;
    maximum?: number;
    step?: number;
    default?: number;
}

/** @public */
export interface TextFormInfo extends BaseFormInfo {
    type: 'text';
    placeholder?: string;
    default?: string;
}

/** @public */
interface TextareaFormInfo extends BaseFormInfo {
    type: 'textarea';
    lines?: number;
    placeholder?: string;
    default?: string;
}

/** @public */
export interface NumberFormInfo extends BaseFormInfo {
    type: 'number';
    minimum?: number;
    maximum?: number;
    step?: number;
    default?: number;
}

/** @public */
export interface DropdownFormInfo extends BaseFormInfo {
    type: 'dropdown';
    choices: string[];
    default?: string;
}

/** @public */
export interface RadioFormInfo extends BaseFormInfo {
    type: 'radio';
    choices: string[];
    default?: string;
}

/** @public */
export interface ColorFormInfo extends BaseFormInfo {
    type: 'color';
    default?: string;
}

export type FormInfo = CheckboxFormInfo | SliderFormInfo | TextFormInfo | TextareaFormInfo | NumberFormInfo | DropdownFormInfo | RadioFormInfo | ColorFormInfo;

class ExtensionForms {
    #name = $state<string>();
    readonly #forms = new SvelteMap<string, FormInfo>();

    constructor(name: string, forms: Record<string, FormInfo>) {
        this.#name = name;
        this.#forms = new SvelteMap<string, FormInfo>(Object.entries(forms));
    }

    get name(): string {
        return this.#name;
    }
    get forms(): ReadonlyMap<string, FormInfo> {
        return this.#forms;
    }
    set name(val: string) {
        this.#name = val;
    }
    set forms(forms: Record<string, FormInfo>) {
        this.#forms.clear();
        for (const [key, value] of Object.entries(forms)) {
            this.setForms(key, value);
        }
    }
    setForms(key: string, val: FormInfo) {
        this.#forms.set(key, val);
    }
}

class OptionManager {
    readonly #opts = new SvelteMap<string, any>();
    readonly #forms = new SvelteMap<string, FormInfo>();
    readonly #extForms = new SvelteMap<string, ExtensionForms>();

    get opts(): ReadonlyMap<string, any> {
        return this.#opts;
    }
    get forms(): ReadonlyMap<string, FormInfo> {
        return this.#forms;
    }
    get extForms(): ReadonlyMap<string, ExtensionForms> {
        return this.#extForms;
    }

    set opts(opts: Record<string, any>) {
        this.#opts.clear();
        for (const [key, value] of Object.entries(opts)) {
            this.setOpts(key, value);
        }
    }
    setOpts(key: string, val: any) {
        this.#opts.set(key, val);
    }
    set forms(forms: Record<string, FormInfo>) {
        this.#forms.clear();
        for (const [key, value] of Object.entries(forms)) {
            this.setForms(key, value);
        }
    }
    setForms(key: string, val: FormInfo) {
        this.#forms.set(key, val);
    }
    set extForms(extForms: Record<string, { name: string; forms: Record<string, FormInfo> }>) {
        this.#extForms.clear();
        for (const [key, extForm] of Object.entries(extForms)) {
            this.setExtForms(key, new ExtensionForms(extForm.name, extForm.forms));
        }
    }
    setExtForms(key: string, val: ExtensionForms) {
        this.#extForms.set(key, val);
    }

    getOptionValue<T>(key: string): T {
        const value = this.#opts.get(key);
        if (value !== undefined) {
            return value as T;
        }
        const formInfo = this.#forms.get(key);
        if (formInfo?.default !== undefined) {
            return formInfo.default as T;
        }
        return undefined as T;
    }

    /**
     * Set the value for an option key and sync to globalThis.opts
     */
    setOptionValue(key: string, value: unknown): void {
        this.#opts.set(key, value);
        globalThis.opts = { ...globalThis.opts, ...Object.fromEntries(this.#opts) };
    }
}

export const optionManager = new OptionManager();
