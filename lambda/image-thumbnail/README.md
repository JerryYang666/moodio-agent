# Image Thumbnail Lambda

Generates two WebP thumbnail variants from an S3 image:

- `thumbnails/sm/{id}` — longest side 384 px, quality 80 (used in the production-table grid, ~10-20 KB)
- `thumbnails/md/{id}` — longest side 1024 px, quality 82 (used in the asset-picker modal, ~50-120 KB)

The original `images/{id}` is never modified. EXIF orientation is applied via `ImageOps.exif_transpose`. HEIC is supported via `pillow-heif`. SVG and GIF are skipped (return 200 with `skipped: true`).

## Invocation

This Lambda accepts both S3 event notifications and direct invocations.

**S3 event notification** (the primary production trigger):

Configure a bucket-level notification `s3:ObjectCreated:*` filtered to prefix `images/` that invokes this Lambda. The handler parses the event, derives `thumbnails/sm/{id}` and `thumbnails/md/{id}` keys from the source key, and writes both variants.

**Direct invoke** (used by the backfill script):

```json
{
  "bucket": "my-bucket",
  "image_key": "images/abc-123",
  "sm_key": "thumbnails/sm/abc-123",
  "md_key": "thumbnails/md/abc-123"
}
```

Response shape:

```json
{
  "statusCode": 200,
  "body": {
    "success": true,
    "source_key": "images/abc-123",
    "sm_key": "thumbnails/sm/abc-123",
    "sm_size_bytes": 14823,
    "md_key": "thumbnails/md/abc-123",
    "md_size_bytes": 87210
  }
}
```

## Local testing

```bash
uv sync
python main.py '{"bucket": "my-bucket", "image_key": "images/test", "sm_key": "thumbnails/sm/test", "md_key": "thumbnails/md/test"}'
```

## Generating uv.lock

Before the first Docker build, generate the lockfile:

```bash
cd lambda/image-thumbnail
uv lock
git add uv.lock
```

## Deployment

Docker image is built and pushed to ECR via the `build-image-thumbnail` GitHub Actions workflow on pushes to `lambda/image-thumbnail/**`.
