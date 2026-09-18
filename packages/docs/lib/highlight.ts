/**
 * A very small syntax tokeniser.
 *
 * The docs site has no dependencies beyond next/react, so rather than pull in
 * Shiki or Prism for a few dozen short snippets, this walks the string once and
 * emits typed spans. It handles comments, strings (including templates),
 * numbers, keywords, types and call sites: which is everything our samples
 * contain. It is not a parser: a template literal's `${...}` is rendered as
 * part of the string, and that is fine at this size.
 *
 * When the docs grow past a handful of pages, replace this with
 * `rehype-pretty-code` rather than teaching it more syntax.
 */

export type TokenKind =
  | 'plain'
  | 'comment'
  | 'string'
  | 'number'
  | 'keyword'
  | 'type'
  | 'fn'
  | 'attr'
  | 'punct';

export interface Token {
  kind: TokenKind;
  value: string;
}

const KEYWORDS = new Set([
  'import',
  'from',
  'export',
  'default',
  'const',
  'let',
  'var',
  'function',
  'return',
  'await',
  'async',
  'new',
  'type',
  'interface',
  'implements',
  'extends',
  'class',
  'if',
  'else',
  'for',
  'while',
  'of',
  'in',
  'try',
  'catch',
  'finally',
  'throw',
  'typeof',
  'instanceof',
  'as',
  'void',
  'null',
  'undefined',
  'true',
  'false',
  'this',
  'super',
  'yield',
  'delete',
  'readonly',
  'use',
]);

const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;

function isShell(language?: string) {
  return language === 'bash' || language === 'sh' || language === 'shell';
}

export function tokenize(code: string, language?: string): Token[] {
  const tokens: Token[] = [];
  const shell = isShell(language);
  let buffer = '';

  const flush = () => {
    if (buffer) {
      tokens.push({ kind: 'plain', value: buffer });
      buffer = '';
    }
  };
  const push = (kind: TokenKind, value: string) => {
    flush();
    tokens.push({ kind, value });
  };

  let i = 0;
  while (i < code.length) {
    const char = code[i]!;
    const next = code[i + 1];

    // Comments, `#` only counts in shell, `//` only outside it.
    if ((shell && char === '#') || (!shell && char === '/' && next === '/')) {
      let end = code.indexOf('\n', i);
      if (end === -1) end = code.length;
      push('comment', code.slice(i, end));
      i = end;
      continue;
    }

    if (!shell && char === '/' && next === '*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end === -1 ? code.length : end + 2;
      push('comment', code.slice(i, stop));
      i = stop;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      let j = i + 1;
      while (j < code.length) {
        if (code[j] === '\\') {
          j += 2;
          continue;
        }
        if (code[j] === char) {
          j += 1;
          break;
        }
        j += 1;
      }
      push('string', code.slice(i, j));
      i = j;
      continue;
    }

    if (/[0-9]/.test(char) && !IDENT_PART.test(code[i - 1] ?? ' ')) {
      let j = i;
      while (j < code.length && /[0-9._]/.test(code[j]!)) j += 1;
      push('number', code.slice(i, j));
      i = j;
      continue;
    }

    if (IDENT_START.test(char)) {
      let j = i;
      while (j < code.length && IDENT_PART.test(code[j]!)) j += 1;
      const word = code.slice(i, j);

      // Look ahead past spaces for a `(`. That makes it a call or definition.
      let k = j;
      while (k < code.length && code[k] === ' ') k += 1;

      let kind: TokenKind = 'plain';
      if (!shell && KEYWORDS.has(word)) kind = 'keyword';
      else if (code[k] === '(') kind = 'fn';
      // A name followed by `=` or `:` is a JSX prop, an object key or a type
      // annotation. Colouring those is what keeps a config-heavy sample from
      // rendering as a wall of one colour.
      else if (code[k] === ':') kind = 'attr';
      else if (code[k] === '=' && code[k + 1] !== '=' && code[k + 1] !== '>') kind = 'attr';
      else if (/^[A-Z]/.test(word)) kind = 'type';

      if (kind === 'plain') buffer += word;
      else push(kind, word);
      i = j;
      continue;
    }

    if (/[{}()[\].,;:<>=+\-*/%!?&|]/.test(char)) {
      push('punct', char);
      i += 1;
      continue;
    }

    buffer += char;
    i += 1;
  }

  flush();
  return tokens;
}

export const TOKEN_CLASS: Record<TokenKind, string> = {
  plain: 'text-secondary',
  comment: 'text-code-comment italic',
  string: 'text-code-string',
  number: 'text-code-number',
  keyword: 'text-code-keyword',
  type: 'text-code-type',
  fn: 'text-code-fn',
  attr: 'text-code-attr',
  punct: 'text-code-punct',
};
