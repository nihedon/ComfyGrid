import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

const OPEN_BRACKETS: Record<string, string> = {
    '(': ')',
    '[': ']',
    '{': '}',
    '<': '>',
};

const CLOSE_BRACKETS: Record<string, string> = {
    ')': '(',
    ']': '[',
    '}': '{',
    '>': '<',
};

const matchingMark = Decoration.mark({ class: 'cm-matchingBracket' });
const nonMatchingMark = Decoration.mark({ class: 'cm-nonmatchingBracket' });

function isEscaped(text: string, pos: number): boolean {
    let backslashCount = 0;
    for (let i = pos - 1; i >= 0; i--) {
        if (text[i] === '\\') {
            backslashCount++;
        } else {
            break;
        }
    }
    return backslashCount % 2 === 1;
}

function findMatchingBracket(text: string, bracketPos: number): { matchPos: number; isMatch: boolean } | null {
    const char = text[bracketPos];
    if (!char) return null;

    if (char in OPEN_BRACKETS) {
        const closeChar = OPEN_BRACKETS[char];
        let depth = 1;
        for (let i = bracketPos + 1; i < text.length; i++) {
            if (isEscaped(text, i)) continue;
            if (text[i] === char) {
                depth++;
            } else if (text[i] === closeChar) {
                depth--;
                if (depth === 0) {
                    return { matchPos: i, isMatch: true };
                }
            }
        }
        return { matchPos: -1, isMatch: false };
    }

    if (char in CLOSE_BRACKETS) {
        const openChar = CLOSE_BRACKETS[char];
        let depth = 1;
        for (let i = bracketPos - 1; i >= 0; i--) {
            if (isEscaped(text, i)) continue;
            if (text[i] === char) {
                depth++;
            } else if (text[i] === openChar) {
                depth--;
                if (depth === 0) {
                    return { matchPos: i, isMatch: true };
                }
            }
        }
        return { matchPos: -1, isMatch: false };
    }

    return null;
}

function buildBracketDecorations(view: EditorView): DecorationSet {
    const selection = view.state.selection.main;
    if (!selection.empty) {
        return Decoration.none;
    }

    const pos = selection.head;
    const text = view.state.doc.toString();
    const builder = new RangeSetBuilder<Decoration>();

    let targetPos = -1;
    if (pos > 0 && !isEscaped(text, pos - 1) && (text[pos - 1] in OPEN_BRACKETS || text[pos - 1] in CLOSE_BRACKETS)) {
        targetPos = pos - 1;
    } else if (pos < text.length && !isEscaped(text, pos) && (text[pos] in OPEN_BRACKETS || text[pos] in CLOSE_BRACKETS)) {
        targetPos = pos;
    }

    if (targetPos === -1) {
        return Decoration.none;
    }

    const matchResult = findMatchingBracket(text, targetPos);
    if (!matchResult) {
        return Decoration.none;
    }

    if (matchResult.isMatch) {
        const first = Math.min(targetPos, matchResult.matchPos);
        const second = Math.max(targetPos, matchResult.matchPos);
        builder.add(first, first + 1, matchingMark);
        builder.add(second, second + 1, matchingMark);
    } else {
        builder.add(targetPos, targetPos + 1, nonMatchingMark);
    }

    return builder.finish();
}

export const bracketMatchingPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = buildBracketDecorations(view);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || update.selectionSet) {
                this.decorations = buildBracketDecorations(update.view);
            }
        }
    },
    {
        decorations: (v) => v.decorations,
    },
);
