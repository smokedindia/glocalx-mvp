import { describe, expect, it } from "vitest"

import type { SqliteReadinessDiagnostics } from "@/server/db/sqlite-diagnostics"

import { getIntegrationRuntimeDiagnostics } from "./runtime-diagnostics"

const sqliteReadinessFixture: SqliteReadinessDiagnostics = {
  database: {
    missingRequiredTables: [],
    migrationsApplied: true,
    openable: true,
    requiredTableCount: 17,
    sqliteVersion: "3.test",
  },
  databasePath: {
    env: {
      configured: false,
      length: 0,
      placeholder: false,
    },
    resolvedKind: "workspace-default",
  },
  nativeModule: {
    importable: true,
  },
}

describe("getIntegrationRuntimeDiagnostics", () => {
  it("reports stub mode without exposing secret values", async () => {
    const diagnostics = await getIntegrationRuntimeDiagnostics(
      {},
      { getSqliteReadiness: async () => sqliteReadinessFixture }
    )

    expect(diagnostics).toMatchObject({
      adapterMode: "stub",
      appIntegrationMode: {
        configured: false,
        length: 0,
        placeholder: false,
        recognizedValue: "missing",
      },
      googleBusiness: {
        missingEnvVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
        selectedOAuth: "demo-fallback-missing-credentials",
      },
      kakaoOAuth: {
        missingEnvVars: ["KAKAO_REST_API_KEY"],
        selectedOAuth: "blocked-by-credentials",
      },
      missingNaverEnvVars: ["NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET"],
      selectedNaverSearch: "stub-mode",
    })
  })

  it("reports preview fallback when production mode lacks Naver credentials", async () => {
    const diagnostics = await getIntegrationRuntimeDiagnostics(
      {
        APP_INTEGRATION_MODE: "production",
        VERCEL_ENV: "preview",
      },
      { getSqliteReadiness: async () => sqliteReadinessFixture }
    )

    expect(diagnostics.adapterMode).toBe("production")
    expect(diagnostics.selectedNaverSearch).toBe(
      "stub-preview-missing-credentials"
    )
    expect(diagnostics.googleBusiness.selectedOAuth).toBe(
      "production-blocked-by-credentials"
    )
    expect(diagnostics.missingNaverEnvVars).toEqual([
      "NAVER_CLIENT_ID",
      "NAVER_CLIENT_SECRET",
    ])
  })

  it("reports production readiness without leaking configured credential values", async () => {
    const diagnostics = await getIntegrationRuntimeDiagnostics(
      {
        APP_INTEGRATION_MODE: "production",
        GOOGLE_BUSINESS_ACCOUNT_ID: "accounts/123456",
        GOOGLE_CLIENT_ID: "test-google-client-id",
        GOOGLE_CLIENT_SECRET: "test-google-client-secret",
        GOOGLE_REDIRECT_URI: "https://example.com/api/auth/google/callback",
        KAKAO_CLIENT_SECRET: "test-kakao-client-secret",
        KAKAO_REDIRECT_URI: "https://example.com/api/auth/kakao/callback",
        KAKAO_REST_API_KEY: "test-kakao-rest-api-key",
        NAVER_CLIENT_ID: "test-client-id",
        NAVER_CLIENT_SECRET: "test-client-secret",
        TEST_GBP_LOCATION_ID: "locations/987654",
        TOKEN_ENCRYPTION_KEY: "replace-with-32-byte-base64-key",
        VERCEL_ENV: "preview",
      },
      { getSqliteReadiness: async () => sqliteReadinessFixture }
    )

    expect(diagnostics.selectedNaverSearch).toBe("production")
    expect(diagnostics.missingNaverEnvVars).toEqual([])
    expect(diagnostics.googleBusiness.missingEnvVars).toEqual([])
    expect(diagnostics.googleBusiness.oauthRedirectUri).toMatchObject({
      callbackPathMatches: true,
      configured: true,
      https: true,
      loopbackHost: false,
      validUrl: true,
    })
    expect(diagnostics.googleBusiness.ownerAccess).toEqual({
      businessManageScopeIncluded: true,
      oauthScopeCount: 4,
      requiresOwnerOAuthConnection: true,
    })
    expect(diagnostics.kakaoOAuth.missingEnvVars).toEqual([])
    expect(diagnostics.kakaoOAuth.selectedOAuth).toBe("credentialed-oauth")
    expect(diagnostics.naverCredentials.NAVER_CLIENT_ID).toEqual({
      configured: true,
      length: 14,
      placeholder: false,
    })
    const serializedDiagnostics = JSON.stringify(diagnostics)
    expect(serializedDiagnostics).not.toContain("test-client-id")
    expect(serializedDiagnostics).not.toContain("test-client-secret")
    expect(serializedDiagnostics).not.toContain("test-google-client-id")
    expect(serializedDiagnostics).not.toContain("test-google-client-secret")
    expect(serializedDiagnostics).not.toContain("test-kakao-rest-api-key")
    expect(serializedDiagnostics).not.toContain("test-kakao-client-secret")
    expect(serializedDiagnostics).not.toContain("accounts/123456")
    expect(serializedDiagnostics).not.toContain("locations/987654")
  })
})
