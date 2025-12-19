import { gql } from "@apollo/client";

/**
 * Fetch feed videos
 */
export const LIST_VIDEOS = gql`
  query ListVideos($limit: Int!) {
    listVideos(limit: $limit) {
      videoId
      filename
      s3Key
      status
      createdAt
      userEmail
      userId
      likeCount
      commentCount
      viewCount
    }
  }
`;

/**
 * Engagement mutations
 */
export const LIKE_VIDEO = gql`
  mutation LikeVideo($videoId: ID!) {
    likeVideo(videoId: $videoId) {
      likeCount
      commentCount
      viewCount
    }
  }
`;

export const UNLIKE_VIDEO = gql`
  mutation UnlikeVideo($videoId: ID!) {
    unlikeVideo(videoId: $videoId) {
      likeCount
      commentCount
      viewCount
    }
  }
`;

export const RECORD_VIEW = gql`
  mutation RecordView($videoId: ID!) {
    recordView(videoId: $videoId) {
      likeCount
      commentCount
      viewCount
    }
  }
`;

/**
 * Comment mutations and queries
 */
export const ADD_COMMENT = gql`
  mutation AddComment($videoId: ID!, $content: String!) {
    addComment(videoId: $videoId, content: $content) {
      commentId
      videoId
      userId
      userEmail
      content
      createdAt
    }
  }
`;

export const GET_COMMENTS = gql`
  query GetVideoComments($videoId: ID!) {
    getVideoComments(videoId: $videoId) {
      commentId
      videoId
      userId
      userEmail
      content
      createdAt
    }
  }
`;

/**
 * Realtime engagement updates (per video)
 */
export const ON_ENGAGEMENT_UPDATE = gql`
  subscription OnEngagementUpdate($videoId: ID!) {
    onVideoEngagementUpdate(videoId: $videoId) {
      likeCount
      commentCount
      viewCount
    }
  }
`;