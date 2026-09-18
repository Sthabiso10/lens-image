/**
 * `@lens-image/react` - headless React hooks for Lens uploads.
 *
 * State management only. No components, no CSS, no portals - so it composes
 * with Tailwind, MUI, Chakra, shadcn/ui or your own design system without a
 * fight, and adds nothing to your bundle but hooks.
 *
 * Zero dependencies; React is a peer.
 *
 * @packageDocumentation
 */

export { useImageUpload } from './useImageUpload.js';
export type { UseImageUploadOptions, UseImageUploadResult } from './useImageUpload.js';

export { useDropzone } from './useDropzone.js';
export type { UseDropzoneOptions, UseDropzoneResult } from './useDropzone.js';

export { toPictureProps, pickVariant } from './picture.js';
export type { SourceProps, ImgProps } from './picture.js';

export { validateFile, matchesAccept, formatBytes } from './validate.js';

export type {
  ClientValidationOptions,
  UploadError,
  UploadItem,
  UploadStatus,
  UploadedFormat,
  UploadedImage,
  UploadedVariant,
} from './types.js';

/** The version of `@lens-image/react`. */
export const VERSION = '0.1.0';
