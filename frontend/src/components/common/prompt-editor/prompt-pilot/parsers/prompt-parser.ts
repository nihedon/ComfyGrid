import type { InsertionInfo, ParseResult, PromptInfo, Word } from '../types';

type NestType = 'root' | 'paren' | 'square' | 'curly' | 'lora';

const openerToType: Record<string, NestType> = {
    '(': 'paren',
    '[': 'square',
    '{': 'curly',
    '<': 'lora',
};

const closerToType: Record<string, NestType> = {
    ')': 'paren',
    ']': 'square',
    '}': 'curly',
    '>': 'lora',
};

const closerForType: Record<NestType, string> = {
    root: '',
    paren: ')',
    square: ']',
    curly: '}',
    lora: '>',
};

const delimiters: Record<NestType, Set<string>> = {
    root: new Set<string>([',', '.']),
    paren: new Set<string>([',', '.']),
    square: new Set<string>([',', '.', ':', '|']),
    curly: new Set<string>([',', '.', '|']),
    lora: new Set<string>(),
};

const DELIMITERS_WITHOUT_COMMA = new Set<string>([',', '.', '|', ':', '(', '[', '{', '<']);
const PREFIX_LENGTH = 5;
const META_KEYWORDS = ['BREAK', 'AND', 'ADDCOMM', 'ADDBASE', 'ADDCOL', 'ADDROW'];
const DYNAMIC_PROMPT_REGEXP = /\{([\d-]+\$\$(?:[^}$]+?\$\$)?)([^}]*)\}/g;
const MATCH_META_KEYWORD_REGEXP = new RegExp(String.raw`\b(${META_KEYWORDS.join('|')})\b`, 'g');

const IS_NUMBER_REGEXP = /^\d+$/;

function makeWordData(nestType: NestType, position: number): Word {
    const wordType = nestType === 'lora' ? 'lora' : 'tag';
    return {
        value: '',
        position: position,
        type: wordType,
        isActive: false,
    };
}

export function updatePromptState(prompt: string, caret: number): ParseResult {
    const promptInfo: PromptInfo = {
        prompt: prompt,
        caretPosition: caret,
        inputtingString: '',
        activeWordIndex: -1,
        words: [] as Word[],
    };

    const insertionInfo: InsertionInfo = {
        isMetaBlock: false,
        needPrependComma: false,
        needPrependSpace: false,
    };

    const sanitizedPrompt = prompt
        .replace(MATCH_META_KEYWORD_REGEXP, (match) => ','.padEnd(match.length, '\0'))
        .replace(DYNAMIC_PROMPT_REGEXP, (_, group1, group2) => {
            const stars = '\0'.repeat(group1.length);
            return `{${stars}${group2}}`;
        });

    const nestTypes: NestType[] = ['root'];
    let isEscaped = false;
    let delimiter: string | undefined;
    let isNewLine = true;

    function flush(w: Word) {
        w.value = w.value.trim();
        if (w.isActive || w.value !== '') {
            promptInfo.words.push(w);
            isNewLine = false;
            delimiter = undefined;
        }
    }

    function updateContextState(char: string) {
        if (char === '\n') {
            isNewLine = true;
        } else if (DELIMITERS_WITHOUT_COMMA.has(char)) {
            delimiter = char;
        }
    }

    function updatePrependFlags(w: Word) {
        if (w.isActive && promptInfo.words.length > 0) {
            if (delimiter === undefined) {
                insertionInfo.needPrependComma = true;
                if (!isNewLine) {
                    insertionInfo.needPrependSpace = true;
                }
            } else if (delimiter === ',') {
                insertionInfo.needPrependSpace = true;
            }
        }
    }

    function setActiveWordData(w: Word) {
        w.isActive = true;
        let inputtingString = promptInfo.inputtingString;
        if (isEscaped) {
            inputtingString += '\\';
            promptInfo.inputtingString = inputtingString;
        }
        promptInfo.inputtingString = w.value.trim();
        promptInfo.activeWordIndex = promptInfo.words.length;
    }

    let word: Word = makeWordData('root', 0);

    for (let i = 0; i < sanitizedPrompt.length; i++) {
        const char = sanitizedPrompt[i];
        if (i === caret) {
            setActiveWordData(word);
        }

        const currentNestType: NestType = nestTypes.at(-1)!;

        if (char === '\0') {
            if (word.isActive) {
                insertionInfo.isMetaBlock = true;
                insertionInfo.needPrependSpace = true;
            }
            word.position++;
            continue;
        }
        if (char === '\n') {
            updatePrependFlags(word);
            flush(word);
            updateContextState(char);
            word = makeWordData(currentNestType, i + 1);

            isEscaped = false;
            continue;
        }
        if (isEscaped) {
            word.value += char;
            isEscaped = false;
            continue;
        }
        if (char === '\\') {
            isEscaped = true;
            continue;
        }

        if (char in openerToType) {
            let openerType = openerToType[char];
            if (openerType === 'lora') {
                openerType = 'root';
                if (sanitizedPrompt.length - i > PREFIX_LENGTH) {
                    const loraPrefix = sanitizedPrompt.substring(i + 1, i + PREFIX_LENGTH + 1);
                    if (loraPrefix === 'lora:' || loraPrefix === 'lyco:') {
                        openerType = 'lora';
                    }
                }
            }
            if (openerType !== 'root') {
                nestTypes.push(openerType);

                if (openerType === 'lora') {
                    i += PREFIX_LENGTH;
                    if (i - caret >= 0 && i - caret < PREFIX_LENGTH) {
                        insertionInfo.isMetaBlock = true;
                    }
                }
                updatePrependFlags(word);
                flush(word);
                updateContextState(char);
                if (openerType === 'lora') {
                    word = makeWordData(openerType, i + 1);
                } else {
                    word = makeWordData(openerType, i);
                }
                continue;
            }
        }

        if (char in closerToType) {
            const expectedCloser = closerForType[currentNestType];
            if (char !== expectedCloser) {
                word.value += char;
                continue;
            }
            if (currentNestType === 'paren' || currentNestType === 'square') {
                const colonIndex = word.value.lastIndexOf(':');
                if (colonIndex >= 0) {
                    const wordValue = word.value.substring(0, colonIndex);
                    const weightValue = word.value.substring(colonIndex + 1);
                    if (isNumber(weightValue)) {
                        word.value = wordValue;
                        if (word.isActive && i - caret <= weightValue.length) {
                            insertionInfo.isMetaBlock = true;
                        }
                    }
                } else if (currentNestType === 'square') {
                    if (isNumber(word.value)) {
                        if (word.isActive && i - caret <= word.value.length) {
                            insertionInfo.isMetaBlock = true;
                        }
                        word.value = '';
                    }
                }
            } else if (currentNestType === 'lora') {
                const colonIndex = word.value.indexOf(':');
                if (colonIndex >= 0) {
                    const loraName = word.value.substring(0, colonIndex);
                    const multiplier = word.value.substring(colonIndex + 1);
                    if (word.isActive && i - caret <= multiplier.length) {
                        insertionInfo.isMetaBlock = true;
                    }
                    word.value = loraName;
                }
            }
            nestTypes.pop();

            updatePrependFlags(word);
            flush(word);
            updateContextState(char);
            word = makeWordData(nestTypes.at(-1)!, i + 1);
            continue;
        }

        if (currentNestType === 'lora') {
            if (word.value !== '' || char !== ' ') {
                word.value += char;
            }
            continue;
        }

        if (delimiters[currentNestType]?.has(char)) {
            updatePrependFlags(word);
            flush(word);
            updateContextState(char);
            word = makeWordData(currentNestType, i + 1);
            continue;
        }

        if (word.value === '') {
            word.position = i;
        }
        word.value += char;
    }

    if (promptInfo.activeWordIndex < 0) {
        setActiveWordData(word);
    }
    promptInfo.words.forEach((w) => {
        w.value = w.value.replaceAll('_', ' ');
    });

    for (let i = 0; i < promptInfo.words.length - 1; i++) {
        const currWord = promptInfo.words[i];
        const nextWord = promptInfo.words[i + 1];
        if (IS_NUMBER_REGEXP.test(nextWord.value)) {
            const colonIndex = currWord.value.lastIndexOf(':');
            if (colonIndex > 0) {
                const prefix = currWord.value.slice(0, colonIndex);
                const suffix = currWord.value.slice(colonIndex + 1);
                if (!prefix.includes(':') && IS_NUMBER_REGEXP.test(suffix)) {
                    currWord.value = prefix;
                    promptInfo.words.splice(i + 1, 1);

                    if (promptInfo.activeWordIndex > i) {
                        promptInfo.activeWordIndex--;
                    }
                    i--;
                }
            }
        }
    }

    updatePrependFlags(word);
    flush(word);

    return { promptInfo, insertionInfo };
}

function isNumber(value: string): boolean {
    if (value.trim() === '') {
        return false;
    }
    return !Number.isNaN(+value);
}
