import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';

export function promptRegion(state: EditorState, caret: number) {
    const tree = syntaxTree(state);
    if (tree.topNode.name === 'JsonText') {
        for (let node = tree.resolveInner(caret, -1); node; node = node.parent!) {
            if (node.name !== 'String' && node.name !== 'PropertyName') continue;
            const from = node.from + 1;
            const to = state.doc.sliceString(node.to - 1, node.to) === '"' ? node.to - 1 : node.to;
            if (caret >= from && caret <= to) return { from, to, formatSeparators: true };
        }
        return { from: 0, to: state.doc.length, formatSeparators: false };
    }
    return { from: 0, to: state.doc.length, formatSeparators: true };
}

export function tagInsertion(
    text: string,
    from: number,
    to: number,
    tag: string,
    appendComma: boolean,
    needPrependComma: boolean,
    needPrependSpace: boolean,
    completedEnds: readonly number[] = [],
) {
    // Include horizontal whitespace in the replacement, never the newline itself.
    while (from > 0 && /[ \t]/.test(text[from - 1])) from--;
    const before = text.slice(0, from);
    const previousEnd = before.trimEnd().length;
    const gap = before.slice(previousEnd);
    let prefix = '';
    if (gap.includes('\n')) {
        const previous = before.slice(0, previousEnd);
        const previousLine = previous.slice(previous.lastIndexOf('\n') + 1).trim();
        const needsComma = previous && !/[,.:|([{<]$/.test(previous) && !/^(BREAK|AND|ADDCOMM|ADDBASE|ADDCOL|ADDROW)$/.test(previousLine);
        // Another cursor may append this same separator in the current transaction.
        if (needsComma && !(appendComma && completedEnds.includes(previousEnd))) {
            from = previousEnd;
            prefix = ',' + gap.slice(0, gap.lastIndexOf('\n') + 1);
        }
    } else if (before.endsWith(',')) {
        prefix = ' ';
    } else if (before && needPrependComma) {
        prefix = ', ';
    } else if (before && needPrependSpace) {
        prefix = ' ';
    }

    let suffix = '';
    if (appendComma) {
        const after = text.slice(to);
        const existingComma = /^[ \t]*,/.exec(after);
        if (existingComma) {
            to += existingComma[0].length;
            suffix = ',';
        } else if (!after || /^\s/.test(after)) {
            suffix = ',';
        }
    }
    const insert = prefix + tag + suffix;
    return { from, to, insert, cursor: from + insert.length };
}
