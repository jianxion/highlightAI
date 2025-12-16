import { gql } from "@apollo/client";

/**
 * For now we reuse listVideos
 * Later you can replace with listVideosByUser(userId)
 */
export const LIST_VIDEOS_FOR_PROFILE = gql`
  query ListVideosForProfile($limit: Int!) {
    listVideos(limit: $limit) {
      videoId
      filename
      status
      createdAt
      likeCount
      commentCount
      viewCount
    }
  }
`;
