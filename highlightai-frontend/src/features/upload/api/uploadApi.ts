import { apiClient } from "../../../shared/utils/apiClient";

export interface PresignedUrlResponse {
  videoId: string;
  uploadUrl: string;
  s3Key: string;
  expiresIn: number;
}

export async function getPresignedUploadUrl(
  accessToken: string,
  file: File
): Promise<PresignedUrlResponse> {
  const res = await apiClient.post<PresignedUrlResponse>(
    "/upload/presigned-url",
    {
      filename: file.name,
      contentType: file.type,
      fileSize: file.size,
    },
    {
      headers: {
        Authorization: accessToken,   // FIXED
      },
    }
  );

  return res.data;
}
