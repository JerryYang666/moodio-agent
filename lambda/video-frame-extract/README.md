# Video Frame Extract Lambda

AWS Lambda function that extracts the first frame from a video stored in S3 and uploads it as a JPEG image.

## Payload

```json
{
  "bucket": "my-bucket",
  "video_key": "videos/abc-123",
  "output_key": "images/def-456"
}
```

## Response

```json
{
  "statusCode": 200,
  "body": {
    "success": true,
    "output_key": "images/def-456",
    "output_size_bytes": 45678
  }
}
```

## Local Testing

```bash
python main.py '{"bucket": "my-bucket", "video_key": "videos/test.mp4", "output_key": "images/test-frame"}'
```

## Deployment

The Docker image is built and pushed to ECR via the `build-video-frame-extract` GitHub Actions workflow on pushes to `lambda/video-frame-extract/**`..
