/**
 * `useDropzone` - headless drag-and-drop.
 *
 * Returns prop getters, not components. Spread them onto whatever element you
 * are already styling and nothing about your markup has to change.
 */

import { useCallback, useRef, useState } from 'react';
import type { DragEvent, HTMLAttributes, InputHTMLAttributes } from 'react';

/** Options for {@link useDropzone}. */
export interface UseDropzoneOptions {
  /** Called with the dropped or selected files. */
  readonly onDrop: (files: File[]) => void;
  /** `accept` attribute value, e.g. `'image/*'`. */
  readonly accept?: string;
  /** Allow selecting more than one file. Default `true`. */
  readonly multiple?: boolean;
  /** Ignore drops and clicks. */
  readonly disabled?: boolean;
  /** Keep non-image files instead of filtering them out. Default `false`. */
  readonly allowNonImages?: boolean;
}

/** What {@link useDropzone} returns. */
export interface UseDropzoneResult {
  /** True while a drag is over the zone. Drive your hover styles with this. */
  readonly isDragActive: boolean;
  /** Spread onto the drop target. */
  getRootProps: () => HTMLAttributes<HTMLElement>;
  /** Spread onto a visually hidden `<input type="file">`. */
  getInputProps: () => InputHTMLAttributes<HTMLInputElement> & { ref: (el: HTMLInputElement | null) => void };
  /** Opens the file picker programmatically. */
  open: () => void;
}

/**
 * @example
 * ```tsx
 * const { upload } = useImageUpload({ endpoint: '/api/upload' });
 * const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
 *   onDrop: upload,
 *   accept: 'image/*',
 * });
 *
 * <div {...getRootProps()} data-active={isDragActive} className="dropzone">
 *   <input {...getInputProps()} />
 *   <p>Drop images here, or <button type="button" onClick={open}>browse</button>.</p>
 * </div>
 * ```
 */
export function useDropzone(options: UseDropzoneOptions): UseDropzoneResult {
  const [isDragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // dragenter/dragleave fire for every child element the cursor crosses, so a
  // boolean flickers. Counting enter/leave pairs is the standard fix.
  const depth = useRef(0);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const accept = useCallback((files: FileList | null) => {
    const config = optionsRef.current;
    if (!files || config.disabled) return;

    const list = Array.from(files).filter(
      (file) => config.allowNonImages || file.type.startsWith('image/') || file.type === '',
    );
    if (list.length > 0) config.onDrop(config.multiple === false ? list.slice(0, 1) : list);
  }, []);

  const getRootProps = useCallback((): HTMLAttributes<HTMLElement> => ({
    onDragEnter: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      depth.current++;
      if (!optionsRef.current.disabled) setDragActive(true);
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      // Without preventDefault on dragover the browser navigates to the file.
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = optionsRef.current.disabled ? 'none' : 'copy';
      }
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragActive(false);
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      depth.current = 0;
      setDragActive(false);
      accept(event.dataTransfer?.files ?? null);
    },
  }), [accept]);

  const getInputProps = useCallback((): ReturnType<UseDropzoneResult['getInputProps']> => ({
    type: 'file',
    ref: (element: HTMLInputElement | null) => {
      inputRef.current = element;
    },
    ...(optionsRef.current.accept ? { accept: optionsRef.current.accept } : {}),
    multiple: optionsRef.current.multiple !== false,
    disabled: optionsRef.current.disabled ?? false,
    style: { display: 'none' },
    onChange: (event) => {
      accept(event.target.files);
      // Reset so selecting the same file twice in a row still fires onChange.
      event.target.value = '';
    },
  }), [accept]);

  const open = useCallback(() => {
    if (!optionsRef.current.disabled) inputRef.current?.click();
  }, []);

  return { isDragActive, getRootProps, getInputProps, open };
}
