import {
    type Completion,
    type CompletionContext,
    type CompletionResult,
    type CompletionSource,
    acceptCompletion,
    autocompletion,
    completionStatus,
    selectedCompletion,
    startCompletion,
} from '@codemirror/autocomplete';
import { deleteCharBackward, deleteCharForward } from '@codemirror/commands';
import { EditorSelection, type Extension, Prec, SelectionRange } from '@codemirror/state';
import { Direction, EditorView, ViewPlugin, type ViewUpdate, keymap } from '@codemirror/view';
import { appState } from '@/states/app-state.svelte';
import type { Model } from '@/states/storage-state.svelte';
import { updatePromptState } from './parsers/prompt-parser';
import { ensurePromptPilotModelsLoaded, getActiveTagSource } from './services/loader-service';
import { searchLora } from './services/lora-service';
import { OnlineTagSearch } from './services/online-search';
import { fetchTagsFromDanbooruApi, getTagModel, searchTag } from './services/tag-service';
import './styles/completion.scss';
import { promptRegion, tagInsertion } from './tag-insertion';
import type { ItemProps, PilotCompletion } from './types';

const CATEGORY_TABS = [
    { id: 'all', label: 'ALL' },
    { id: '0', label: 'Gen' },
    { id: '1', label: 'Art' },
    { id: '3', label: 'Copy' },
    { id: '4', label: 'Chara' },
    { id: '5', label: 'Meta' },
];

const DANBOORU_ICON_URL = '/comfygrid/icons/danbooru.donmai.us.favicon.png';
const E621_ICON_URL = '/comfygrid/icons/e621.net.favicon.png';

const optionModels = new WeakMap<HTMLElement, Model>();
const popoverOwners = new WeakMap<EditorView, HTMLElement>();
const tagSetCache = new Map<string, Set<string>>();
const onlineSearch = new OnlineTagSearch((query, signal) => fetchTagsFromDanbooruApi(query, 50, undefined, signal));

function formatPostCount(count: number): string {
    if (!count) return '';
    if (count >= 1_000_000) {
        return `${(count / 1_000_000).toFixed(1)}M`;
    }
    if (count >= 1_000) {
        return `${(count / 1_000).toFixed(1)}k`;
    }
    return String(count);
}

function escapeParentheses(str: string): string {
    return str.replaceAll('(', String.raw`\(`).replaceAll(')', String.raw`\)`);
}

function parseTagSet(rawConfig: string | undefined): Set<string> {
    const key = rawConfig ?? '';
    const cached = tagSetCache.get(key);
    if (cached) return cached;
    const tags = new Set<string>();
    key.split(/[\n,]/).forEach((tag) => {
        const normalized = tag.trim().replaceAll('_', ' ').toLowerCase();
        if (normalized) {
            tags.add(normalized);
        }
    });
    if (tagSetCache.size >= 10) tagSetCache.delete(tagSetCache.keys().next().value!);
    tagSetCache.set(key, tags);
    return tags;
}

function formatTagDelimiter(tag: string, inputtingString: string, delimiter: string, alwaysUnderscoreSet: Set<string>, alwaysSpaceSet: Set<string>): string {
    const normalized = tag.trim().replaceAll('_', ' ').toLowerCase();

    if (alwaysSpaceSet.has(normalized)) {
        return tag.replaceAll('_', ' ');
    }
    if (alwaysUnderscoreSet.has(normalized)) {
        return tag.replaceAll(' ', '_');
    }

    if (delimiter === 'underscore') {
        return tag.replaceAll(' ', '_');
    }
    if (delimiter === 'space') {
        return tag.replaceAll('_', ' ');
    }

    const isUnderscoreInput = inputtingString.includes('_');
    return isUnderscoreInput ? tag.replaceAll(' ', '_') : tag.replaceAll('_', ' ');
}

function createCompletionItem(
    item: ItemProps,
    inputtingString: string,
    delimiter: string,
    alwaysUnderscoreSet: Set<string>,
    alwaysSpaceSet: Set<string>,
): PilotCompletion {
    const rawTag = item.isOfficial || !item.consequentTagModel ? item.value : item.consequentTagModel.value;
    const isLora = item.category === 'lora';
    const isArtist = String(item.category) === '1';
    const postCountFormatted = formatPostCount(item.postCount || item.useCount);

    const formattedTag = isLora ? rawTag : formatTagDelimiter(rawTag, inputtingString, delimiter, alwaysUnderscoreSet, alwaysSpaceSet);

    let baseTag = escapeParentheses(formattedTag);
    if (isArtist && !baseTag.startsWith('@')) {
        baseTag = `@${baseTag}`;
    }

    const insertText = isLora ? `${rawTag}:1.0>` : baseTag;

    const catClass = isLora ? 'cat-lora' : `cat-${item.category ?? '0'}`;
    const sourceClass = item.source ? `source-${item.source}` : '';

    return {
        label: item.value,
        displayLabel: item.consequentTagModel ? `${item.value} → ${item.consequentTagModel.value}` : item.value,
        type: `${catClass} ${sourceClass}`.trim(),
        detail: postCountFormatted,
        source: item.source,
        sources: item.sources,
        model: item.model,
        apply: (view, _completion, fromPos, toPos) => {
            const ui = view.plugin(tabSyncPlugin);
            if (ui) ui.category = 'all';
            if (appState.popoverState.visible) {
                appState.popoverState.hidePopover();
            }

            const replaceLength = toPos - fromPos;
            const tr = view.state.changeByRange((range) => {
                let startPos = range.empty ? Math.max(0, range.from - replaceLength) : range.from;
                let endPos = range.to;

                if (isLora) {
                    const nextChar = view.state.doc.sliceString(endPos, endPos + 1);
                    if (nextChar === '>') {
                        endPos = endPos + 1;
                    }
                } else if (isArtist) {
                    if (startPos > 0 && view.state.doc.sliceString(startPos - 1, startPos) === '@') {
                        startPos = startPos - 1;
                    }
                }

                if (!isLora) {
                    const region = promptRegion(view.state, range.to);
                    if (region.formatSeparators) {
                        startPos = Math.max(region.from, startPos);
                        const text = view.state.doc.sliceString(region.from, region.to);
                        const { insertionInfo } = updatePromptState(text, range.to - region.from);
                        const change = tagInsertion(
                            text,
                            startPos - region.from,
                            endPos - region.from,
                            insertText,
                            appState.optionState.get('ComfyGrid.prompt_pilot.append_comma') === true,
                            insertionInfo.needPrependComma,
                            insertionInfo.needPrependSpace,
                            view.state.selection.ranges.filter((other) => other !== range).map((other) => other.to - region.from),
                        );
                        return {
                            changes: { from: region.from + change.from, to: region.from + change.to, insert: change.insert },
                            range: EditorSelection.cursor(region.from + change.cursor),
                        };
                    }
                }

                return {
                    changes: { from: startPos, to: endPos, insert: insertText },
                    range: EditorSelection.cursor(startPos + insertText.length),
                };
            });

            view.dispatch({
                ...tr,
                userEvent: 'input.complete',
            });
        },
    };
}

function applyCategoryFilter(tooltip: HTMLElement, categoryId: string): void {
    if (tooltip.dataset.activeCategory !== categoryId) tooltip.dataset.activeCategory = categoryId;

    // Update tab buttons selection state
    const tabs = tooltip.querySelectorAll<HTMLButtonElement>('.pilot-tab');
    tabs.forEach((tab) => {
        const isSelected = tab.dataset.cat === categoryId;
        tab.classList.toggle('selected', isSelected);
    });

    // Ensure selected item is updated to the first visible one if current is hidden
    const listItems = tooltip.querySelectorAll<HTMLLIElement>('li.pilot-option');
    let hasSelectedVisible = false;
    let firstVisibleItem: HTMLLIElement | null = null;

    listItems.forEach((li) => {
        const matchesCategory = categoryId === 'all' || li.classList.contains(`cat-${categoryId}`);
        if (matchesCategory) {
            if (!firstVisibleItem) firstVisibleItem = li;
            if (li.hasAttribute('aria-selected')) {
                hasSelectedVisible = true;
            }
        }
    });

    if (!hasSelectedVisible && firstVisibleItem) {
        listItems.forEach((li) => li.removeAttribute('aria-selected'));
        (firstVisibleItem as HTMLLIElement).setAttribute('aria-selected', 'true');
    }
}

function attachTooltipListeners(tooltip: HTMLElement, view: EditorView): void {
    if (tooltip.dataset.pilotListenersAttached) return;
    tooltip.dataset.pilotListenersAttached = 'true';

    tooltip.addEventListener('mouseover', (e) => {
        const li = (e.target as HTMLElement).closest<HTMLLIElement>('li.cat-lora');
        if (!li) {
            const nonLora = (e.target as HTMLElement).closest<HTMLLIElement>('li.pilot-option');
            if (nonLora && appState.popoverState.visible) {
                appState.popoverState.hidePopover();
            }
            return;
        }

        if (e.relatedTarget instanceof Node && li.contains(e.relatedTarget)) return;
        const marker = li.querySelector<HTMLElement>('[data-pilot-model]');
        showLoraPopover(view, tooltip, marker ? optionModels.get(marker) : undefined);
    });

    tooltip.addEventListener('mouseleave', () => {
        view.plugin(tabSyncPlugin)?.schedule();
    });
}

function hideOwnPopover(view: EditorView) {
    const target = appState.popoverState.targetElement;
    if (appState.popoverState.visible && target && (view.dom.contains(target) || target === popoverOwners.get(view))) appState.popoverState.hidePopover();
    popoverOwners.delete(view);
}

function showLoraPopover(view: EditorView, tooltip: HTMLElement, model?: Model): void {
    if (model) {
        const showNsfw = Boolean(appState.optionState.get('ComfyGrid.ui.show_nsfw'));
        if (showNsfw || !model.nsfw) {
            popoverOwners.set(view, tooltip);
            if (!appState.popoverState.visible || appState.popoverState.model !== model || appState.popoverState.targetElement !== tooltip) {
                appState.popoverState.showModelPopover(tooltip, model, 'models');
            }
            return;
        }
    }
    hideOwnPopover(view);
}

function ensureTabBar(view: EditorView, category: string): void {
    const tooltip = view.dom.querySelector<HTMLElement>('.cm-tooltip-autocomplete');
    if (!tooltip) return;

    attachTooltipListeners(tooltip, view);

    let tabContainer = tooltip.querySelector<HTMLDivElement>('.pilot-tab-container');
    if (!tabContainer) {
        tabContainer = document.createElement('div');
        tabContainer.className = 'pilot-tab-container';

        // Prevent clicking inside tab container from blurring editor or closing autocomplete
        const stopAllEvents = (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
        };
        tabContainer.addEventListener('mousedown', stopAllEvents);
        tabContainer.addEventListener('pointerdown', stopAllEvents);
        tabContainer.addEventListener('click', stopAllEvents);

        CATEGORY_TABS.forEach((tab) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.cat = tab.id;
            btn.className = `pilot-tab group-${tab.id} ${category === tab.id ? 'selected' : ''}`;
            btn.textContent = tab.label;

            btn.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const ui = view.plugin(tabSyncPlugin);
                if (ui) ui.category = tab.id;
                applyCategoryFilter(tooltip, tab.id);
            });

            tabContainer!.appendChild(btn);
        });

        tooltip.insertBefore(tabContainer, tooltip.firstChild);
    }

    const hasLoraOption = tooltip.querySelector('li.cat-lora') !== null;
    if (hasLoraOption) {
        if (tabContainer.style.display !== 'none') tabContainer.style.display = 'none';
        delete tooltip.dataset.activeCategory;
    } else {
        if (tabContainer.style.display !== 'flex') tabContainer.style.display = 'flex';
        applyCategoryFilter(tooltip, category);
    }
}

const promptPilotSource: CompletionSource = async (context: CompletionContext): Promise<CompletionResult | null> => {
    const isEnabled = (appState.optionState.get('ComfyGrid.prompt_pilot.enabled') as boolean) ?? true;
    if (!isEnabled) return null;

    const isLoaded = await ensurePromptPilotModelsLoaded();
    if (!isLoaded || context.aborted) return null;

    const region = promptRegion(context.state, context.pos);
    const docText = context.state.doc.sliceString(region.from, region.to);
    const caret = context.pos - region.from;

    const { promptInfo, insertionInfo } = updatePromptState(docText, caret);

    if (insertionInfo.isMetaBlock || !promptInfo.inputtingString) {
        return null;
    }

    const activeWord = promptInfo.words[promptInfo.activeWordIndex];
    if (!activeWord) return null;

    const query = promptInfo.inputtingString;
    if (!query.startsWith('*') && context.view) onlineSearch.cancel(context.view);
    if (query.trim().length < 1) return null;

    const isLora = activeWord.type === 'lora';
    let items: ItemProps[];

    if (isLora) {
        items = searchLora(query);
    } else if (query.startsWith('*')) {
        const onlineQuery = query.substring(1).trim();
        if (onlineQuery.length < 1) {
            return {
                from: region.from + activeWord.position,
                options: [
                    {
                        label: 'Type keyword to search online tags (*...)',
                        type: 'pilot-notice',
                        apply: () => {},
                    },
                ],
                filter: false,
            };
        }

        const view = context.view;
        const found = onlineSearch.request(view ?? context, onlineQuery, () => {
            if (view?.hasFocus && view.state.doc === context.state.doc && view.state.selection.main.head === context.pos) {
                view.plugin(tabSyncPlugin)?.restartCompletion();
            }
        });
        if (!found) {
            return {
                from: region.from + activeWord.position,
                options: [
                    {
                        label: `Searching online tags for "*${onlineQuery}"...`,
                        type: 'pilot-notice',
                        apply: () => {},
                    },
                ],
                filter: false,
            };
        }
        items = found;

        if (items.length === 0) {
            return {
                from: region.from + activeWord.position,
                options: [
                    {
                        label: `No online tags found for "*${onlineQuery}"`,
                        type: 'pilot-notice',
                        apply: () => {},
                    },
                ],
                filter: false,
            };
        }
    } else if (query.startsWith('@')) {
        const artistQuery = query.substring(1).trim();
        if (artistQuery.length < 1) return null;
        items = searchTag(artistQuery, undefined, '1');
    } else {
        // Category tabs reuse these suggestions without issuing another search.
        items = searchTag(query);
    }

    if (items.length === 0) return null;

    const delimiter = (appState.optionState.get('ComfyGrid.prompt_pilot.tag_delimiter') as string) ?? 'auto';
    const alwaysUnderscoreSet = parseTagSet(appState.optionState.get('ComfyGrid.prompt_pilot.always_underscore_tags') as string);
    const alwaysSpaceSet = parseTagSet(appState.optionState.get('ComfyGrid.prompt_pilot.always_space_tags') as string);

    const from = region.from + activeWord.position;
    const options: Completion[] = items.map((item) => createCompletionItem(item, query, delimiter, alwaysUnderscoreSet, alwaysSpaceSet));

    return {
        from,
        options,
        filter: false,
    };
};

const tabSyncPlugin = ViewPlugin.fromClass(
    class {
        view: EditorView;
        wasActive = false;
        category = 'all';
        private frame: number | null = null;
        private completionFrame: number | null = null;
        private selected: Completion | null = null;
        private status: ReturnType<typeof completionStatus> = null;
        private readonly resize: ResizeObserver;
        private readonly visibility = () => {
            if (this.view.dom.ownerDocument.hidden) {
                onlineSearch.cancel(this.view);
                hideOwnPopover(this.view);
            } else this.schedule();
        };

        constructor(view: EditorView) {
            this.view = view;
            this.resize = new ResizeObserver(() => this.schedule());
            this.resize.observe(view.dom);
            view.dom.ownerDocument.addEventListener('visibilitychange', this.visibility);
        }

        schedule() {
            if (this.frame !== null) return;
            this.frame = requestAnimationFrame(() => {
                this.frame = null;
                if (
                    completionStatus(this.view.state) === null ||
                    !this.view.hasFocus ||
                    this.view.dom.ownerDocument.hidden ||
                    !this.view.dom.isConnected ||
                    !this.view.dom.getClientRects().length
                ) {
                    onlineSearch.cancel(this.view);
                    hideOwnPopover(this.view);
                    return;
                }
                ensureTabBar(this.view, this.category);
                this.view.requestMeasure({
                    key: this,
                    read: () => {
                        const tooltip = this.view.dom.querySelector<HTMLElement>('.cm-tooltip-autocomplete');
                        const rect = tooltip?.getBoundingClientRect();
                        return tooltip && rect?.width && rect.height ? tooltip : null;
                    },
                    write: (tooltip) => {
                        if (tooltip && this.view.hasFocus)
                            showLoraPopover(this.view, tooltip, (selectedCompletion(this.view.state) as PilotCompletion | null)?.model);
                        else hideOwnPopover(this.view);
                    },
                });
            });
        }

        restartCompletion() {
            if (this.completionFrame !== null) return;
            this.completionFrame = requestAnimationFrame(() => {
                this.completionFrame = null;
                if (this.view.hasFocus && this.view.dom.isConnected) startCompletion(this.view);
            });
        }

        update(update: ViewUpdate) {
            const status = completionStatus(update.state);
            const isActive = status !== null;
            const selected = selectedCompletion(update.state);
            if (update.docChanged || update.selectionSet || (update.focusChanged && !this.view.hasFocus)) onlineSearch.cancel(this.view);

            if (this.wasActive && !isActive) {
                if (this.completionFrame !== null) cancelAnimationFrame(this.completionFrame);
                this.completionFrame = null;
                this.category = 'all';
                hideOwnPopover(this.view);
                onlineSearch.cancel(this.view);
            }
            this.wasActive = isActive;

            if (
                isActive &&
                (selected !== this.selected ||
                    status !== this.status ||
                    update.docChanged ||
                    update.selectionSet ||
                    update.geometryChanged ||
                    update.focusChanged)
            )
                this.schedule();
            this.selected = selected;
            this.status = status;
        }

        destroy() {
            if (this.frame !== null) cancelAnimationFrame(this.frame);
            if (this.completionFrame !== null) cancelAnimationFrame(this.completionFrame);
            this.resize.disconnect();
            this.view.dom.ownerDocument.removeEventListener('visibilitychange', this.visibility);
            onlineSearch.cancel(this.view);
            hideOwnPopover(this.view);
        }
    },
);

function extractTagForWiki(rawTag: string): string {
    let clean = rawTag.replace(/^@/, '').trim();

    while ((clean.startsWith('(') && clean.endsWith(')')) || (clean.startsWith('[') && clean.endsWith(']')) || (clean.startsWith('{') && clean.endsWith('}'))) {
        clean = clean.slice(1, -1).trim();
    }

    clean = clean.replace(/:[-+]?(?:\d+(?:\.\d+)?|\.\d+)$/, '').trim();

    clean = clean
        .replaceAll(String.raw`\(`, '(')
        .replaceAll(String.raw`\)`, ')')
        .replaceAll(String.raw`\[`, '[')
        .replaceAll(String.raw`\]`, ']')
        .trim();

    return clean;
}

function openTagWiki(rawTag: string, preferredSite?: 'danbooru' | 'e621'): void {
    const cleanTag = extractTagForWiki(rawTag);
    if (!cleanTag) return;

    const spaceNormalized = cleanTag.replaceAll('_', ' ');
    const tagModel = getTagModel(spaceNormalized) || getTagModel(cleanTag);
    const resolvedTag = tagModel?.consequentTagModel?.value || tagModel?.value || spaceNormalized;
    const finalWikiQuery = resolvedTag.trim().replaceAll(' ', '_');

    let site = preferredSite;
    if (!site) {
        if (tagModel?.source === 'e621') {
            site = 'e621';
        } else if (tagModel?.source === 'danbooru') {
            site = 'danbooru';
        } else {
            const activeSource = getActiveTagSource();
            site = activeSource === 'e621.net' ? 'e621' : 'danbooru';
        }
    }

    if (site === 'e621') {
        window.open(`https://e621.net/wiki_pages/show_or_new?title=${encodeURIComponent(finalWikiQuery)}`, '_blank');
    } else {
        window.open(`https://danbooru.donmai.us/wiki_pages/${encodeURIComponent(finalWikiQuery)}`, '_blank');
    }
}

function acceptAndOpenWiki(view: EditorView): boolean {
    const selected = selectedCompletion(view.state) as PilotCompletion | null;
    if (!selected || selected.type === 'pilot-notice') return false;

    const isLora = selected.type === 'cat-lora';
    const tag = selected.label;
    const source = selected.source;
    const accepted = acceptCompletion(view);

    if (accepted && !isLora) {
        openTagWiki(tag, source === 'e621' ? 'e621' : undefined);
    }
    return accepted;
}

const ctrlClickWikiPlugin = EditorView.domEventHandlers({
    click(event, view) {
        if (!event.ctrlKey && !event.metaKey) return false;

        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos === null) return false;

        const text = view.state.doc.toString();
        const { promptInfo } = updatePromptState(text, pos);
        const activeWord = promptInfo.words[promptInfo.activeWordIndex];

        if (activeWord?.type === 'tag') {
            const rawValue = activeWord.value.trim();
            if (rawValue) {
                event.preventDefault();
                event.stopPropagation();
                openTagWiki(rawValue);
                return true;
            }
        }
        return false;
    },
});

function isLtrAtCursor(view: EditorView): boolean {
    return view.textDirectionAt(view.state.selection.main.head) === Direction.LTR;
}

function moveCaretWhileCompleting(view: EditorView, forward: boolean, byGroup = false): boolean {
    if (completionStatus(view.state) === null) return false;
    const range = view.state.selection.main;
    let newRange: SelectionRange;
    if (range.empty) {
        if (byGroup) {
            newRange = view.moveByGroup(range, forward);
        } else {
            newRange = view.moveByChar(range, forward);
        }
    } else {
        if (forward) {
            newRange = EditorSelection.cursor(range.to);
        } else {
            newRange = EditorSelection.cursor(range.from);
        }
    }
    if (newRange.eq(range)) return false;

    // Dispatching with userEvent: 'input.type' keeps the completion active without flicker
    view.dispatch({
        selection: newRange,
        scrollIntoView: true,
        userEvent: 'input.type',
    });
    return true;
}

const pasteCompletionPlugin = EditorView.updateListener.of((update) => {
    if (update.docChanged && update.transactions.some((tr) => tr.isUserEvent('input.paste'))) {
        update.view.plugin(tabSyncPlugin)?.restartCompletion();
    }
});

export function promptPilotCompletion(): Extension {
    return [
        tabSyncPlugin,
        ctrlClickWikiPlugin,
        pasteCompletionPlugin,
        Prec.highest(
            keymap.of([
                {
                    key: 'Tab',
                    run: acceptCompletion,
                },
                {
                    key: 'Shift-Tab',
                    run: acceptAndOpenWiki,
                },
                {
                    key: 'Shift-Enter',
                    run: acceptAndOpenWiki,
                },
                {
                    key: 'Backspace',
                    run: (view) => {
                        const handled = deleteCharBackward(view);
                        if (handled) {
                            startCompletion(view);
                        }
                        return handled;
                    },
                },
                {
                    key: 'Delete',
                    run: (view) => {
                        const handled = deleteCharForward(view);
                        if (handled) {
                            startCompletion(view);
                        }
                        return handled;
                    },
                },
                {
                    key: 'ArrowLeft',
                    run: (view) => moveCaretWhileCompleting(view, !isLtrAtCursor(view)),
                },
                {
                    key: 'ArrowRight',
                    run: (view) => moveCaretWhileCompleting(view, isLtrAtCursor(view)),
                },
                {
                    key: 'Mod-ArrowLeft',
                    run: (view) => moveCaretWhileCompleting(view, !isLtrAtCursor(view), true),
                },
                {
                    key: 'Mod-ArrowRight',
                    run: (view) => moveCaretWhileCompleting(view, isLtrAtCursor(view), true),
                },
            ]),
        ),
        autocompletion({
            override: [promptPilotSource],
            icons: false,
            activateOnTyping: true,
            // closeOnBlur: false,
            maxRenderedOptions: 60,
            defaultKeymap: true,
            optionClass: (completion) => `pilot-option ${completion.type || ''}`,
            addToOptions: [
                {
                    render: (completion) => {
                        if ((completion as PilotCompletion).model) {
                            const marker = document.createElement('span');
                            marker.hidden = true;
                            marker.dataset.pilotModel = '';
                            optionModels.set(marker, (completion as PilotCompletion).model!);
                            return marker;
                        }
                        if (completion.type === 'cat-lora' || completion.type === 'pilot-notice') return null;
                        const pilotComp = completion as PilotCompletion;
                        const source = pilotComp.source;
                        const tag = completion.label;

                        const container = document.createElement('span');
                        container.className = 'pilot-wiki-container';

                        const stopEvent = (e: Event) => {
                            e.preventDefault();
                            e.stopPropagation();
                        };

                        const createIconBtn = (site: 'danbooru' | 'e621', iconUrl: string, siteName: string) => {
                            const btn = document.createElement('span');
                            btn.className = `pilot-wiki-icon wiki-${site}`;
                            btn.title = `Open ${siteName} Wiki`;

                            const img = document.createElement('img');
                            img.src = iconUrl;
                            img.alt = siteName;
                            img.className = 'pilot-source-icon';
                            btn.appendChild(img);

                            btn.addEventListener('pointerdown', stopEvent);
                            btn.addEventListener('mousedown', stopEvent);
                            btn.addEventListener('click', (e) => {
                                stopEvent(e);
                                openTagWiki(tag, site);
                            });

                            return btn;
                        };

                        if (source === 'both') {
                            container.appendChild(createIconBtn('danbooru', DANBOORU_ICON_URL, 'Danbooru'));
                            container.appendChild(createIconBtn('e621', E621_ICON_URL, 'e621'));
                        } else if (source === 'e621') {
                            container.appendChild(createIconBtn('e621', E621_ICON_URL, 'e621'));
                        } else {
                            container.appendChild(createIconBtn('danbooru', DANBOORU_ICON_URL, 'Danbooru'));
                        }

                        return container;
                    },
                    position: 90,
                },
            ],
        }),
    ];
}
