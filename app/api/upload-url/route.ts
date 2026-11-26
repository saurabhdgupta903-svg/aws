import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4MB

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      contentType?: string;
      fileSize?: number;
    };

    const contentType = body.contentType?.trim().toLowerCase() ?? "";
    const ext = ALLOWED_TYPES[contentType];
    if (!ext) {
      return NextResponse.json(
        {
          error:
            "Unsupported contentType. Allowed: image/jpeg, image/png, image/webp.",
        },
        { status: 400 }
      );
    }

    if (
      typeof body.fileSize !== "number" ||
      body.fileSize <= 0 ||
      body.fileSize > MAX_FILE_BYTES
    ) {
      return NextResponse.json(
        { error: "File size must be between 1 byte and 4MB." },
        { status: 413 }
      );
    }

    const bucket = process.env.S3_BUCKET?.trim();
    if (!bucket) {
      return NextResponse.json({
        uploadUrl: null,
        photoKey: null,
        mockUpload: true,
      });
    }

    const region = process.env.AWS_REGION?.trim() || "ap-south-1";
    const photoKey = `reports/${Date.now()}-${randomUUID()}.${ext}`;

    const s3 = new S3Client({ region });
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: photoKey,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 120 });

    return NextResponse.json({
      uploadUrl,
      photoKey,
      mockUpload: false,
    });
  } catch {
    return NextResponse.json({
      uploadUrl: null,
      photoKey: null,
      mockUpload: true,
    });
  }
}
