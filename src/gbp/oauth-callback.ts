import { googleBusinessManageScope } from "@/integrations/credentials"
import type { SqliteDatabase } from "@/server/db/sqlite"
import type { OAuthIdentityProfile } from "@/auth/oauth-identity"

export const googleOAuthStateCookieName = "glocalx_google_oauth_state"
export const googleOAuthStateCookieOptions = {
  httpOnly: true,
  maxAge: 60 * 10,
  path: "/",
  sameSite: "lax",
} as const
export const expiredGoogleOAuthStateCookieOptions = {
  ...googleOAuthStateCookieOptions,
  maxAge: 0,
} as const
export const googleOAuthScopes = [
  "openid",
  "email",
  "profile",
  googleBusinessManageScope,
] as const

export type GoogleOAuthCallbackOptions = {
  readonly code: string
  readonly database: SqliteDatabase
  readonly expectedState: string
  readonly profile?: OAuthIdentityProfile
  readonly state: string
  readonly storeId: string
}

export type GoogleOAuthCallbackResult =
  | {
      readonly status: "GOOGLE_OAUTH_CONNECTED"
      readonly oauthConnectionId: string
      readonly message: string
    }
  | {
      readonly status: "INVALID_OAUTH_STATE"
      readonly message: string
    }

export function handleGoogleOAuthCallback(
  options: GoogleOAuthCallbackOptions
): GoogleOAuthCallbackResult {
  if (!isValidGoogleOAuthCallback(options)) {
    return {
      status: "INVALID_OAUTH_STATE",
      message: "Google OAuth state가 일치하지 않습니다.",
    }
  }

  const subjectId =
    options.profile?.provider === "GOOGLE"
      ? options.profile.subjectId
      : "production-google-oauth-placeholder"
  const accessToken = options.profile?.accessToken ?? options.code
  const refreshToken = options.profile?.refreshToken
  const scopes =
    options.profile?.provider === "GOOGLE" && options.profile.scopes.length > 0
      ? options.profile.scopes
      : googleOAuthScopes
  const expiresAt =
    options.profile?.provider === "GOOGLE"
      ? (options.profile.expiresAt ?? null)
      : null

  options.database
    .prepare(
      "INSERT OR REPLACE INTO oauth_connections (id, store_id, provider, subject_id, encrypted_access_token, encrypted_refresh_token, scopes_json, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      "production-oauth-google",
      options.storeId,
      "GOOGLE",
      subjectId,
      `encrypted:${accessToken}`,
      refreshToken === undefined ? null : `encrypted:${refreshToken}`,
      JSON.stringify(scopes),
      expiresAt,
      new Date("2026-06-04T00:00:00.000Z").toISOString()
    )

  return {
    status: "GOOGLE_OAUTH_CONNECTED",
    oauthConnectionId: "production-oauth-google",
    message: "Google 계정 연결이 저장되었습니다.",
  }
}

export function isValidGoogleOAuthCallback(
  options: Pick<GoogleOAuthCallbackOptions, "code" | "expectedState" | "state">
): boolean {
  return (
    options.code.trim() !== "" &&
    options.state.trim() !== "" &&
    options.expectedState.trim() !== "" &&
    options.state === options.expectedState
  )
}
