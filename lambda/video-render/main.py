import json
import logging
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client("s3")

TMP = Path("/tmp")
SOURCES_DIR = TMP / "sources"
RENDER_DIR = TMP / "render"

SUPPORTED_INPUT_EXTS = {
    ".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv", ".mpeg", ".mpg",
}

SUPPORTED_OUTPUT_FORMATS = {"mp4", "mov", "mkv", "webm"}

CODEC_MAP = {
    "mp4":  {"vcodec": "libx264", "acodec": "aac",     "extra": ["-movflags", "+faststart"]},
    "mov":  {"vcodec": "libx264", "acodec": "aac",     "extra": ["-movflags", "+faststart"]},
    "mkv":  {"vcodec": "libx264", "acodec": "aac",     "extra": []},
    "webm": {"vcodec": "libvpx-vp9", "acodec": "libopus", "extra": []},
}


def _probe_duration(path: str) -> float:
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        path,
    ]
    logger.info("Probing: %s", " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed (exit {result.returncode}): {result.stderr}")
    return float(result.stdout.strip())


def _trim_segment(source_path: str, start: float, end: float, output_path: str) -> None:
    duration = end - start
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start),
        "-i", source_path,
        "-t", str(duration),
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-c:a", "aac", "-b:a", "192k",
        "-f", "mpegts",
        output_path,
    ]
    logger.info("Trimming: %s", " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg trim failed (exit {result.returncode}): {result.stderr}")


def _concatenate(segment_paths: list[str], output_path: str, output_format: str) -> None:
    codec = CODEC_MAP[output_format]
    codec_flags = [
        "-c:v", codec["vcodec"],
        "-c:a", codec["acodec"],
        *codec["extra"],
    ]

    if len(segment_paths) == 1:
        cmd = [
            "ffmpeg", "-y",
            "-i", segment_paths[0],
            *codec_flags,
            output_path,
        ]
    else:
        concat_list = str(RENDER_DIR / "concat_list.txt")
        with open(concat_list, "w") as f:
            for p in segment_paths:
                f.write(f"file '{p}'\n")
        cmd = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", concat_list,
            *codec_flags,
            output_path,
        ]

    logger.info("Concatenating: %s", " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg concat failed (exit {result.returncode}): {result.stderr}")


def _generate_output_key(output_format: str) -> str:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"renders/{ts}.{output_format}"


def handler(event, context):
    # --- Validate input ---
    input_bucket = event.get("input_bucket")
    if not input_bucket:
        return {"statusCode": 400, "body": {"success": False, "error": "input_bucket is required"}}

    segments = event.get("segments")
    if not segments or not isinstance(segments, list):
        return {"statusCode": 400, "body": {"success": False, "error": "segments must be a non-empty list"}}

    output_format = event.get("output_format", "mp4")
    if output_format not in SUPPORTED_OUTPUT_FORMATS:
        return {
            "statusCode": 400,
            "body": {"success": False, "error": f"output_format must be one of {sorted(SUPPORTED_OUTPUT_FORMATS)}"},
        }

    for i, seg in enumerate(segments):
        for field in ("video_id", "s3_key", "start", "end"):
            if field not in seg:
                return {"statusCode": 400, "body": {"success": False, "error": f"segment[{i}] missing required field: {field}"}}

        start, end = float(seg["start"]), float(seg["end"])
        if start < 0:
            return {"statusCode": 400, "body": {"success": False, "error": f"segment[{i}] start must be >= 0"}}
        if end <= start:
            return {"statusCode": 400, "body": {"success": False, "error": f"segment[{i}] end must be > start"}}

        ext = PurePosixPath(seg["s3_key"]).suffix.lower()
        if ext and ext not in SUPPORTED_INPUT_EXTS:
            return {
                "statusCode": 400,
                "body": {"success": False, "error": f"segment[{i}] unsupported input extension '{ext}'. Supported: {sorted(SUPPORTED_INPUT_EXTS)}"},
            }

    output_bucket = event.get("output_bucket", input_bucket)
    output_key = event.get("output_key") or _generate_output_key(output_format)

    try:
        SOURCES_DIR.mkdir(parents=True, exist_ok=True)
        RENDER_DIR.mkdir(parents=True, exist_ok=True)

        # --- Download unique source videos ---
        s3_key_to_local: dict[str, str] = {}
        download_index = 0
        for seg in segments:
            s3_key = seg["s3_key"]
            if s3_key in s3_key_to_local:
                continue
            ext = PurePosixPath(s3_key).suffix.lower() or ".mp4"
            local_path = str(SOURCES_DIR / f"src_{download_index:04d}{ext}")
            download_index += 1
            logger.info("Downloading s3://%s/%s -> %s", input_bucket, s3_key, local_path)
            s3.download_file(input_bucket, s3_key, local_path)
            s3_key_to_local[s3_key] = local_path

        # --- Trim each segment ---
        trimmed_paths: list[str] = []
        for i, seg in enumerate(segments):
            source_path = s3_key_to_local[seg["s3_key"]]
            start = float(seg["start"])
            end = float(seg["end"])

            duration = _probe_duration(source_path)
            if start >= duration:
                raise RuntimeError(
                    f"segment[{i}] (video_id={seg['video_id']}): start {start}s >= source duration {duration}s"
                )

            seg_output = str(RENDER_DIR / f"seg_{i:04d}.ts")
            _trim_segment(source_path, start, end, seg_output)
            trimmed_paths.append(seg_output)

        # --- Concatenate ---
        final_output = str(RENDER_DIR / f"output.{output_format}")
        _concatenate(trimmed_paths, final_output, output_format)

        # --- Upload ---
        output_size = os.path.getsize(final_output)
        logger.info("Uploading %d bytes to s3://%s/%s", output_size, output_bucket, output_key)
        s3.upload_file(final_output, output_bucket, output_key)

        return {
            "statusCode": 200,
            "body": {
                "success": True,
                "output_bucket": output_bucket,
                "output_key": output_key,
                "output_size_bytes": output_size,
                "segment_count": len(segments),
            },
        }

    except Exception as e:
        logger.exception("Failed to render video")
        return {"statusCode": 500, "body": {"success": False, "error": str(e)}}

    finally:
        for d in (SOURCES_DIR, RENDER_DIR):
            if d.exists():
                shutil.rmtree(d, ignore_errors=True)


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python main.py '<json_payload>'", file=sys.stderr)
        sys.exit(1)
    result = handler(json.loads(sys.argv[1]), None)
    print(json.dumps(result, indent=2))
