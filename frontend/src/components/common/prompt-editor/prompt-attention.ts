import { EditorSelection } from '@codemirror/state';
import type { Command, KeyBinding } from '@codemirror/view';

const PRECISION = 0.1;
const WEIGHT_MATCHER = /^\((.*):(-?\d+(?:\.\d+)?)\)$/s;

function formatWeight(value: number): string {
    const rounded = Math.round(value * 1000) / 1000;
    const str = String(rounded);
    return str.includes('.') ? str : `${str}.0`;
}

function modifyWeight(text: string, isPlus: boolean): { newText: string; offsetDiff: number } | null {
    const trimmed = text.trim();

    // Match (word:weight)
    const match = WEIGHT_MATCHER.exec(trimmed);
    if (match) {
        const inner = match[1];
        const weight = Number.parseFloat(match[2]);
        let newWeight = isPlus ? weight + PRECISION : weight - PRECISION;
        newWeight = Math.round(newWeight * 1000) / 1000;

        if (Math.abs(newWeight - 1.0) < 1e-9) {
            // If weight becomes 1.0, unwrap to inner text
            return { newText: inner, offsetDiff: inner.length - text.length };
        }

        const newText = `(${inner}:${formatWeight(newWeight)})`;
        return { newText, offsetDiff: newText.length - text.length };
    }

    // Wrap word in (word:1.1) or (word:0.9)
    const initialWeight = isPlus ? 1.0 + PRECISION : 1.0 - PRECISION;
    const newText = `(${trimmed}:${formatWeight(initialWeight)})`;
    return { newText, offsetDiff: newText.length - text.length };
}

export const incrementAttention: Command = (view) => {
    const { state } = view;
    const { selection } = state;
    const main = selection.main;

    let from = main.from;
    let to = main.to;
    const doc = state.doc.toString();

    // If no selection, expand to word or surrounding bracket
    if (from === to) {
        // Check if within (word:weight)
        let depth = 0;
        let start = from;
        while (start > 0) {
            if (doc[start - 1] === '(' && (start - 1 === 0 || doc[start - 2] !== '\\')) {
                depth++;
                break;
            }
            if (doc[start - 1] === ')' && (start - 1 === 0 || doc[start - 2] !== '\\')) {
                break;
            }
            start--;
        }

        if (depth > 0) {
            let end = from;
            while (end < doc.length) {
                if (doc[end] === ')' && (end === 0 || doc[end - 1] !== '\\')) {
                    end++;
                    from = start - 1;
                    to = end;
                    break;
                }
                end++;
            }
        } else {
            // Expand to current word
            const delimiters = ',\\/!?%^*;:{}=`~()[]|\t\r\n ';
            let wStart = from;
            let wEnd = to;
            while (wStart > 0 && !delimiters.includes(doc[wStart - 1])) {
                wStart--;
            }
            while (wEnd < doc.length && !delimiters.includes(doc[wEnd])) {
                wEnd++;
            }
            if (wStart < wEnd) {
                from = wStart;
                to = wEnd;
            }
        }
    }

    if (from === to) return false;

    const targetText = doc.slice(from, to);
    const result = modifyWeight(targetText, true);
    if (!result) return false;

    view.dispatch({
        changes: { from, to, insert: result.newText },
        selection: EditorSelection.single(from, from + result.newText.length),
    });

    return true;
};

export const decrementAttention: Command = (view) => {
    const { state } = view;
    const { selection } = state;
    const main = selection.main;

    let from = main.from;
    let to = main.to;
    const doc = state.doc.toString();

    if (from === to) {
        let depth = 0;
        let start = from;
        while (start > 0) {
            if (doc[start - 1] === '(' && (start - 1 === 0 || doc[start - 2] !== '\\')) {
                depth++;
                break;
            }
            if (doc[start - 1] === ')' && (start - 1 === 0 || doc[start - 2] !== '\\')) {
                break;
            }
            start--;
        }

        if (depth > 0) {
            let end = from;
            while (end < doc.length) {
                if (doc[end] === ')' && (end === 0 || doc[end - 1] !== '\\')) {
                    end++;
                    from = start - 1;
                    to = end;
                    break;
                }
                end++;
            }
        } else {
            const delimiters = ',\\/!?%^*;:{}=`~()[]|\t\r\n ';
            let wStart = from;
            let wEnd = to;
            while (wStart > 0 && !delimiters.includes(doc[wStart - 1])) {
                wStart--;
            }
            while (wEnd < doc.length && !delimiters.includes(doc[wEnd])) {
                wEnd++;
            }
            if (wStart < wEnd) {
                from = wStart;
                to = wEnd;
            }
        }
    }

    if (from === to) return false;

    const targetText = doc.slice(from, to);
    const result = modifyWeight(targetText, false);
    if (!result) return false;

    view.dispatch({
        changes: { from, to, insert: result.newText },
        selection: EditorSelection.single(from, from + result.newText.length),
    });

    return true;
};

export const promptAttentionKeymap: KeyBinding[] = [
    { key: 'Ctrl-ArrowUp', run: incrementAttention },
    { key: 'Ctrl-ArrowDown', run: decrementAttention },
    { key: 'Mod-ArrowUp', run: incrementAttention },
    { key: 'Mod-ArrowDown', run: decrementAttention },
];
