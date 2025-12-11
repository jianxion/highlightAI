import { apiClient } from "../../../shared/utils/apiClient";

export interface SignUpPayload {
  email: string;
  password: string;
  name: string;
}

export interface SignInPayload {
  email: string;
  password: string;
}

export interface SignInResponse {
  message: string;
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
}

export const signUpApi = (data: SignUpPayload) =>
  apiClient.post("/auth/signup", data);

export const signInApi = (data: SignInPayload) =>
  apiClient.post<SignInResponse>("/auth/signin", data);
