// =====================================================
// Constants and Types
import logger from '@/utils/logger';

// =====================================================
const KEYEDIT_DELIMITERS = '.,\\/!?%^*;:{}=`~()[]| ';
const KEYEDIT_WHITESPACE_DELIMITERS = ['\t', '\r', '\n'];
const KEYEDIT_PRECISION_ATTENTION = 0.1;
const KEYEDIT_PRECISION_EXTRA = 0.05;
const WEIGHT_EPSILON = 1e-9;

interface Selection {
    start: number;
    end: number;
}

interface ProcessResult {
    replacementText: string;
    replaceRange: Selection;
    newSelectionOffset: Selection;
}

// =====================================================
// Helper Functions for Selection
// =====================================================
function findCurrentWord(text: string, currentSelection: Selection): Selection | null {
    if (currentSelection.start !== currentSelection.end) return null;

    let selectionStart = currentSelection.start;
    let selectionEnd = currentSelection.end;

    const delimiters = KEYEDIT_DELIMITERS + KEYEDIT_WHITESPACE_DELIMITERS.join('');

    while (!delimiters.includes(text[selectionStart - 1]) && selectionStart > 0) {
        selectionStart--;
    }

    while (!delimiters.includes(text[selectionEnd]) && selectionEnd < text.length) {
        selectionEnd++;
    }

    while (text[selectionStart] === ' ' && selectionStart < selectionEnd) {
        selectionStart++;
    }
    while (text[selectionEnd - 1] === ' ' && selectionEnd > selectionStart) {
        selectionEnd--;
    }

    if (selectionStart === selectionEnd) {
        return null;
    }

    return { start: selectionStart, end: selectionEnd };
}

function findAttentionBlock(text: string, currentSelection: Selection, OPEN: string, CLOSE: string): Selection | null {
    if (currentSelection.start !== currentSelection.end) return null;

    const cursor = currentSelection.start;

    const before = text.substring(0, cursor);
    const openParenIndex = before.lastIndexOf(OPEN);
    if (openParenIndex === -1) return null;

    const lastCloserBeforeCursor = before.lastIndexOf(CLOSE);
    if (lastCloserBeforeCursor > openParenIndex) {
        return null;
    }

    const after = text.substring(cursor);
    const closeParenIndex = after.indexOf(CLOSE);
    if (closeParenIndex === -1) return null;

    const firstOpenerAfterCursor = after.indexOf(OPEN);
    if (firstOpenerAfterCursor !== -1 && firstOpenerAfterCursor < closeParenIndex) {
        return null;
    }

    const blockStart = openParenIndex + 1;
    const blockEnd = cursor + closeParenIndex;
    const blockContent = text.substring(blockStart, blockEnd);

    const selectionStart = blockStart;
    let selectionEnd = blockEnd;

    const colonIndex = blockContent.lastIndexOf(':');
    if (colonIndex !== -1 && /:-?[\d.]+$/.test(blockContent.substring(colonIndex))) {
        selectionEnd = blockStart + colonIndex;
    }

    return { start: selectionStart, end: selectionEnd };
}

// =====================================================
// Core Logic for Text Processing
// =====================================================
function processSelection(text: string, selection: Selection, isPlus: boolean): ProcessResult | null {
    const { start, end } = selection;
    const selectedText = text.substring(start, end);

    // 1. Determine surrounding characters and delta
    const startChar = start > 0 ? text[start - 1] : '';
    let closeCharacter = ')';
    let delta = KEYEDIT_PRECISION_ATTENTION;

    if (startChar === '<') {
        closeCharacter = '>';
        delta = KEYEDIT_PRECISION_EXTRA;
    }

    // 2. Handle weight increment/decrement: '(word:weight)' -> '(word:new_weight)'
    if (startChar === '(' || startChar === '<') {
        if (text[end] !== ':') {
            return null;
        }

        const weightPart = text.substring(end + 1);
        const endParenPos = weightPart.indexOf(closeCharacter);
        if (endParenPos === -1) return null;

        const weightString = weightPart.substring(0, endParenPos);
        let weight = Number.parseFloat(weightString);
        if (Number.isNaN(weight)) return null;

        weight += isPlus ? delta : -delta;
        weight = Number.parseFloat(weight.toPrecision(12));

        if (closeCharacter === ')' && Math.abs(weight - 1) < WEIGHT_EPSILON) {
            const replacementText = selectedText;
            const replaceRange = { start: start - 1, end: end + 1 + endParenPos + 1 };
            const newSelectionOffset = { start: 0, end: replacementText.length };

            return { replacementText, replaceRange, newSelectionOffset };
        } else {
            let strWeight = weight.toString();
            if (Number.isInteger(weight)) {
                strWeight += '.0';
            }

            const replacementText = strWeight;
            const replaceRange = { start: end + 1, end: end + 1 + endParenPos };
            const newSelectionOffset = {
                start: start - replaceRange.start,
                end: end - replaceRange.start,
            };

            return { replacementText, replaceRange, newSelectionOffset };
        }
    }

    // 3. Handle new weight application: 'word' -> '(word:1.0)'
    let newEnd = end;
    while (newEnd > start && text[newEnd - 1] === ' ') {
        newEnd--;
    }

    if (start === newEnd) {
        return null;
    }

    const initialWeight = isPlus ? 1.1 : 0.9;
    const trimmedSelectedText = text.substring(start, newEnd);
    const replacementText = `(${trimmedSelectedText}:${initialWeight.toFixed(1)})`;
    const replaceRange = { start: start, end: newEnd };
    const newSelectionOffset = {
        start: 1,
        end: trimmedSelectedText.length + 1,
    };

    return { replacementText, replaceRange, newSelectionOffset };
}

// =====================================================
// Main Exported Function
// =====================================================
export function keyupEditAttention(event: KeyboardEvent, target: HTMLTextAreaElement) {
    if (!(event.metaKey || event.ctrlKey)) return;

    const isPlus = event.key === 'ArrowUp';
    const isMinus = event.key === 'ArrowDown';
    if (!isPlus && !isMinus) return;

    event.preventDefault();

    const text = target.value;
    let selection: Selection = { start: target.selectionStart, end: target.selectionEnd };

    if (selection.start === selection.end) {
        let newSelection: Selection | null = null;

        newSelection = findAttentionBlock(text, selection, '<', '>');
        if (!newSelection) newSelection = findAttentionBlock(text, selection, '(', ')');
        if (!newSelection) newSelection = findAttentionBlock(text, selection, '[', ']');

        if (!newSelection) {
            newSelection = findCurrentWord(text, selection);
        }

        if (newSelection) {
            selection = newSelection;
            target.setSelectionRange(selection.start, selection.end);
        }
    }

    selection = { start: target.selectionStart, end: target.selectionEnd };

    const result = processSelection(text, selection, isPlus);

    if (result) {
        target.setSelectionRange(result.replaceRange.start, result.replaceRange.end);

        const success = document.execCommand('insertText', false, result.replacementText);

        if (success) {
            const newSelectionStart = result.replaceRange.start + result.newSelectionOffset.start;
            const newSelectionEnd = result.replaceRange.start + result.newSelectionOffset.end;

            target.setSelectionRange(newSelectionStart, newSelectionEnd);
        } else {
            logger.error('document.execCommand("insertText") failed.');
        }
    }
}
