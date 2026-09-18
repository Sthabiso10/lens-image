/**
 * `@lens-image/adapter-local` - filesystem storage.
 *
 * Zero dependencies: `node:fs/promises` and `node:path` do everything. Useful
 * in development, for self-hosted deployments serving from a static directory,
 * and as the simplest complete example of the adapter contract.
 *
 * @packageDocumentation
 */

import { constants } from 'node:fs';
import { access, mkdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { LensError } from '@lens-image/core';
import type { StorageAdapter, StorageContext, StorageFile, StorageObject } from '@lens-image/core';

/** Options for {@link LocalAdapter}. */
export interface LocalAdapterOptions {
  /**
   * Directory that keys are written under. Created on first write.
   * Relative paths resolve against `process.cwd()`.
   */
  readonly root: string;

  /**
   * URL prefix that maps to `root`, e.g. `'/images'` or `'https://cdn.example.com'`.
   *
   * Without it, `variant.url` is a `file://` URL - correct, but not something
   * you can put in an `<img>` tag.
   */
  readonly baseUrl?: string;

  /** Mode for created directories. Default `0o755`. */
  readonly dirMode?: number;

  /** Mode for written files. Default `0o644`. */
  readonly fileMode?: number;

  /**
   * Write to a temp file and rename into place. Default `true`.
   *
   * `rename` is atomic within a filesystem, so a crash mid-write leaves the
   * old file intact instead of a truncated one. Turn it off only if `root` is
   * a filesystem where rename is not atomic (some network mounts).
   */
  readonly atomic?: boolean;

  /** Overwrite an existing key. Default `true`. */
  readonly overwrite?: boolean;
}

/**
 * Stores optimized images on the local filesystem.
 *
 * @example Next.js public directory
 * ```ts
 * import { ImageOptimizer } from '@lens-image/core';
 * import { LocalAdapter } from '@lens-image/adapter-local';
 *
 * const optimizer = new ImageOptimizer({
 *   adapter: new LocalAdapter({
 *     root: './public/uploads',
 *     baseUrl: '/uploads',        // how the browser reaches ./public/uploads
 *   }),
 * });
 *
 * const result = await optimizer.optimize({ source: './photo.jpg', formats: ['webp'] });
 * result.variants[0].url;  // '/uploads/a1b2c3d4e5/photo-original.webp'
 * ```
 */
export class LocalAdapter implements StorageAdapter {
  readonly name = 'local';

  readonly #root: string;
  readonly #baseUrl: string;
  readonly #dirMode: number;
  readonly #fileMode: number;
  readonly #atomic: boolean;
  readonly #overwrite: boolean;

  constructor(options: LocalAdapterOptions) {
    if (!options?.root) {
      throw new LensError(
        'ADAPTER_MISCONFIGURED',
        'LocalAdapter needs a `root` directory, e.g. new LocalAdapter({ root: "./public/uploads" }).',
        { details: { adapter: 'local' } },
      );
    }

    this.#root = resolve(options.root);
    this.#baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '');
    this.#dirMode = options.dirMode ?? 0o755;
    this.#fileMode = options.fileMode ?? 0o644;
    this.#atomic = options.atomic ?? true;
    this.#overwrite = options.overwrite ?? true;
  }

  /** The absolute directory this adapter writes to. */
  get root(): string {
    return this.#root;
  }

  async upload(file: StorageFile, ctx: StorageContext): Promise<StorageObject> {
    const target = this.#resolveKey(file.key);

    if (!this.#overwrite && (await this.exists(file.key))) {
      throw new LensError(
        'UPLOAD_FAILED',
        `"${file.key}" already exists and overwrite is disabled.`,
        { details: { adapter: 'local', key: file.key } },
      );
    }

    await mkdir(dirname(target), { recursive: true, mode: this.#dirMode });

    if (this.#atomic) {
      // Random suffix rather than a counter: two processes optimizing the same
      // image would otherwise pick the same temp name and clobber each other.
      const temp = `${target}.${randomBytes(6).toString('hex')}.tmp`;
      try {
        await writeFile(temp, file.data, { mode: this.#fileMode, ...(ctx.signal ? { signal: ctx.signal } : {}) });
        await rename(temp, target);
      } catch (error) {
        await unlink(temp).catch(() => {});
        throw wrapFsError(error, file.key, target);
      }
    } else {
      try {
        await writeFile(target, file.data, {
          mode: this.#fileMode,
          ...(ctx.signal ? { signal: ctx.signal } : {}),
        });
      } catch (error) {
        throw wrapFsError(error, file.key, target);
      }
    }

    return {
      key: file.key,
      url: this.getUrl(file.key),
      size: file.data.byteLength,
      ...(file.checksum ? { etag: file.checksum } : {}),
      meta: { path: target },
    };
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.#resolveKey(key), constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async remove(key: string): Promise<void> {
    await rm(this.#resolveKey(key), { force: true });
  }

  /** Public URL for a key, or a `file://` URL when no `baseUrl` is configured. */
  getUrl(key: string): string {
    // Without a baseUrl, hand back a correct file: URL. Building it by string
    // concatenation gets Windows wrong - `file://C:/x` names a host called "C:"
    // - so let Node do it.
    if (!this.#baseUrl) return pathToFileURL(this.#resolveKey(key)).href;

    const path = key.split('/').map(encodeURIComponent).join('/');
    return `${this.#baseUrl}/${path}`;
  }

  /** Absolute filesystem path for a key. Useful in tests and for serving. */
  resolvePath(key: string): string {
    return this.#resolveKey(key);
  }

  /**
   * Resolves a key against the root, refusing anything that escapes it.
   *
   * Keys are usually generated by Lens, but a custom `key` function could
   * interpolate a user-supplied filename - so a `../../.ssh/authorized_keys`
   * has to be impossible here rather than assumed away upstream.
   */
  #resolveKey(key: string): string {
    const target = resolve(this.#root, key);
    const rel = relative(this.#root, target);

    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new LensError(
        'UPLOAD_FAILED',
        `Refusing to write "${key}": it resolves outside the adapter root (${this.#root}).`,
        { details: { adapter: 'local', key } },
      );
    }
    return target;
  }
}

function wrapFsError(error: unknown, key: string, path: string): LensError {
  const err = error as NodeJS.ErrnoException;
  const hint =
    err?.code === 'EACCES' || err?.code === 'EPERM'
      ? ' Check that the process can write to this directory.'
      : err?.code === 'ENOSPC'
        ? ' The disk is full.'
        : err?.code === 'EROFS'
          ? ' The filesystem is read-only.'
          : '';

  return new LensError('UPLOAD_FAILED', `Could not write "${key}" to ${path}.${hint}`, {
    cause: error,
    details: { adapter: 'local', key, path, code: err?.code },
  });
}

export default LocalAdapter;
