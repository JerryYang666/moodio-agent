import json
import logging
import os
import shutil
import subprocess
from pathlib import Path

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client("s3")

TMP = Path("/tmp")
WORK_DIR = TMP / "frame-extract"


def handler(event, context):
    bucket = event.get("bucket")
    video_key = event.get("video_key")
    output_key = event.get("output_key")

    if not bucket:
        return {"statusCode": 400, "body": {"success": False, "error": "bucket is required"}}
    if not video_key:
        return {"statusCode": 400, "body": {"success": False, "error": "video_key is required"}}
    if not output_key:
        return {"statusCode": 400, "body": {"success": False, "error": "output_key is required"}}

    try:
        WORK_DIR.mkdir(parents=True, exist_ok=True)

        local_video = str(WORK_DIR / "input.mp4")
        local_frame = str(WORK_DIR / "frame.jpg")

        logger.info("Downloading s3://%s/%s -> %s", bucket, video_key, local_video)
        s3.download_file(bucket, video_key, local_video)

        cmd = [
            "ffmpeg", "-y",
            "-i", local_video,
            "-frames:v", "1",
            "-q:v", "2",
            local_frame,
        ]
        logger.info("Extracting first frame: %s", " ".join(cmd))
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg failed (exit {result.returncode}): {result.stderr}")

        output_size = os.path.getsize(local_frame)
        logger.info("Uploading %d bytes to s3://%s/%s", output_size, bucket, output_key)
        s3.upload_file(
            local_frame,
            bucket,
            output_key,
            ExtraArgs={"ContentType": "image/jpeg"},
        )

        return {
            "statusCode": 200,
            "body": {
                "success": True,
                "output_key": output_key,
                "output_size_bytes": output_size,
            },
        }

    except Exception as e:
        logger.exception("Failed to extract first frame")
        return {"statusCode": 500, "body": {"success": False, "error": str(e)}}

    finally:
        if WORK_DIR.exists():
            shutil.rmtree(WORK_DIR, ignore_errors=True)


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python main.py '<json_payload>'", file=sys.stderr)
        sys.exit(1)
    result = handler(json.loads(sys.argv[1]), None)
    print(json.dumps(result, indent=2))
