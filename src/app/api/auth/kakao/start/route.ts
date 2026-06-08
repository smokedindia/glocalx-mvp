import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import {
  createLoginErrorRedirect,
  createOAuthState,
  getAuthRedirectUri,
  getConfiguredEnv,
  kakaoOAuthStateConfig,
  setOAuthStateCookie
} from "@/auth/login"

export async function POST(request: NextRequest) {
  const clientId = getConfiguredEnv("KAKAO_CLIENT_ID")

  if (clientId === undefined) {
    return createLoginErrorRedirect("kakao")
  }

  const redirectUri = getAuthRedirectUri(
    request,
    "KAKAO_REDIRECT_URI",
    "/api/auth/kakao/callback"
  )
  const state = createOAuthState("kakao")
  const authorizationUrl = new URL("https://kauth.kakao.com/oauth/authorize")
  authorizationUrl.searchParams.set("client_id", clientId)
  authorizationUrl.searchParams.set("redirect_uri", redirectUri)
  authorizationUrl.searchParams.set("response_type", "code")
  authorizationUrl.searchParams.set("state", state)

  const response = new NextResponse(null, {
    headers: {
      Location: authorizationUrl.toString()
    },
    status: 303
  })
  setOAuthStateCookie(response, kakaoOAuthStateConfig, state)

  return response
}
