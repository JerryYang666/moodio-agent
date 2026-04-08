# video-render

Containerized AWS Lambda function that trims and concatenates video segments via FFmpeg.

## Usage

The Lambda receives a JSON event specifying an ordered list of video segments (each referencing an S3 video and a time range). It downloads the source videos from S3, trims each segment, concatenates them in order, and uploads the final output to S3.

## Example Payload

```json
{
  "input_bucket": "my-bucket",
  "segments": [
    { "video_id": "intro", "s3_key": "videos/intro.mp4", "start": 2.0, "end": 7.0 },
    { "video_id": "outro", "s3_key": "videos/outro.mov", "start": 0.0, "end": 5.0 }
  ],
  "output_format": "mp4",
  "output_bucket": "my-bucket",
  "output_key": "renders/final.mp4"
}
```

## Local Testing

```bash
docker build -t video-render .
docker run --rm \
  -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION \
  --entrypoint python video-render main.py '<json_payload>'
```
