# Deploying FloodLoop AI on AWS Amplify Hosting (Free Tier)

This guide walks through deploying **FloodLoop AI** as a Next.js SSR app on **AWS Amplify Hosting** using an IAM Compute Role (no hardcoded AWS access keys).

## 1. Create Required AWS Resources

### A. DynamoDB Table (`floodloop-reports`)
```bash
aws dynamodb create-table \
  --table-name floodloop-reports \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region ap-south-1

# Enable 24-hour TTL on expiresAt
aws dynamodb update-time-to-live \
  --table-name floodloop-reports \
  --time-to-live-specification "Enabled=true, AttributeName=expiresAt" \
  --region ap-south-1
```

### B. Private S3 Bucket with CORS for Presigned PUT
```bash
# Replace <unique-bucket-name> with a globally unique name
aws s3api create-bucket \
  --bucket <unique-bucket-name> \
  --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1

# Block all public access (bucket stays private)
aws s3api put-public-access-block \
  --bucket <unique-bucket-name> \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Apply CORS so the browser can upload via presigned PUT URL
aws s3api put-bucket-cors \
  --bucket <unique-bucket-name> \
  --cors-configuration '{
    "CORSRules": [
      {
        "AllowedOrigins": ["https://*.amplifyapp.com", "http://localhost:3000"],
        "AllowedMethods": ["PUT", "GET"],
        "AllowedHeaders": ["*"],
        "MaxAgeSeconds": 3000
      }
    ]
  }'
```

### C. SNS Topic (`floodloop-alerts`) (Optional)
```bash
aws sns create-topic --name floodloop-alerts --region ap-south-1
```
Copy the returned `TopicArn` into `SNS_TOPIC_ARN`.

### D. Bedrock Model Access (if using `ANALYZE_PROVIDER=bedrock`)
1. Open **AWS Console → Amazon Bedrock → Model access**.
2. Request access to a vision-capable model in your region (e.g., **Amazon Nova Lite** `amazon.nova-lite-v1:0` or **Claude 3 Haiku** `anthropic.claude-3-haiku-20240307-v1:0`).
3. Alternatively, set `ANALYZE_PROVIDER=rekognition` (uses `DetectLabels`, no model-access approval required).

---

## 2. Create Least-Privilege IAM Compute Role for Amplify

Create an IAM Role trusted by `amplify.amazonaws.com` (or attach an inline policy to your Amplify SSR Compute Role) with this least-privilege policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DynamoDBReports",
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:Scan",
        "dynamodb:GetItem"
      ],
      "Resource": "arn:aws:dynamodb:ap-south-1:<ACCOUNT_ID>:table/floodloop-reports"
    },
    {
      "Sid": "S3ReportPhotos",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::<unique-bucket-name>/reports/*"
    },
    {
      "Sid": "BedrockAndRekognition",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "rekognition:DetectLabels"
      ],
      "Resource": "*"
    },
    {
      "Sid": "SNSAlerts",
      "Effect": "Allow",
      "Action": [
        "sns:Subscribe",
        "sns:Publish"
      ],
      "Resource": "arn:aws:sns:ap-south-1:<ACCOUNT_ID>:floodloop-alerts"
    }
  ]
}
```

---

## 3. Connect GitHub Repo to AWS Amplify Hosting

1. Open **AWS Console → AWS Amplify → Create new app → Host web app**.
2. Select **GitHub**, authorize, and choose your repository & branch (`main`).
3. Amplify automatically detects **Next.js (SSR)** and uses `amplify.yml` from the repo root.
4. Under **App settings → Compute role**, attach the IAM role created in Step 2.
5. Under **App settings → Environment variables**, add:
   - `ANALYZE_PROVIDER`: `bedrock` (or `rekognition` / `mock`)
   - `BEDROCK_MODEL_ID`: `amazon.nova-lite-v1:0`
   - `AWS_REGION`: `ap-south-1`
   - `DDB_TABLE`: `floodloop-reports`
   - `S3_BUCKET`: `<unique-bucket-name>`
   - `SNS_TOPIC_ARN`: `arn:aws:sns:ap-south-1:<ACCOUNT_ID>:floodloop-alerts`
6. Click **Save and deploy**. Once complete, open your `https://<branch>.<app-id>.amplifyapp.com` URL.
