# Image Processing

Summary of how the app handles user-uploaded images end-to-end — in particular
the three things that bite real photos and are easy to get wrong:

1. **HDR gain maps** (Apple Ultra HDR / ISO 21496-1 / Google Ultra HDR)
2. **EXIF orientation** (iPhone portrait photos with `Orientation=6`)
3. **ICC color profiles** (Display P3 on iPhones, preserved through the pipeline)

Plus the surrounding upload, compression, thumbnail, and format-conversion
machinery.

---

## Upload pipeline

Images are uploaded **direct to S3 via a presigned PUT** so we bypass Vercel's
4.5 MB request-body limit. The flow is:

1. `POST /api/image/upload/presign` — validates content type & size, returns an
   `imageId` + S3 upload URL (5 min expiry).
2. Client `PUT`s the file straight to S3.
3. `POST /api/image/upload/confirm` — verifies the object, runs server-side
   compression / HDR flattening if needed, then creates the collection records.

Client code: `lib/upload/client.ts`
Server code: `app/api/image/upload/{presign,confirm}/route.ts`

### Limits & thresholds (`config/site.ts`)

| Setting | Value |
| --- | --- |
| `maxFileSizeMB` | 50 |
| `compressThresholdMB` | 6 (client + server) |
| `uploadTimeoutMs` | 120_000 |
| `presignedUrlExpiresIn` | 300 s |
| `allowedImageTypes` | `image/jpeg`, `image/png`, `image/gif`, `image/webp` |

---

## HDR gain-map handling

### The problem

OpenAI's `gpt-image-2` endpoint rejects iPhone HDR photos with:

> Invalid image file or mode for image N, please check your image file

These look like normal JPEGs to most tools, but carry an auxiliary HDR gain map
that Pillow (which OpenAI uses server-side) doesn't understand. Upstream issue:
https://github.com/python-pillow/Pillow/issues/8036

iPhones emit two different layouts:

1. **iOS 18+ Ultra HDR** — `urn:iso:std:iso:ts:21496` marker in an APP segment
   near the file head.
2. **Older Apple HDR** — MPF appends a second auxiliary JPEG at the *end* of
   the file; the `HDRGainMap` / `apdi` XMP lives inside that tail image's header.

### Detection — `lib/image/hdr-detect.ts`

We sniff both ends of the file for three signatures:

| Signature | Origin |
| --- | --- |
| `urn:iso:std:iso:ts:21496` | ISO 21496-1 gain map (iOS 18+, Android Ultra HDR) |
| `HDRGainMap` | Apple HDR gain map XMP namespace |
| `hdr-gain-map` | Adobe / Google Ultra HDR XMP namespace |

Two entry points:

- `isHdrGainMapJpeg(file: File)` — client-side; reads head (128 KB) and tail
  (512 KB) via `File.slice()`.
- `bufferIsHdrGainMapJpeg(buf: Buffer)` — server-side; scans the whole buffer
  since it's already in memory.

### Re-encoding to SDR

When HDR is detected, the confirm endpoint forces a re-encode regardless of
file size (see `compressImageIfNeeded(..., forceReencode=true)` below).
The gain map is stripped by round-tripping through sharp as a plain JPEG. We
do **not** apply explicit HDR-to-SDR tone mapping — the base SDR layer is
what sharp decodes, and the gain map is simply dropped.

---

## EXIF orientation

iPhone portrait photos are stored with sensor pixels still landscape and an
EXIF `Orientation=6` tag telling viewers to rotate 90°. Because we strip all
EXIF on re-encode (PII / GPS), the rotation *must* be baked into pixels
beforehand, or the photo ships sideways.

Every sharp pipeline starts with `.rotate()` (no args), which applies the
EXIF Orientation tag to pixels and then clears the tag. Applied in:

- `lib/image/compress.ts` — compression pipeline
- `app/api/image/[imageId]/download/route.ts` — format conversion on download
- `lib/kie/client.ts` — KIE format adaptation

The Pillow equivalent (`ImageOps.exif_transpose(img)`) runs in the thumbnail
Lambda (`lambda/image-thumbnail/main.py`).

---

## ICC color profiles

iPhones shoot in **Display P3** by default. If the ICC profile is stripped,
wide-gamut pixels end up tagged as sRGB in color-managed viewers (browsers,
gpt-image-2), causing visible desaturation — reds look duller, greens flatter.

We **preserve the source profile** through every transform rather than
converting between color spaces. No P3 → sRGB remapping is performed.

- Sharp: `.keepIccProfile()` after every codec call (compression, download
  format conversion, KIE format adaptation).
- Pillow: read via `img.info.get("icc_profile")`, pass through to `img.save()`
  in the thumbnail Lambda.

EXIF/IPTC are intentionally dropped on re-encode — GPS and timestamps are PII
we don't want to persist.

---

## Compression — `lib/image/compress.ts`

```ts
compressImageIfNeeded(
  imageBuffer: Buffer,
  contentType: string,
  targetSizeBytes: number,
  forceReencode = false,
): Promise<{ buffer: Buffer; contentType: string }>
```

### Behavior

- If `imageBuffer.length <= targetSizeBytes` **and** `!forceReencode` → return
  the original buffer untouched.
- If under threshold but `forceReencode` (HDR case) → re-encode to JPEG at
  quality 95 to flatten the gain map.
- If over threshold → encode to WebP, walking down the quality ladder until
  the output fits:

  ```
  QUALITY_STEPS = [99, 97, 95]
  ```

  Each step uses `effort: 2` + `smartSubsample: true` — near-lossless at the
  top, perceptually-optimized all the way down. Truly lossless encoding is
  avoided (too slow / memory-heavy for serverless).

- If the last step still exceeds the target, fall back to `quality: 85,
  effort: 4` and ship that.

### Pipeline invariants

Every branch does, in this order:

```ts
sharp(buffer)
  .rotate()               // bake EXIF orientation
  .webp({...}) / .jpeg({quality: 95})
  .keepIccProfile()       // preserve Display P3 etc.
  .toBuffer()
```

---

## Format conversion on download

`app/api/image/[imageId]/download/route.ts` supports three output formats:

| Format | Quality | Options |
| --- | --- | --- |
| `webp` (default) | 95 | `smartSubsample: true` |
| `png` | lossless | — |
| `jpeg` | 95 | — |

Source format is sniffed from magic bytes (JPEG `FF D8`, PNG `89 50 4E 47`,
GIF `47 49 46`, WebP RIFF `52 49 46 46`). If the requested format matches the
source, we stream the original bytes through; otherwise sharp re-encodes with
`.rotate().keepIccProfile()` applied.

---

## Thumbnails — `lambda/image-thumbnail/main.py`

Triggered by S3 `ObjectCreated` on `images/*`. Produces two WebP variants:

| Variant | Longest side | Quality |
| --- | --- | --- |
| `sm` | 384 px | 80 |
| `md` | 1024 px | 82 |

Pipeline (Pillow + pillow-heif):

1. Decode source (HEIC supported via `register_heif_opener`).
2. `ImageOps.exif_transpose()` — bake rotation.
3. `thumbnail(...)` with LANCZOS resampling.
4. Ensure RGB / RGBA mode.
5. Save as WebP with `method=4`, passing through `icc_profile` if present.
6. PUT to `thumbnails/{sm|md}/{imageId}` with
   `Cache-Control: public, max-age=31536000, immutable`.

Skipped: `image/svg+xml`, `image/gif`.
DoS guard: `Image.MAX_IMAGE_PIXELS = 200_000_000`.

### Compression re-triggers the Lambda

When `confirm` overwrites `images/{id}` with a compressed WebP, the S3 event
fires again and thumbnails are regenerated from the compressed file. Keys are
deterministic, so the second run safely overwrites the first. A future cleanup
could fold compression into the Lambda so the original PUT is the only write.

Backfill: `scripts/backfill-thumbnails.ts` — bounded-concurrency fire-and-forget
invocations, idempotent (skips if the thumbnail already exists).

---

## KIE format adaptation — `lib/kie/client.ts`

Some KIE models only accept a subset of formats. Profiles:

| Profile | Allowed extensions |
| --- | --- |
| `default` | `.jpg`, `.jpeg`, `.png` |
| `extended` | `+ .webp` |
| `seedance2` | `+ .bmp`, `.tiff`, `.gif` |

`ensureKieSupportedFormat(url, { allowWebp?, formatProfile? })` checks the
inferred extension; if unsupported, it downloads the image, runs sharp with the
usual `.rotate().jpeg({quality: 90}).keepIccProfile()` pipeline, and re-uploads
to a temp S3 key. Memoized per-request so the same input isn't converted twice.

---

## Video frame thumbnails — `lib/upload/video-client.ts`

Client-side only. Uses a transient `<video>` + `<canvas>` to grab the first
frame (seeked to 0.1 s), exports as JPEG at quality 0.85 via `canvas.toBlob()`,
then feeds it through the normal `uploadImage()` path. EXIF / ICC are
irrelevant here because pixels originate from a video decoder, not a camera.

---

## Library inventory

| Library | Version | Where |
| --- | --- | --- |
| `sharp` | 0.34.5 | `lib/image/compress.ts`, `app/api/image/[imageId]/download/route.ts`, `lib/kie/client.ts` |
| `Pillow` | ≥12.0.0 | `lambda/image-thumbnail/main.py` |
| `pillow-heif` | ≥1.3.0 | `lambda/image-thumbnail/main.py` (HEIC support) |
| Browser Canvas API | — | `lib/upload/video-client.ts` |

Not used: libvips (called directly — sharp wraps it), `image-size`,
`createImageBitmap`, FFmpeg (for still images).

---

## PII / privacy

On every re-encode we **drop EXIF + IPTC** (removes GPS, timestamps, camera
serial, etc.) and **keep the ICC profile** (needed for color accuracy, not PII).
The EXIF Orientation tag is applied to pixels before being dropped, so
orientation is preserved even though the tag is not.

---

## Known gaps

- **No explicit HDR → SDR tone mapping** — the gain map is simply stripped and
  the SDR base layer kept. Good enough for ingest into gpt-image-2, but not a
  perceptually correct HDR down-conversion.
- **No Rec. 2020 / Rec. 2100 handling** beyond "preserve whatever profile is
  embedded."
- **No AVIF support** in `allowedImageTypes`.
- **HEIC reads** work in the Lambda (pillow-heif) but there is no JavaScript-layer
  HEIC → JPEG conversion, so HEIC uploads from the web client would be rejected
  by `validateFile()` against `allowedImageTypes`.
- **No metrics** on HDR detection rate, compression time, or format distribution.
