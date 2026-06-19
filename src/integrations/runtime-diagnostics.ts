import { googleOAuthScopes } from "@/gbp/oauth-callback"
import { missingTokenEncryptionEnvVars } from "@/auth/token-encryption"
import {
  safeEnvValueDiagnostics,
  safeRedirectUriDiagnostics,
  type SafeEnvValueDiagnostics,
  type SafeRedirectUriDiagnostics,
} from "@/diagnostics/safe-env"
import {
  getSqliteReadinessDiagnostics,
  type SqliteReadinessDiagnostics,
} from "@/server/db/sqlite-diagnostics"

import { missingEnvVars } from "./credentials"
import type { AdapterEnvironment, IntegrationMode } from "./contracts"
import { naverEnvVars } from "./production"

type SafeModeDiagnostics = SafeEnvValueDiagnostics & {
  readonly recognizedValue: IntegrationMode | "other" | "missing"
}

type SafeCredentialsDiagnostics<EnvVar extends string> = Readonly<
  Record<EnvVar, SafeEnvValueDiagnostics>
>

export type NaverSearchSelection =
  | "production"
  | "stub-mode"
  | "stub-preview-missing-credentials"

type GoogleOAuthSelection =
  | "credentialed-oauth"
  | "demo-fallback-missing-credentials"
  | "production-blocked-by-credentials"
  | "stub-mode"

type KakaoOAuthSelection =
  | "blocked-by-credentials"
  | "credentialed-oauth"
  | "stub-mode"

type GoogleBusinessDiagnostics = {
  readonly credentials: SafeCredentialsDiagnostics<
    (typeof googleCredentialEnvVars)[number]
  >
  readonly localAccessConfig: SafeCredentialsDiagnostics<GoogleLocalAccessEnvVar>
  readonly missingEnvVars: readonly string[]
  readonly oauthRedirectUri: SafeRedirectUriDiagnostics
  readonly ownerAccess: {
    readonly businessManageScopeIncluded: boolean
    readonly oauthScopeCount: number
    readonly requiresOwnerOAuthConnection: true
  }
  readonly selectedOAuth: GoogleOAuthSelection
}

type KakaoOAuthDiagnostics = {
  readonly clientSecret: SafeEnvValueDiagnostics
  readonly missingEnvVars: readonly string[]
  readonly redirectUri: SafeRedirectUriDiagnostics
  readonly restApiKey: SafeEnvValueDiagnostics
  readonly selectedOAuth: KakaoOAuthSelection
}

type NaverDiagnostics = {
  readonly credentials: SafeCredentialsDiagnostics<
    (typeof naverEnvVars)[number]
  >
  readonly missingEnvVars: readonly string[]
  readonly selectedSearch: NaverSearchSelection
}

type TokenStorageDiagnostics = {
  readonly encryptionKey: SafeEnvValueDiagnostics
  readonly missingEnvVars: readonly string[]
}

type GoogleLocalAccessEnvVar =
  | "GOOGLE_BUSINESS_ACCOUNT_ID"
  | "TEST_GBP_LOCATION_ID"

export type IntegrationRuntimeDiagnostics = {
  readonly adapterMode: IntegrationMode
  readonly appIntegrationMode: SafeModeDiagnostics
  readonly googleBusiness: GoogleBusinessDiagnostics
  readonly kakaoOAuth: KakaoOAuthDiagnostics
  readonly missingNaverEnvVars: readonly string[]
  readonly naver: NaverDiagnostics
  readonly naverCredentials: Readonly<
    Record<(typeof naverEnvVars)[number], SafeEnvValueDiagnostics>
  >
  readonly nodeEnv: string | null
  readonly selectedNaverSearch: NaverSearchSelection
  readonly sqlite: SqliteReadinessDiagnostics
  readonly tokenStorage: TokenStorageDiagnostics
  readonly vercelEnv: string | null
}

export type IntegrationRuntimeDiagnosticsOptions = {
  readonly getSqliteReadiness?: (
    env: AdapterEnvironment
  ) => Promise<SqliteReadinessDiagnostics>
}

const googleCredentialEnvVars = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
] as const
const kakaoRequiredEnvVars = ["KAKAO_REST_API_KEY"] as const

function safeModeDiagnostics(env: AdapterEnvironment): SafeModeDiagnostics {
  const valueDiagnostics = safeEnvValueDiagnostics(env, "APP_INTEGRATION_MODE")
  const trimmedMode = env["APP_INTEGRATION_MODE"]?.trim()
  const recognizedValue =
    trimmedMode === "production" || trimmedMode === "stub"
      ? trimmedMode
      : valueDiagnostics.configured
        ? "other"
        : "missing"

  return {
    ...valueDiagnostics,
    recognizedValue,
  }
}

function selectedGoogleOAuth(
  env: AdapterEnvironment,
  missingGoogleEnvVars: readonly string[]
): GoogleOAuthSelection {
  if (env["APP_INTEGRATION_MODE"] === "stub") {
    return "stub-mode"
  }

  if (missingGoogleEnvVars.length === 0) {
    return "credentialed-oauth"
  }

  return env["APP_INTEGRATION_MODE"] === "production"
    ? "production-blocked-by-credentials"
    : "demo-fallback-missing-credentials"
}

function selectedKakaoOAuth(
  env: AdapterEnvironment,
  missingKakaoEnvVars: readonly string[]
): KakaoOAuthSelection {
  if (env["APP_INTEGRATION_MODE"] === "stub") {
    return "stub-mode"
  }

  return missingKakaoEnvVars.length === 0
    ? "credentialed-oauth"
    : "blocked-by-credentials"
}

export function shouldUsePreviewNaverStub(env: AdapterEnvironment): boolean {
  return (
    (env["VERCEL_ENV"] === "preview" || env["VERCEL_ENV"] === "development") &&
    missingEnvVars(env, naverEnvVars).length > 0
  )
}

export async function getIntegrationRuntimeDiagnostics(
  env: AdapterEnvironment,
  options: IntegrationRuntimeDiagnosticsOptions = {}
): Promise<IntegrationRuntimeDiagnostics> {
  const adapterMode =
    env["APP_INTEGRATION_MODE"] === "production" ? "production" : "stub"
  const missingGoogleEnvVars = missingEnvVars(env, googleCredentialEnvVars)
  const missingKakaoEnvVars = missingEnvVars(env, kakaoRequiredEnvVars)
  const missingNaverEnvVars = missingEnvVars(env, naverEnvVars)
  const previewNaverStub = shouldUsePreviewNaverStub(env)
  const selectedNaverSearch =
    adapterMode !== "production"
      ? "stub-mode"
      : previewNaverStub
        ? "stub-preview-missing-credentials"
        : "production"
  const naverCredentials = {
    NAVER_CLIENT_ID: safeEnvValueDiagnostics(env, "NAVER_CLIENT_ID"),
    NAVER_CLIENT_SECRET: safeEnvValueDiagnostics(env, "NAVER_CLIENT_SECRET"),
  }
  const getSqliteReadiness =
    options.getSqliteReadiness ?? getSqliteReadinessDiagnostics

  return {
    adapterMode,
    appIntegrationMode: safeModeDiagnostics(env),
    googleBusiness: {
      credentials: {
        GOOGLE_CLIENT_ID: safeEnvValueDiagnostics(env, "GOOGLE_CLIENT_ID"),
        GOOGLE_CLIENT_SECRET: safeEnvValueDiagnostics(
          env,
          "GOOGLE_CLIENT_SECRET"
        ),
      },
      localAccessConfig: {
        GOOGLE_BUSINESS_ACCOUNT_ID: safeEnvValueDiagnostics(
          env,
          "GOOGLE_BUSINESS_ACCOUNT_ID"
        ),
        TEST_GBP_LOCATION_ID: safeEnvValueDiagnostics(
          env,
          "TEST_GBP_LOCATION_ID"
        ),
      },
      missingEnvVars: missingGoogleEnvVars,
      oauthRedirectUri: safeRedirectUriDiagnostics(
        env,
        "GOOGLE_REDIRECT_URI",
        "/api/auth/google/callback"
      ),
      ownerAccess: {
        businessManageScopeIncluded: googleOAuthScopes.includes(
          "https://www.googleapis.com/auth/business.manage"
        ),
        oauthScopeCount: googleOAuthScopes.length,
        requiresOwnerOAuthConnection: true,
      },
      selectedOAuth: selectedGoogleOAuth(env, missingGoogleEnvVars),
    },
    kakaoOAuth: {
      clientSecret: safeEnvValueDiagnostics(env, "KAKAO_CLIENT_SECRET"),
      missingEnvVars: missingKakaoEnvVars,
      redirectUri: safeRedirectUriDiagnostics(
        env,
        "KAKAO_REDIRECT_URI",
        "/api/auth/kakao/callback"
      ),
      restApiKey: safeEnvValueDiagnostics(env, "KAKAO_REST_API_KEY"),
      selectedOAuth: selectedKakaoOAuth(env, missingKakaoEnvVars),
    },
    missingNaverEnvVars,
    naver: {
      credentials: naverCredentials,
      missingEnvVars: missingNaverEnvVars,
      selectedSearch: selectedNaverSearch,
    },
    naverCredentials,
    nodeEnv: env["NODE_ENV"] ?? null,
    selectedNaverSearch,
    sqlite: await getSqliteReadiness(env),
    tokenStorage: {
      encryptionKey: safeEnvValueDiagnostics(env, "TOKEN_ENCRYPTION_KEY"),
      missingEnvVars: missingTokenEncryptionEnvVars(env),
    },
    vercelEnv: env["VERCEL_ENV"] ?? null,
  }
}
