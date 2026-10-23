import { isolateHistory } from '@codemirror/commands';
import { EditorSelection, type Transaction } from '@codemirror/state';
import { type EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

type CompositionRange = { from: number; to: number; original: string; backwards: boolean };
type Composition = {
    ranges: CompositionRange[];
    mainIndex: number;
    ended: boolean;
    cancelled: boolean;
    data: string;
    changed: boolean;
};

class MultiSelectionIme {
    private composition: Composition | undefined;
    private timer: ReturnType<typeof setTimeout> | undefined;

    constructor(private readonly view: EditorView) {}

    start() {
        this.finish();
        this.clearTimer();
        this.composition = undefined;
        const { state } = this.view;
        if (state.readOnly || state.selection.ranges.length < 2) return;
        this.composition = {
            ranges: state.selection.ranges.map((range) => ({
                from: range.from,
                to: range.to,
                original: state.sliceDoc(range.from, range.to),
                backwards: range.anchor > range.head,
            })),
            mainIndex: state.selection.mainIndex,
            ended: false,
            cancelled: false,
            data: '',
            changed: false,
        };
    }

    end(data: string) {
        if (!this.composition) return;
        this.composition.ended = true;
        this.composition.cancelled = data === '';
        this.composition.data = data;
        // Let CodeMirror flush the final DOM input before reading the committed text.
        this.schedule();
    }

    update(update: ViewUpdate) {
        for (const transaction of update.transactions) {
            if (!this.composition) break;
            this.track(transaction);
        }
        if (this.composition?.ended && update.docChanged) this.schedule();
    }

    private track(transaction: Transaction) {
        const composition = this.composition!;
        if (!transaction.docChanged) {
            if (transaction.isUserEvent('select.pointer')) this.destroy();
            return;
        }
        if (!transaction.isUserEvent('input.type.compose') && !(composition.ended && transaction.isUserEvent('input.type'))) {
            this.destroy();
            return;
        }

        const touched = new Set<number>();
        let outside = false;
        transaction.changes.iterChangedRanges((from, to) => {
            const main = composition.ranges[composition.mainIndex];
            const owner =
                from >= main.from && to <= main.to ? composition.mainIndex : composition.ranges.findIndex((range) => from >= range.from && to <= range.to);
            if (owner < 0) outside = true;
            else touched.add(owner);
        }, true);
        if (outside) {
            this.destroy();
            return;
        }

        composition.changed ||= touched.has(composition.mainIndex);
        for (const [index, range] of composition.ranges.entries()) {
            const ownsChange = touched.has(index);
            const from = transaction.changes.mapPos(range.from, ownsChange ? -1 : 1);
            const to = transaction.changes.mapPos(range.to, ownsChange ? 1 : -1);
            range.from = from;
            range.to = Math.max(from, to);
        }
    }

    finish() {
        const composition = this.composition;
        if (!composition?.ended || this.view.compositionStarted) return;
        this.clearTimer();
        this.composition = undefined;
        const { state } = this.view;
        if (state.readOnly || !composition.changed) return;

        const main = composition.ranges[composition.mainIndex];
        const committed = state.sliceDoc(main.from, main.to);
        const replacements = composition.ranges.map((range) => (composition.cancelled ? range.original : committed));
        const changed = composition.ranges.map((range, index) => state.sliceDoc(range.from, range.to) !== replacements[index]);
        const changes = state.changes(
            composition.ranges.flatMap((range, index) => {
                const insert = replacements[index];
                return changed[index] ? [{ from: range.from, to: range.to, insert }] : [];
            }),
        );
        if (changes.empty && !composition.cancelled) return;

        const ranges = composition.ranges.map((range, index) => {
            const start = changes.mapPos(range.from, changed[index] ? -1 : 1);
            const end = start + state.toText(replacements[index]).length;
            if (!composition.cancelled) return EditorSelection.cursor(end);
            return EditorSelection.range(range.backwards ? end : start, range.backwards ? start : end);
        });
        this.view.dispatch({
            changes,
            selection: EditorSelection.create(ranges, composition.mainIndex),
            userEvent: 'input.type.compose',
            annotations: isolateHistory.of('after'),
        });
    }

    beforeInput(event: InputEvent) {
        if (this.composition?.ended && event.data === this.composition.data && event.inputType === 'insertText') return;
        if (!event.isComposing && event.inputType !== 'insertCompositionText' && event.inputType !== 'insertFromComposition') this.finish();
    }

    private schedule() {
        this.clearTimer();
        this.timer = setTimeout(() => {
            this.timer = undefined;
            this.finish();
        }, 20);
    }

    private clearTimer() {
        if (this.timer !== undefined) clearTimeout(this.timer);
        this.timer = undefined;
    }

    destroy() {
        this.clearTimer();
        this.composition = undefined;
    }
}

export const multiSelectionImePlugin = ViewPlugin.fromClass(MultiSelectionIme, {
    eventObservers: {
        compositionstart() {
            this.start();
        },
        compositionend(event) {
            this.end(event.data);
        },
        beforeinput(event) {
            this.beforeInput(event);
        },
        blur() {
            this.finish();
        },
    },
});
