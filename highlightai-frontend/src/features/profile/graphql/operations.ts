import { gql } from "@apollo/client";

/**
 * Get videos for a specific user
 */
export const GET_USER_VIDEOS = gql`
  query GetUserVideos($userId: String!) {
    getUserVideos(userId: $userId) {
      videoId
      userId
      userEmail
      filename
      s3Key
      status
      createdAt
      likeCount
      commentCount
      viewCount
    }
  }
`;