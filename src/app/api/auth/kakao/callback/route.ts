import type { NextRequest } from "next/server"

import {
  clearOAuthStateCookie,
  createLoginErrorRedirect,
  createLoginRedirect,
  getAuthRedirectUri,
  getConfiguredEnv,
  isOAuthStateValid,
  kakaoOAuthStateConfig,
  recordAuthenticatedProfile
} from "@/auth/login"
import { exchangeKakaoCode, fetchKakaoUserInfo } from "@/auth/oauth"

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code") ?? ""
  const state = request.nextUrl.searchParams.get("state") ?? ""
  const clientId = getConfiguredEnv("KAKAO_CLIENT_ID")
  const clientSecret = getConfiguredEnv("KAKAO_CLIENT_SECRET")

  if (
    code.length === 0 ||
    !isOAuthStateValid(request, kakaoOAuthStateConfig, state) ||
    clientId === undefined
  ) {
    return createLoginErrorRedirect("kakao")
  }

  const redirectUri = getAuthRedirectUri(
    request,
    "KAKAO_REDIRECT_URI",
    "/api/auth/kakao/callback"
  )
  const token = await exchangeKakaoCode({
    clientId,
    ...(clientSecret === undefined ? {} : { clientSecret }),
    code,
    redirectUri
  })
  if (token === undefined) {
    return createLoginErrorRedirect("kakao")
  }

  const userInfo = await fetchKakaoUserInfo(token.accessToken)
  if (userInfo === undefined) {
    return createLoginErrorRedirect("kakao")
  }

  recordAuthenticatedProfile({
    displayName: userInfo.displayName,
    email: userInfo.email,
    provider: "kakao",
    subjectId: userInfo.subjectId
  })

  const response = createLoginRedirect(request)
  clearOAuthStateCookie(response, kakaoOAuthStateConfig)
  return response
}
