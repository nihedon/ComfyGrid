import { RangeSetBuilder, StateField, type Text } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';

function highlightSegments(doc: Text): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    let index = 0;
    for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber++) {
        const line = doc.line(lineNumber);
        const delimiters = /[,.\u3001\u3002\uff0c\uff0e]/g;
        let start = 0;
        const add = (end: number) => {
            if (end > start) {
                builder.add(
                    line.from + start,
                    line.from + end,
                    Decoration.mark({
                        class: 'cm-text-segment',
                        attributes: { style: `color: oklch(var(--prompt-word-l, 0.25) var(--prompt-word-c, 0.4) ${(index * 137.508) % 360}deg)` },
                    }),
                );
            }
        };
        for (const match of line.text.matchAll(delimiters)) {
            add(match.index);
            start = match.index + 1;
            index++;
        }
        add(line.length);
        index++;
    }
    return builder.finish();
}

export const segmentHighlighter = StateField.define<DecorationSet>({
    create: (state) => highlightSegments(state.doc),
    update: (decorations, transaction) => (transaction.docChanged ? highlightSegments(transaction.newDoc) : decorations),
    provide: (field) => EditorView.decorations.from(field),
});
