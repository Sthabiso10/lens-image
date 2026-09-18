/**
 * `cn`: the class-name helper shadcn components expect at `@/lib/utils`.
 *
 * ### Why this is not clsx + tailwind-merge
 *
 * The canonical shadcn implementation is `twMerge(clsx(inputs))`, which is two
 * dependencies. This site documents a library whose headline claim is a
 * dependency graph you can read in one screen, so it holds itself to the same
 * bar: the icons, the syntax highlighter and the prose styles here are all
 * hand-rolled for exactly that reason.
 *
 * This implementation matches `clsx`'s input handling: strings, arrays,
 * conditional objects, and falsy values that drop out: which is all any
 * component in this repo uses.
 *
 * **The one thing it does not do is merge conflicting Tailwind utilities.**
 * `cn('p-2', 'p-4')` returns `"p-2 p-4"` rather than `"p-4"`, and which one
 * wins is then decided by stylesheet order, not argument order. That is fine
 * for how it is used here: callers pass layout and sizing classes that do not
 * collide with the component's own: but it is a real difference.
 *
 * If you later add shadcn components that rely on override-by-argument-order:
 *
 * ```sh
 * npm install clsx tailwind-merge
 * ```
 *
 * ```ts
 * import { clsx, type ClassValue } from 'clsx';
 * import { twMerge } from 'tailwind-merge';
 *
 * export function cn(...inputs: ClassValue[]) {
 *   return twMerge(clsx(inputs));
 * }
 * ```
 */

export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | ClassValue[]
  | { [key: string]: unknown };

/**
 * Joins class names, dropping anything falsy.
 *
 * @example
 * ```ts
 * cn('rounded', isActive && 'bg-raised', { 'opacity-50': disabled }, className);
 * ```
 */
export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];

  for (const input of inputs) {
    if (!input) continue;

    if (typeof input === 'string' || typeof input === 'number') {
      out.push(String(input));
    } else if (Array.isArray(input)) {
      const nested = cn(...input);
      if (nested) out.push(nested);
    } else if (typeof input === 'object') {
      for (const [key, value] of Object.entries(input)) {
        if (value) out.push(key);
      }
    }
  }

  return out.join(' ');
}
