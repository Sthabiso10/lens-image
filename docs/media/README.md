# Brand assets

Everything here is generated. Run:

```bash
npm run brand:build
```

Only the two files in `source/` are hand-made. Everything else is derived from
them, so re-run the script rather than editing a raster by hand.

## Source

| File | |
|---|---|
| `source/icon-source.png` | 108x101. The mark alone, on its dark canvas. |
| `source/logo-source.png` | 260x98. The mark plus the lowercase wordmark. |

Both are opaque, with a vertical gradient background. The exact stops differ
between the two files, so they are sampled at build time rather than assumed.

## Generated

| File | Size | Used by |
|---|---|---|
| `icon.png` | 1024x1024 | npm and GitHub org avatar, anywhere wanting a large square |
| `logo.png` | 260x98 | The centred header in every README, shown at 300 wide. Rounded corners. |
| `social-preview.png` | 1280x640 | GitHub repository social preview |
| `../../packages/docs/app/icon.png` | 512x512 | Favicon, via the Next file convention |
| `../../packages/docs/app/apple-icon.png` | 180x180 | iOS home screen, opaque on purpose |
| `../../packages/docs/app/favicon.ico` | 16, 32, 48 | Windows pins and older browsers asking for `/favicon.ico` |
| `../../packages/docs/app/opengraph-image.png` | 1200x630 | Link previews |
| `../../packages/docs/public/brand/icon-*.png` | 16 to 512 | The site header and footer marks |
| `../../packages/docs/public/brand/logo-*.png` | 240, 478 | In-site logo use |

## Three details the script exists for

**The mark is not square and sits close to the edges.** It is padded onto a
square rather than cropped, so nothing is clipped and corner rounding has room.

**The background gradient is sampled, not assumed.** It was hardcoded once. The
artwork was then replaced, the old constants no longer matched, and every social
card grew a visible rectangle around the logo. Sampling each source's own top
and bottom rows brings the boundary delta down to one or two levels, which is
imperceptible.

**Transparency is recovered at the output's resolution, not the source's.** Cut
out first and then enlarged, a one-pixel matte becomes a nine-pixel one and
composites as a grey halo on any light surface. Resizing first and thresholding
after keeps the matte two pixels wide at 512.

## Transparency

The sources are opaque exports, so the script lifts the mark off its background
rather than shipping a dark tile in the browser tab.

It can do that safely because the mark separates cleanly: 58% of the source's
pixels sit exactly at the background level and 33% sit ten or more levels above
it, with almost nothing in between. Alpha ramps across that gap, the background
is sampled per row from the outer columns rather than assumed, and the original
RGB is untouched so the mark keeps its own gradient.

Where the outer ring fades out, the source's dithering put neighbouring pixels
either side of the threshold and the edge broke into speckle. The alpha channel
is blurred with a small separable kernel to repair that. Only alpha, so no
colour is altered.

**Two things stay opaque on purpose:**

| | Why |
|---|---|
| `apple-icon.png` | iOS composites home-screen icons onto black rather than honouring alpha, so a transparent one renders on a hard black square with no control over the edge. |
| `logo.png` | The wordmark is white. Transparent, it would be invisible against GitHub's light theme, so it keeps its dark card. Only the corners are cut, at a radius of ten percent of the short side, so a dark card dropped into a light README reads as a mark rather than a screenshot. |

## Known limits

**The sources are small.** 203px and 478px. Nothing is upscaled past its source:
the 1024 icon is padded rather than enlarged, and the social cards composite the
logo at its native scale onto a larger canvas. A vector source would remove the
ceiling entirely, and would make the cutout unnecessary.

**The mark's outer ring is dark.** Lifted onto a transparent background it reads
well on light surfaces and quietly on dark ones, which is inherent to the
artwork rather than to the extraction.
