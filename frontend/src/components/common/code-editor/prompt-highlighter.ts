import { RangeSetBuilder, StateEffect } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { getTagModel } from '@/features/prompt-pilot/services/tag-service';
import { appState } from '@/states/app-state.svelte';

export const reconfigureHighlightEffect = StateEffect.define<void>();

const NUMERIC_REGEXP = /\d/;
const WHITESPACE_REGEXP = /\s/;
const DELIMITER_REGEXP_1 = /[\s,)]/;
const DELIMITER_REGEXP_2 = /[\s(]/;
const IS_VALID_WEIGHT_NUMBER_REGEXP = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

interface TokenRange {
    from: number;
    to: number;
    type: 'word' | 'bracket' | 'weight' | 'comma' | 'escape' | 'error' | 'trailing-space' | 'other';
    wordIndex: number;
}

/**
 * Checks if a string is a valid numeric weight (e.g. 1.2, .2, 2., -0.5, etc.)
 */
function isValidWeightNumber(str: string): boolean {
    const trimmed = str.trim();
    if (!trimmed) return false;
    return IS_VALID_WEIGHT_NUMBER_REGEXP.test(trimmed);
}

/**
 * Parses prompt text into ranges for syntax highlighting.
 */
function parsePromptTokens(text: string): TokenRange[] {
    const tokens: TokenRange[] = [];
    let wordIndex = 0;

    function parseRange(start: number, end: number) {
        let i = start;

        while (i < end) {
            const prevI = i;
            const char = text[i];

            // 1. Full-width space is an error
            if (char === '\u3000') {
                tokens.push({ from: i, to: i + 1, type: 'error', wordIndex });
                i++;
                continue;
            }

            // 2. Handle ASCII whitespace (spaces, tabs) - mark trailing spaces at line/doc end
            if (char === ' ' || char === '\t') {
                const spaceStart = i;
                while (i < end && (text[i] === ' ' || text[i] === '\t')) {
                    i++;
                }
                if (i >= end || text[i] === '\n' || text[i] === '\r') {
                    tokens.push({ from: spaceStart, to: i, type: 'trailing-space', wordIndex });
                }
                continue;
            }

            // Handle comma (separator) - Error if not followed by whitespace or EOF
            if (char === ',') {
                const nextChar = i + 1 < end ? text[i + 1] : '';
                const isMissingSpace = nextChar && !WHITESPACE_REGEXP.test(nextChar);
                tokens.push({
                    from: i,
                    to: i + 1,
                    type: isMissingSpace ? 'error' : 'comma',
                    wordIndex,
                });
                wordIndex++;
                i++;
                continue;
            }

            // Handle period (.) - Allow decimal numbers like 1.2, but error if period is followed by non-whitespace
            if (char === '.') {
                const prevChar = i > 0 ? text[i - 1] : '';
                const nextChar = i + 1 < end ? text[i + 1] : '';
                const isDecimal =
                    (NUMERIC_REGEXP.test(prevChar) && NUMERIC_REGEXP.test(nextChar)) ||
                    (NUMERIC_REGEXP.test(prevChar) && (!nextChar || DELIMITER_REGEXP_1.test(nextChar))) ||
                    ((!prevChar || DELIMITER_REGEXP_2.test(prevChar)) && NUMERIC_REGEXP.test(nextChar));

                if (!isDecimal) {
                    const isMissingSpace = nextChar && !DELIMITER_REGEXP_1.test(nextChar);
                    tokens.push({
                        from: i,
                        to: i + 1,
                        type: isMissingSpace ? 'error' : 'comma',
                        wordIndex,
                    });
                    wordIndex++;
                    i++;
                    continue;
                }
            }

            // Handle newlines
            if (char === '\n' || char === '\r') {
                wordIndex++;
                i++;
                continue;
            }

            // Check for unescaped opening parenthesis '(' that might be a weight group: (word:weight)
            if (char === '(') {
                const groupStart = i;
                let depth = 1;
                let j = i + 1;
                let colonPos = -1;

                while (j < end) {
                    if (text[j] === '\\' && j + 1 < end) {
                        j += 2;
                        continue;
                    }
                    if (text[j] === '(') {
                        depth++;
                    } else if (text[j] === ')') {
                        depth--;
                        if (depth === 0) {
                            break;
                        }
                    } else if (depth === 1 && text[j] === ':') {
                        colonPos = j;
                    }
                    j++;
                }

                if (depth === 0 && colonPos !== -1) {
                    const weightStr = text.slice(colonPos + 1, j);
                    const isValid = isValidWeightNumber(weightStr);

                    tokens.push({ from: groupStart, to: groupStart + 1, type: 'bracket', wordIndex });

                    if (colonPos > groupStart + 1) {
                        parseRange(groupStart + 1, colonPos);
                    }

                    tokens.push(
                        {
                            from: colonPos,
                            to: j,
                            type: isValid ? 'weight' : 'error',
                            wordIndex,
                        },
                        { from: j, to: j + 1, type: 'bracket', wordIndex },
                    );

                    i = j + 1;
                    continue;
                }
            }

            // Normal word token until comma, newline, escape, unescaped bracket, full-width space, or non-decimal period
            const wordStart = i;
            if (text[i] === '(') {
                i++;
            }
            while (i < end) {
                const c = text[i];
                if (c === '\\' && i + 1 < end) {
                    i += 2;
                    continue;
                }
                if (c === '\\' || c === ',' || c === '\n' || c === '\r' || c === '(' || c === '\u3000') {
                    break;
                }
                if (c === '.') {
                    const prevChar = i > 0 ? text[i - 1] : '';
                    const nextChar = i + 1 < end ? text[i + 1] : '';
                    const isDecimal =
                        (NUMERIC_REGEXP.test(prevChar) && NUMERIC_REGEXP.test(nextChar)) ||
                        (NUMERIC_REGEXP.test(prevChar) && (!nextChar || DELIMITER_REGEXP_1.test(nextChar))) ||
                        ((!prevChar || DELIMITER_REGEXP_2.test(prevChar)) && NUMERIC_REGEXP.test(nextChar));
                    if (!isDecimal) {
                        break;
                    }
                }
                i++;
            }

            // Trim trailing whitespace from word span
            let wordEnd = i;
            while (wordEnd > wordStart && (text[wordEnd - 1] === ' ' || text[wordEnd - 1] === '\t')) {
                wordEnd--;
            }

            if (wordEnd > wordStart) {
                tokens.push({ from: wordStart, to: wordEnd, type: 'word', wordIndex });
            }

            // Mark trimmed spaces strictly at the end of the line (before newline or EOF)
            if (wordEnd < i && (i >= end || text[i] === '\n' || text[i] === '\r')) {
                tokens.push({ from: wordEnd, to: i, type: 'trailing-space', wordIndex });
            }

            if (i === prevI) {
                i++;
            }
        }
    }

    parseRange(0, text.length);
    return tokens;
}

/**
 * Calculates OKLCH color based on word index.
 */
function getWordOklchColor(wordIndex: number): string {
    const hue = (wordIndex * 137.5) % 360;
    return `oklch(var(--prompt-word-l, 0.25) var(--prompt-word-c, 0.4) ${hue}deg)`;
}

/**
 * Finds dictionary category for a word.
 */
function getTagCategory(rawWord: string): string | null {
    if (!rawWord) return null;

    if (rawWord.startsWith('<lora:')) {
        return 'lora';
    }

    let clean = rawWord
        .replaceAll(String.raw`\(`, '(')
        .replaceAll(String.raw`\)`, ')')
        .replaceAll(String.raw`\[`, '[')
        .replaceAll(String.raw`\]`, ']')
        .replaceAll(String.raw`\,`, ',')
        .replaceAll(String.raw`\\`, '\\')
        .trim();

    clean = clean.startsWith('@') ? clean.slice(1).trim() : clean;
    const lower = clean.toLowerCase();
    const spaceNormalized = lower.replaceAll('_', ' ');
    const underscoreNormalized = lower.replaceAll(' ', '_');

    const tagModel = getTagModel(spaceNormalized) || getTagModel(underscoreNormalized) || getTagModel(lower);
    if (tagModel) {
        const postCountThreshold = Number(appState.optionState.get('ComfyGrid.prompt_pilot.post_count_threshold') ?? 10);
        const postCount = tagModel.postCount ?? tagModel.useCount ?? 0;
        if (postCount < postCountThreshold) {
            return null;
        }

        const cat = tagModel.consequentTagModel?.category ?? tagModel.category;
        return cat !== undefined && cat !== null ? String(cat) : '0';
    }

    return null;
}

function buildPromptDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const text = view.state.doc.toString();
    const tokens = parsePromptTokens(text);
    const seenWords = new Set<string>();
    const coloringMode = (appState.optionState.get('ComfyGrid.prompt_pilot.word_coloring') as string) || 'word';

    for (const token of tokens) {
        if (token.from >= token.to) continue;

        if (token.type === 'word') {
            const rawWord = text.slice(token.from, token.to).trim();
            const unescaped = rawWord
                .replaceAll(String.raw`\(`, '(')
                .replaceAll(String.raw`\)`, ')')
                .replaceAll(String.raw`\[`, '[')
                .replaceAll(String.raw`\]`, ']')
                .trim();
            const normalized = unescaped.toLowerCase();
            let isDuplicate = false;

            if (normalized) {
                if (seenWords.has(normalized)) {
                    isDuplicate = true;
                } else {
                    seenWords.add(normalized);
                }
            }

            let styleAttribute: string | undefined;
            if (coloringMode === 'word') {
                const color = getWordOklchColor(token.wordIndex);
                styleAttribute = `--word-color: ${color};`;
            } else if (coloringMode === 'category') {
                const cat = getTagCategory(rawWord);
                if (cat !== null) {
                    styleAttribute = `--word-color: var(--danbooru-cat-${cat});`;
                }
            }

            const classes = isDuplicate ? 'cm-prompt-word cm-prompt-duplicate' : 'cm-prompt-word';

            builder.add(
                token.from,
                token.to,
                Decoration.mark({
                    class: classes,
                    ...(styleAttribute ? { attributes: { style: styleAttribute } } : {}),
                }),
            );
        } else if (token.type === 'bracket') {
            builder.add(
                token.from,
                token.to,
                Decoration.mark({
                    class: 'cm-prompt-bracket',
                }),
            );
        } else if (token.type === 'weight') {
            builder.add(
                token.from,
                token.to,
                Decoration.mark({
                    class: 'cm-prompt-weight',
                }),
            );
        } else if (token.type === 'comma') {
            builder.add(
                token.from,
                token.to,
                Decoration.mark({
                    class: 'cm-prompt-comma',
                }),
            );
        } else if (token.type === 'escape') {
            builder.add(
                token.from,
                token.to,
                Decoration.mark({
                    class: 'cm-prompt-escape',
                }),
            );
        } else if (token.type === 'error') {
            builder.add(
                token.from,
                token.to,
                Decoration.mark({
                    class: 'cm-prompt-error',
                }),
            );
        } else if (token.type === 'trailing-space') {
            builder.add(
                token.from,
                token.to,
                Decoration.mark({
                    class: 'cm-prompt-trailing-space',
                }),
            );
        }
    }

    return builder.finish();
}

export const promptHighlightPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = buildPromptDecorations(view);
        }

        update(update: ViewUpdate) {
            const hasReconfigure = update.transactions.some((tr) => tr.effects.some((e) => e.is(reconfigureHighlightEffect)));
            if (update.docChanged || update.viewportChanged || hasReconfigure) {
                this.decorations = buildPromptDecorations(update.view);
            }
        }
    },
    {
        decorations: (v) => v.decorations,
    },
);
