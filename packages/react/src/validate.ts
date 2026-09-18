/**
 * Client-side validation.
 *
 * This never replaces server-side validation - a browser check is a courtesy to
 * the user, not a security control. Its job is to fail a 40 MB file instantly
 * instead of after a two-minute upload that the server then rejects.
 */

import type { ClientValidationOptions, UploadError } from './types.js';

/**
 * Checks one file against the client rules.
 *
 * @returns An {@link UploadError} to reject with, or `null` when the file passes.
 *
 * @example
 * ```ts
 * const error = validateFile(file, { maxBytes: 5 * 1024 * 1024, accept: ['image/*'] });
 * if (error) showToast(error.message);
 * ```
 */
export function validateFile(file: File, options: ClientValidationOptions): UploadError | null {
  if (options.maxBytes !== undefined && file.size > options.maxBytes) {
    return {
      code: 'FILE_TOO_LARGE',
      message: `"${file.name}" is ${formatBytes(file.size)}, over the ${formatBytes(options.maxBytes)} limit.`,
      details: { limit: options.maxBytes, actual: file.size },
    };
  }

  if (options.accept?.length && !matchesAccept(file, options.accept)) {
    return {
      code: 'FILE_TYPE_REJECTED',
      message: `"${file.name}" is not an accepted file type (${options.accept.join(', ')}).`,
      details: { accept: options.accept, actual: file.type || extensionOf(file.name) },
    };
  }

  return null;
}

/**
 * Matches a file against `accept` entries.
 *
 * Handles all three forms the HTML `accept` attribute allows: an exact MIME
 * type (`image/png`), a wildcard (`image/*`), and an extension (`.heic`).
 * Extensions matter because browsers report an empty `type` for formats they
 * do not recognise, which is exactly the case for newer image formats.
 */
export function matchesAccept(file: File, accept: readonly string[]): boolean {
  const type = file.type.toLowerCase();
  const extension = extensionOf(file.name);

  return accept.some((entry) => {
    const rule = entry.trim().toLowerCase();
    if (rule.startsWith('.')) return extension === rule;
    if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}

function extensionOf(filename: string): string {
  const index = filename.lastIndexOf('.');
  return index === -1 ? '' : filename.slice(index).toLowerCase();
}

/** Human-readable byte count, for error messages and UI. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
