import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatBytes, matchesAccept, pickVariant, toPictureProps, validateFile } from '../src/index.js';
import type { UploadedImage, UploadedVariant } from '../src/types.js';

/** A minimal stand-in for the browser's File. */
const fakeFile = (name: string, type: string, size: number): File =>
  ({ name, type, size }) as File;

const variant = (format: string, width: number, label: string): UploadedVariant => {
  // Mirrors the server: the canonical format is `jpeg`, the extension is `jpg`.
  const ext = format === 'jpeg' ? 'jpg' : format;
  return {
    format,
    label,
    width,
    height: Math.round(width * 0.75),
    size: width * 100,
    quality: 80,
    key: `k/${label}.${ext}`,
    url: `https://cdn.example.com/${label}.${ext}`,
    contentType: `image/${format}`,
    checksum: 'abc',
  };
};

const image: UploadedImage = {
  id: 'img-1',
  source: { filename: 'photo.jpg', format: 'jpeg', width: 2000, height: 1500, size: 900_000 },
  formats: {
    // Order matters: the browser takes the first <source> it supports.
    avif: {
      urls: { '600w': 'https://cdn.example.com/600w.avif' },
      srcset: 'https://cdn.example.com/600w.avif 600w',
      size: 60_000,
      variants: [variant('avif', 600, '600w')],
    },
    webp: {
      urls: {
        '600w': 'https://cdn.example.com/600w.webp',
        '1200w': 'https://cdn.example.com/1200w.webp',
      },
      srcset: 'https://cdn.example.com/600w.webp 600w, https://cdn.example.com/1200w.webp 1200w',
      size: 180_000,
      variants: [variant('webp', 600, '600w'), variant('webp', 1200, '1200w')],
    },
    jpeg: {
      urls: { '1200w': 'https://cdn.example.com/1200w.jpg' },
      srcset: 'https://cdn.example.com/1200w.jpg 1200w',
      size: 240_000,
      variants: [variant('jpeg', 1200, '1200w')],
    },
  },
  totalSize: 480_000,
  savings: 0.73,
  durationMs: 120,
  warnings: [],
};

describe('validateFile', () => {
  it('passes a file inside the limits', () => {
    assert.equal(validateFile(fakeFile('a.jpg', 'image/jpeg', 1000), { maxBytes: 5000 }), null);
  });

  it('rejects an oversized file with a readable message', () => {
    const error = validateFile(fakeFile('big.jpg', 'image/jpeg', 6_000_000), {
      maxBytes: 5_000_000,
    });

    assert.equal(error!.code, 'FILE_TOO_LARGE');
    assert.match(error!.message, /5\.7 MB, over the 4\.8 MB limit/);
    assert.equal(error!.details!.limit, 5_000_000);
  });

  it('rejects a disallowed type and lists what is accepted', () => {
    const error = validateFile(fakeFile('doc.pdf', 'application/pdf', 100), {
      accept: ['image/png', 'image/jpeg'],
    });

    assert.equal(error!.code, 'FILE_TYPE_REJECTED');
    assert.match(error!.message, /image\/png, image\/jpeg/);
  });
});

describe('matchesAccept', () => {
  it('matches an exact MIME type', () => {
    assert.ok(matchesAccept(fakeFile('a.png', 'image/png', 1), ['image/png']));
    assert.ok(!matchesAccept(fakeFile('a.gif', 'image/gif', 1), ['image/png']));
  });

  it('matches a wildcard', () => {
    assert.ok(matchesAccept(fakeFile('a.webp', 'image/webp', 1), ['image/*']));
    assert.ok(!matchesAccept(fakeFile('a.pdf', 'application/pdf', 1), ['image/*']));
  });

  it('matches by extension when the browser reports no type', () => {
    // Browsers leave `type` empty for formats they do not know, which is
    // exactly the case for newer image formats - so extensions must work.
    assert.ok(matchesAccept(fakeFile('photo.HEIC', '', 1), ['.heic']));
  });

  it('is case-insensitive on both sides', () => {
    assert.ok(matchesAccept(fakeFile('a.PNG', 'IMAGE/PNG', 1), ['image/png']));
  });
});

describe('formatBytes', () => {
  it('scales the unit', () => {
    assert.equal(formatBytes(512), '512 B');
    assert.equal(formatBytes(2048), '2.0 KB');
    assert.equal(formatBytes(5_242_880), '5.0 MB');
  });
});

describe('toPictureProps', () => {
  it('emits one source per format, in request order', () => {
    const { sources } = toPictureProps(image);

    assert.deepEqual(
      sources.map((s) => s.type),
      ['image/avif', 'image/webp', 'image/jpeg'],
      'the progressive-enhancement ladder is preserved',
    );
    assert.equal(sources[1]!.srcSet, image.formats.webp!.srcset);
  });

  it('falls back to the widest variant of the last format', () => {
    const { img } = toPictureProps(image, { alt: 'Sunset' });

    assert.equal(img.src, 'https://cdn.example.com/1200w.jpg', 'jpeg is the compatible fallback');
    assert.equal(img.alt, 'Sunset');
  });

  it('always sets width and height, so the layout does not shift', () => {
    const { img } = toPictureProps(image);

    assert.equal(img.width, 1200);
    assert.equal(img.height, 900);
  });

  it('threads sizes through to every source and the img', () => {
    const sizes = '(max-width: 768px) 100vw, 50vw';
    const { sources, img } = toPictureProps(image, { sizes });

    assert.ok(sources.every((source) => source.sizes === sizes));
    assert.equal(img.sizes, sizes);
  });

  it('defaults to lazy loading and async decoding', () => {
    const { img } = toPictureProps(image);

    assert.equal(img.loading, 'lazy');
    assert.equal(img.decoding, 'async');
    assert.equal(toPictureProps(image, { loading: 'eager' }).img.loading, 'eager');
  });

  it('defaults alt to an empty string rather than omitting it', () => {
    // A missing alt is an accessibility failure; an explicitly empty one marks
    // the image as decorative, which is at least a valid answer.
    assert.equal(toPictureProps(image).img.alt, '');
  });
});

describe('pickVariant', () => {
  it('picks the smallest variant that is not an upscale', () => {
    assert.equal(pickVariant(image, 800, 'webp')!.width, 1200);
    assert.equal(pickVariant(image, 600, 'webp')!.width, 600);
  });

  it('falls back to the widest when nothing is big enough', () => {
    assert.equal(pickVariant(image, 5000, 'webp')!.width, 1200);
  });

  it('searches every format when none is named', () => {
    assert.ok(pickVariant(image, 600));
  });

  it('returns undefined for a format that was not generated', () => {
    assert.equal(pickVariant(image, 600, 'gif'), undefined);
  });
});
