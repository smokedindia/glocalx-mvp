import { randomUUID } from "node:crypto"

import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { openDatabase } from "@/server/db/sqlite"

import {
  demoSessionCookieName,
  demoStoreCookieName,
  demoStoreId,
  demoUserId,
  ensureDemoOwnerStore,
  onboardingCompleteCookieName,
  sessionCookieOptions
} from "./session"

export type LoginProvider = "email" | "google" | "kakao"

type OAuthProvider = "google" | "kakao"

type OAuthStateConfig = {
  readonly cookieName: string
  readonly provider: OAuthProvider
}

export type AuthProfile = {
  readonly displayName: string
  readonly email: string
  readonly provider: LoginProvider
  readonly subjectId: string
}

export const googleLoginStateCookieName = "glocalx_google_login_state"
export const kakaoLoginStateCookieName = "glocalx_kakao_login_state"

const oauthStateCookieOptions = {
  ...sessionCookieOptions,
  maxAge: 60 * 10
} as const

const placeholderPrefixes = ["replace-with-", "your-"]

export function isConfiguredSecret(value: string | undefined): boolean {
  if (value === undefined) {
    return false
  }

  const trimmedValue = value.trim()
  if (trimmedValue.length === 0) {
    return false
  }

  return !placeholderPrefixes.some((prefix) =>
    trimmedValue.toLowerCase().startsWith(prefix)
  )
}

export function getConfiguredEnv(
  primaryName: string,
  fallbackName?: string
): string | undefined {
  const primaryValue = process.env[primaryName]
  if (isConfiguredSecret(primaryValue)) {
    return primaryValue.trim()
  }

  if (fallbackName === undefined) {
    return undefined
  }

  const fallbackValue = process.env[fallbackName]
  return isConfiguredSecret(fallbackValue) ? fallbackValue.trim() : undefined
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function getRequestOrigin(request: NextRequest): string {
  return request.nextUrl.origin
}

export function getAuthRedirectUri(
  request: NextRequest,
  envName: string,
  callbackPath: string,
  fallbackEnvName?: string
): string {
  const configuredRedirectUri = getConfiguredEnv(envName, fallbackEnvName)
  if (configuredRedirectUri !== undefined) {
    return configuredRedirectUri
  }

  return new URL(callbackPath, getRequestOrigin(request)).toString()
}

export function createLoginRedirect(request: NextRequest): NextResponse {
  ensureDemoOwnerStore()

  const onboardingComplete =
    request.cookies.get(onboardingCompleteCookieName)?.value === "true"
  const response = new NextResponse(null, {
    headers: {
      Location: onboardingComplete ? "/app" : "/onboarding"
    },
    status: 303
  })

  response.cookies.set(demoSessionCookieName, demoUserId, sessionCookieOptions)
  response.cookies.set(demoStoreCookieName, demoStoreId, sessionCookieOptions)

  return response
}

export function recordAuthenticatedProfile(profile: AuthProfile): void {
  ensureDemoOwnerStore()
  const database = openDatabase()
  try {
    database
      .prepare(
        "INSERT INTO audit_logs (id, store_id, actor_user_id, action, idempotency_key, redacted_payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        randomUUID(),
        demoStoreId,
        demoUserId,
        "auth.login",
        null,
        JSON.stringify({
          displayName: profile.displayName,
          email: profile.email,
          provider: profile.provider,
          subjectId: profile.subjectId
        }),
        new Date().toISOString()
      )
  } finally {
    database.close()
  }
}

export function createLoginErrorRedirect(
  provider: LoginProvider
): NextResponse {
  return new NextResponse(null, {
    headers: {
      Location: `/?auth_error=${provider}`
    },
    status: 303
  })
}

export function createOAuthState(provider: OAuthProvider): string {
  return `${provider}:${randomUUID()}`
}

export function setOAuthStateCookie(
  response: NextResponse,
  config: OAuthStateConfig,
  state: string
): void {
  response.cookies.set(config.cookieName, state, oauthStateCookieOptions)
}

export function clearOAuthStateCookie(
  response: NextResponse,
  config: OAuthStateConfig
): void {
  response.cookies.set(config.cookieName, "", {
    ...oauthStateCookieOptions,
    maxAge: 0
  })
}

export function isOAuthStateValid(
  request: NextRequest,
  config: OAuthStateConfig,
  state: string
): boolean {
  return (
    state.startsWith(`${config.provider}:`) &&
    request.cookies.get(config.cookieName)?.value === state
  )
}

export const googleOAuthStateConfig = {
  cookieName: googleLoginStateCookieName,
  provider: "google"
} as const satisfies OAuthStateConfig

export const kakaoOAuthStateConfig = {
  cookieName: kakaoLoginStateCookieName,
  provider: "kakao"
} as const satisfies OAuthStateConfig
