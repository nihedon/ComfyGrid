import { EditorSelection, type Text } from '@codemirror/state';
import type { Command, KeyBinding } from '@codemirror/view';

const WORD_PRECISION = 0.1;
const LORA_PRECISION = 0.05;
const WORD_WEIGHT_MATCHER = /^\((.*):(-?\d+(?:\.\d+)?)\)$/s;
const LORA_TAG_REGEX = /<((?:lora|lyco)):([^:>]+)(?::(-?\d*(?:\.\d+)?))?>/gi;

function formatWordWeight(value: number): string {
    const rounded = Math.round(value * 1000) / 1000;
    const str = String(rounded);
    return str.includes('.') ? str : `${str}.0`;
}

function formatLoraWeight(value: number): string {
    const rounded = Math.round(value * 100) / 100;
    const str = String(rounded);
    return str.includes('.') ? str : `${str}.0`;
}

interface LoraTagMatch {
    from: number;
    to: number;
    type: string;
    name: string;
    weight: number;
}

function findLoraTagAt(doc: Text, from: number, to: number): LoraTagMatch | null {
    const line = doc.lineAt(from);
    const lineText = line.text;
    const lineStart = line.from;

    LORA_TAG_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = LORA_TAG_REGEX.exec(lineText)) !== null) {
        const tagStart = lineStart + match.index;
        const tagEnd = tagStart + match[0].length;

        const isInside = from === to ? from >= tagStart && from <= tagEnd : from < tagEnd && to > tagStart;

        if (isInside) {
            const rawWeight = match[3];
            const parsedWeight = rawWeight !== undefined && rawWeight !== '' ? Number.parseFloat(rawWeight) : 1.0;
            const weight = Number.isNaN(parsedWeight) ? 1.0 : parsedWeight;

            return {
                from: tagStart,
                to: tagEnd,
                type: match[1],
                name: match[2],
                weight,
            };
        }
    }

    return null;
}

function modifyWordWeight(text: string, isPlus: boolean): { newText: string; offsetDiff: number } | null {
    const trimmed = text.trim();

    const match = WORD_WEIGHT_MATCHER.exec(trimmed);
    if (match) {
        const inner = match[1];
        const weight = Number.parseFloat(match[2]);
        let newWeight = isPlus ? weight + WORD_PRECISION : weight - WORD_PRECISION;
        newWeight = Math.round(newWeight * 1000) / 1000;

        if (Math.abs(newWeight - 1.0) < 1e-9) {
            return { newText: inner, offsetDiff: inner.length - text.length };
        }

        const newText = `(${inner}:${formatWordWeight(newWeight)})`;
        return { newText, offsetDiff: newText.length - text.length };
    }

    const initialWeight = isPlus ? 1.0 + WORD_PRECISION : 1.0 - WORD_PRECISION;
    const newText = `(${trimmed}:${formatWordWeight(initialWeight)})`;
    return { newText, offsetDiff: newText.length - text.length };
}

function findWordAttentionRange(doc: Text, from: number, to: number): { from: number; to: number } | null {
    if (from !== to) {
        return { from, to };
    }

    const docLength = doc.length;
    let depth = 0;
    let start = from;

    while (start > 0) {
        const prevChar = doc.sliceString(start - 1, start);
        const prevPrevChar = start > 1 ? doc.sliceString(start - 2, start - 1) : '';
        if (prevChar === '(' && prevPrevChar !== '\\') {
            depth++;
            break;
        }
        if (prevChar === ')' && prevPrevChar !== '\\') {
            break;
        }
        start--;
    }

    if (depth > 0) {
        let end = from;
        while (end < docLength) {
            const char = doc.sliceString(end, end + 1);
            const prevChar = end > 0 ? doc.sliceString(end - 1, end) : '';
            if (char === ')' && prevChar !== '\\') {
                end++;
                return { from: start - 1, to: end };
            }
            end++;
        }
    }

    const delimiters = ',\\/!?%^*;:{}=`~()[]|\t\r\n ';
    let wStart = from;
    let wEnd = to;

    while (wStart > 0 && !delimiters.includes(doc.sliceString(wStart - 1, wStart))) {
        wStart--;
    }
    while (wEnd < docLength && !delimiters.includes(doc.sliceString(wEnd, wEnd + 1))) {
        wEnd++;
    }

    if (wStart < wEnd) {
        return { from: wStart, to: wEnd };
    }

    return null;
}

function adjustAttention(view: Parameters<Command>[0], isPlus: boolean): boolean {
    const { doc } = view.state;
    let anyChanged = false;

    const tr = view.state.changeByRange((range) => {
        const from = range.from;
        const to = range.to;

        const loraMatch = findLoraTagAt(doc, from, to);
        if (loraMatch) {
            anyChanged = true;
            let newWeight = isPlus ? loraMatch.weight + LORA_PRECISION : loraMatch.weight - LORA_PRECISION;
            newWeight = Math.round(newWeight * 100) / 100;

            const newText = `<${loraMatch.type}:${loraMatch.name}:${formatLoraWeight(newWeight)}>`;
            return {
                changes: { from: loraMatch.from, to: loraMatch.to, insert: newText },
                range: EditorSelection.range(loraMatch.from, loraMatch.from + newText.length),
            };
        }

        const wordRange = findWordAttentionRange(doc, from, to);
        if (!wordRange) {
            return { range };
        }

        const targetText = doc.sliceString(wordRange.from, wordRange.to);
        const result = modifyWordWeight(targetText, isPlus);
        if (!result) {
            return { range };
        }

        anyChanged = true;
        return {
            changes: { from: wordRange.from, to: wordRange.to, insert: result.newText },
            range: EditorSelection.range(wordRange.from, wordRange.from + result.newText.length),
        };
    });

    if (anyChanged) {
        view.dispatch(tr);
        return true;
    }

    return false;
}

export const incrementAttention: Command = (view) => adjustAttention(view, true);
export const decrementAttention: Command = (view) => adjustAttention(view, false);

export const promptAttentionKeymap: KeyBinding[] = [
    { key: 'Ctrl-ArrowUp', run: incrementAttention },
    { key: 'Ctrl-ArrowDown', run: decrementAttention },
    { key: 'Mod-ArrowUp', run: incrementAttention },
    { key: 'Mod-ArrowDown', run: decrementAttention },
];
