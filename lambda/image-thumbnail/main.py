import io
import json
import logging
from typing import Optional

import boto3
from PIL import Image, ImageOps

try:
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:
    pass

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client("s3")

# Guard against decompression-bomb DoS from malicious uploads while still
# allowing legitimate large photos (e.g. 24MP raw scans).
Image.MAX_IMAGE_PIXELS = 200_000_000

SIZES = {
    "sm": (384, 80),
    "md": (1024, 82),
}

SKIP_CONTENT_TYPES = {"image/svg+xml", "image/gif"}

CACHE_CONTROL = "public, max-age=31536000, immutable"


def _resize_to_webp(img: Image.Image, longest_side: int, quality: int) -> bytes:
    img = img.copy()
    img.thumbnail((longest_side, longest_side), Image.Resampling.LANCZOS)
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA" if "A" in img.mode else "RGB")
    buf = io.BytesIO()
    # Preserve the source ICC profile (iPhones shoot Display P3) so thumbnails
    # match the colour of the full-size image in colour-managed viewers.
    icc_profile = img.info.get("icc_profile")
    save_kwargs = {"format": "WEBP", "quality": quality, "method": 4}
    if icc_profile:
        save_kwargs["icc_profile"] = icc_profile
    img.save(buf, **save_kwargs)
    return buf.getvalue()


def _parse_event(event: dict) -> Optional[dict]:
    if "image_key" in event and "bucket" in event:
        return {
            "bucket": event["bucket"],
            "image_key": event["image_key"],
            "sm_key": event.get("sm_key"),
            "md_key": event.get("md_key"),
        }

    records = event.get("Records")
    if not records:
        return None
    record = records[0]
    bucket = record.get("s3", {}).get("bucket", {}).get("name")
    raw_key = record.get("s3", {}).get("object", {}).get("key")
    if not bucket or not raw_key:
        return None
    from urllib.parse import unquote_plus

    image_key = unquote_plus(raw_key)
    if not image_key.startswith("images/"):
        return None
    image_id = image_key[len("images/") :]
    return {
        "bucket": bucket,
        "image_key": image_key,
        "sm_key": f"thumbnails/sm/{image_id}",
        "md_key": f"thumbnails/md/{image_id}",
    }


def handler(event, _context):
    parsed = _parse_event(event)
    if not parsed:
        return {"statusCode": 400, "body": {"success": False, "error": "unsupported event"}}

    bucket = parsed["bucket"]
    image_key = parsed["image_key"]
    image_id = image_key[len("images/") :] if image_key.startswith("images/") else image_key
    sm_key = parsed["sm_key"] or f"thumbnails/sm/{image_id}"
    md_key = parsed["md_key"] or f"thumbnails/md/{image_id}"

    try:
        head = s3.head_object(Bucket=bucket, Key=image_key)
    except Exception as e:
        logger.exception("HeadObject failed")
        return {"statusCode": 404, "body": {"success": False, "error": f"source missing: {e}"}}

    content_type = (head.get("ContentType") or "").lower()
    if content_type in SKIP_CONTENT_TYPES:
        logger.info("Skipping %s (content-type=%s)", image_key, content_type)
        return {
            "statusCode": 200,
            "body": {"success": True, "skipped": True, "reason": content_type},
        }

    try:
        obj = s3.get_object(Bucket=bucket, Key=image_key)
        src_bytes = obj["Body"].read()
        img = Image.open(io.BytesIO(src_bytes))
        img = ImageOps.exif_transpose(img)
    except Exception as e:
        logger.exception("Failed to decode image %s", image_key)
        return {"statusCode": 500, "body": {"success": False, "error": f"decode failed: {e}"}}

    results = {}
    for variant_name, (longest, quality) in SIZES.items():
        out_key = sm_key if variant_name == "sm" else md_key
        try:
            webp_bytes = _resize_to_webp(img, longest, quality)
            s3.put_object(
                Bucket=bucket,
                Key=out_key,
                Body=webp_bytes,
                ContentType="image/webp",
                CacheControl=CACHE_CONTROL,
            )
            results[variant_name] = {"key": out_key, "size": len(webp_bytes)}
            logger.info(
                "Wrote %s (%d bytes) from %s", out_key, len(webp_bytes), image_key
            )
        except Exception as e:
            logger.exception("Failed variant %s for %s", variant_name, image_key)
            return {
                "statusCode": 500,
                "body": {"success": False, "error": f"{variant_name} failed: {e}"},
            }

    return {
        "statusCode": 200,
        "body": {
            "success": True,
            "source_key": image_key,
            "sm_key": results["sm"]["key"],
            "sm_size_bytes": results["sm"]["size"],
            "md_key": results["md"]["key"],
            "md_size_bytes": results["md"]["size"],
        },
    }


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python main.py '<json_payload>'", file=sys.stderr)
        sys.exit(1)
    result = handler(json.loads(sys.argv[1]), None)
    print(json.dumps(result, indent=2))
