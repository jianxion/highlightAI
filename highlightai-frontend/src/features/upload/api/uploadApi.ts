import { apiClient } from "../../../shared/utils/apiClient";

export interface PresignedUrlResponse {
  videoId: string;
  uploadUrl: string;
  s3Key: string;
  expiresIn: number;
}

export async function getPresignedUploadUrl(
  idToken: string,
  file: File
): Promise<PresignedUrlResponse> {
  console.log("=== Requesting Presigned URL ===");
  console.log("ID Token (first 50 chars):", idToken.substring(0, 50) + "...");
  console.log("File details:", {
    name: file.name,
    type: file.type,
    size: file.size,
  });

  const requestBody = {
    filename: file.name,
    contentType: file.type,
    fileSize: file.size,
  };

  const headers = {
    Authorization: `Bearer ${idToken}`,
  };

  console.log("Request body:", requestBody);
  console.log("Headers:", {
    Authorization: `Bearer ${idToken.substring(0, 20)}...`,
    "Content-Type": "application/json",
  });

  try {
    const res = await apiClient.post<PresignedUrlResponse>(
      "/upload/presigned-url",
      requestBody,
      { headers }
    );

    console.log("API Response:", {
      status: res.status,
      videoId: res.data.videoId,
      hasUploadUrl: !!res.data.uploadUrl,
    });

    return res.data;
  } catch (err: any) {
    console.error("API Error:", {
      message: err.message,
      status: err.response?.status,
      statusText: err.response?.statusText,
      data: err.response?.data,
      headers: err.response?.headers,
    });
    throw err;
  }
}