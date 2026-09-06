import { SearchQuery, closeSearchPanel, findNext, findPrevious, getSearchQuery, replaceAll, replaceNext, setSearchQuery } from '@codemirror/search';
import type { EditorView, Panel, ViewUpdate } from '@codemirror/view';

const ICONS = {
    arrowDown:
        '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-down"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>',
    arrowUp:
        '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-up"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>',
    replace:
        '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-replace"><path d="M14 4a1 1 0 0 1 1-1"/><path d="M15 10a1 1 0 0 1-1-1"/><path d="M21 4a1 1 0 0 0-1-1"/><path d="M21 9a1 1 0 0 1-1 1"/><path d="m3 7 3 3 3-3"/><path d="M6 10V5a2 2 0 0 1 2-2h2"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>',
    replaceAll:
        '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-replace-all"><path d="M14 14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1"/><path d="M14 4a1 1 0 0 1 1-1"/><path d="M15 10a1 1 0 0 1-1-1"/><path d="M19 14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1"/><path d="M21 4a1 1 0 0 0-1-1"/><path d="M21 9a1 1 0 0 1-1 1"/><path d="m3 7 3 3 3-3"/><path d="M6 10V5a2 2 0 0 1 2-2h2"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>',
    caseSensitive:
        '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-case-sensitive"><path d="m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16"/><path d="M22 9v7"/><path d="M3.304 13h6.392"/><circle cx="18.5" cy="12.5" r="3.5"/></svg>',
    wholeWord:
        '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-whole-word"><circle cx="7" cy="12" r="3"/><path d="M10 9v6"/><circle cx="17" cy="12" r="3"/><path d="M14 7v8"/><path d="M22 17v1c0 .5-.5 1-1 1H3c-.5 0-1-.5-1-1v-1"/></svg>',
    regex: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-regex"><path d="M17 3v10"/><path d="m12.67 5.5 8.66 5"/><path d="m12.67 10.5 8.66-5"/><path d="M9 17a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2z"/></svg>',
    close: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
};

export class CustomSearchPanel implements Panel {
    readonly dom: HTMLElement;
    readonly top = true;
    private readonly searchInput: HTMLInputElement;
    private readonly replaceInput: HTMLInputElement;
    private readonly caseCheckbox: HTMLInputElement;
    private readonly reCheckbox: HTMLInputElement;
    private readonly wordCheckbox: HTMLInputElement;
    private query: SearchQuery;

    constructor(private readonly view: EditorView) {
        this.query = getSearchQuery(view.state);

        this.dom = document.createElement('div');
        this.dom.className = 'cm-panel cm-custom-search-panel py-1 px-2 border-bottom position-relative';

        const searchRow = document.createElement('div');
        searchRow.className = 'search-row d-flex align-items-center gap-1 flex-wrap';

        this.searchInput = document.createElement('input');
        this.searchInput.type = 'text';
        this.searchInput.name = 'search';
        this.searchInput.placeholder = 'Search';
        this.searchInput.value = this.query.search;
        this.searchInput.className = 'form-control';
        this.searchInput.style.width = '180px';
        this.searchInput.setAttribute('main-field', 'true');
        this.searchInput.oninput = () => this.commit();
        this.searchInput.onkeydown = (e) => this.handleSearchKeydown(e);

        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'btn btn-sm btn-outline-secondary d-flex align-items-center justify-content-center px-2 py-0';
        nextBtn.innerHTML = ICONS.arrowDown;
        nextBtn.title = 'Find Next (Enter)';
        nextBtn.onclick = () => findNext(this.view);

        const prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'btn btn-sm btn-outline-secondary d-flex align-items-center justify-content-center px-2 py-0';
        prevBtn.innerHTML = ICONS.arrowUp;
        prevBtn.title = 'Find Previous (Shift+Enter)';
        prevBtn.onclick = () => findPrevious(this.view);

        const searchGroup = document.createElement('div');
        searchGroup.className = 'input-group input-group-sm w-auto';
        searchGroup.append(this.searchInput, nextBtn, prevBtn);

        const caseField = this.createToggleButton('case', 'Match Case', ICONS.caseSensitive, this.query.caseSensitive, (checked) => {
            this.commit({ caseSensitive: checked });
        });
        this.caseCheckbox = caseField.input;

        const wordField = this.createToggleButton('word', 'By Word', ICONS.wholeWord, this.query.wholeWord, (checked) => {
            this.commit({ wholeWord: checked });
        });
        this.wordCheckbox = wordField.input;

        const reField = this.createToggleButton('regexp', 'RegExp', ICONS.regex, this.query.regexp, (checked) => {
            this.commit({ regexp: checked });
        });
        this.reCheckbox = reField.input;

        const toggleGroup = document.createElement('div');
        toggleGroup.className = 'd-flex align-items-center gap-1';
        toggleGroup.append(...caseField.elements, ...wordField.elements, ...reField.elements);

        searchRow.append(searchGroup, toggleGroup);
        this.dom.append(searchRow);

        this.replaceInput = document.createElement('input');
        if (!view.state.readOnly) {
            const replaceRow = document.createElement('div');
            replaceRow.className = 'replace-row d-flex align-items-center gap-1 flex-wrap mt-1';

            this.replaceInput.type = 'text';
            this.replaceInput.name = 'replace';
            this.replaceInput.placeholder = 'Replace';
            this.replaceInput.value = this.query.replace;
            this.replaceInput.className = 'form-control';
            this.replaceInput.style.width = '180px';
            this.replaceInput.oninput = () => this.commit();
            this.replaceInput.onkeydown = (e) => this.handleReplaceKeydown(e);

            const replaceBtn = document.createElement('button');
            replaceBtn.type = 'button';
            replaceBtn.className = 'btn btn-sm btn-outline-secondary d-flex align-items-center justify-content-center px-2 py-0';
            replaceBtn.innerHTML = ICONS.replace;
            replaceBtn.title = 'Replace';
            replaceBtn.onclick = () => replaceNext(this.view);

            const replaceAllBtn = document.createElement('button');
            replaceAllBtn.type = 'button';
            replaceAllBtn.className = 'btn btn-sm btn-outline-secondary d-flex align-items-center justify-content-center px-2 py-0';
            replaceAllBtn.innerHTML = ICONS.replaceAll;
            replaceAllBtn.title = 'Replace All';
            replaceAllBtn.onclick = () => replaceAll(this.view);

            const replaceGroup = document.createElement('div');
            replaceGroup.className = 'input-group input-group-sm w-auto';
            replaceGroup.append(this.replaceInput, replaceBtn, replaceAllBtn);

            replaceRow.append(replaceGroup);
            this.dom.appendChild(replaceRow);
        }

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn btn-sm btn-icon border-0 position-absolute top-0 end-0 text-secondary';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.title = 'Close (Escape)';
        closeBtn.innerHTML = ICONS.close;
        closeBtn.onclick = () => closeSearchPanel(this.view);
        this.dom.append(closeBtn);

        this.dom.onkeydown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeSearchPanel(this.view);
            }
        };
    }

    mount(): void {
        this.searchInput.select();
    }

    update(update: ViewUpdate): void {
        for (const tr of update.transactions) {
            for (const effect of tr.effects) {
                if (effect.is(setSearchQuery) && !effect.value.eq(this.query)) {
                    this.setQuery(effect.value);
                }
            }
        }
    }

    private setQuery(query: SearchQuery): void {
        this.query = query;
        this.searchInput.value = query.search;
        this.replaceInput.value = query.replace;
        this.caseCheckbox.checked = query.caseSensitive;
        this.reCheckbox.checked = query.regexp;
        this.wordCheckbox.checked = query.wholeWord;
    }

    private commit(overrides?: Partial<{ caseSensitive: boolean; regexp: boolean; wholeWord: boolean }>): void {
        const query = new SearchQuery({
            search: this.searchInput.value,
            replace: this.replaceInput.value,
            caseSensitive: overrides?.caseSensitive ?? this.caseCheckbox.checked,
            regexp: overrides?.regexp ?? this.reCheckbox.checked,
            wholeWord: overrides?.wholeWord ?? this.wordCheckbox.checked,
        });
        if (!query.eq(this.query)) {
            this.query = query;
            this.view.dispatch({ effects: setSearchQuery.of(query) });
        }
    }

    private handleSearchKeydown(e: KeyboardEvent): void {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) {
                findPrevious(this.view);
            } else {
                findNext(this.view);
            }
        }
    }

    private handleReplaceKeydown(e: KeyboardEvent): void {
        if (e.key === 'Enter') {
            e.preventDefault();
            replaceNext(this.view);
        }
    }

    private createToggleButton(
        name: string,
        title: string,
        iconSvg: string,
        checked: boolean,
        onChange: (checked: boolean) => void,
    ): { elements: HTMLElement[]; input: HTMLInputElement; label: HTMLElement } {
        const uniqueId = `cm-search-${name}-${Math.random().toString(36).slice(2, 9)}`;

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'btn-check';
        input.id = uniqueId;
        input.autocomplete = 'off';
        input.checked = checked;
        input.onchange = () => onChange(input.checked);

        const label = document.createElement('label');
        label.className = 'btn btn-outline-secondary d-flex align-items-center justify-content-center p-1';
        label.htmlFor = uniqueId;
        label.title = title;
        label.innerHTML = iconSvg;

        return { elements: [input, label], input, label };
    }
}
