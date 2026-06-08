import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { POST as emailLogin } from "@/app/api/auth/email/start/route"
import { GET as googleCallback } from "@/app/api/auth/google/callback/route"
import { POST as googleStart } from "@/app/api/auth/google/start/route"
import { GET as kakaoCallback } from "@/app/api/auth/kakao/callback/route"
import { POST as kakaoStart } from "@/app/api/auth/kakao/start/route"
import { resetDatabaseFile } from "@/server/db/sqlite"
import { googleLoginStateCookieName, kakaoLoginStateCookieName } from "./login"
import { demoSessionCookieName } from "./session"

const originalEnv = { ...process.env }

function createPostRequest(url: string, body?: URLSearchParams): NextRequest {
  if (body === undefined) {
    return new NextRequest(url, { method: "POST" })
  }

  return new NextRequest(url, {
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST"
  })
}

describe("landing login routes", () => {
  beforeEach(() => {
    process.env = { ...originalEnv }
    resetDatabaseFile()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    process.env = { ...originalEnv }
  })

  it("redirects Kakao login to Kakao OAuth with a state cookie", async () => {
    process.env["KAKAO_CLIENT_ID"] = "kakao-rest-api-key"

    const response = await kakaoStart(
      createPostRequest("http://127.0.0.1:3000/api/auth/kakao/start")
    )

    const location = response.headers.get("location")
    expect(response.status).toBe(303)
    expect(location).toContain("https://kauth.kakao.com/oauth/authorize")
    expect(location).toContain("client_id=kakao-rest-api-key")
    expect(location).toContain(
      "redirect_uri=http%3A%2F%2F127.0.0.1%3A3000%2Fapi%2Fauth%2Fkakao%2Fcallback"
    )
    expect(response.headers.get("set-cookie")).toContain(
      "glocalx_kakao_login_state="
    )
  })

  it("redirects Google login to Google OAuth with OpenID scopes", async () => {
    process.env["GOOGLE_LOGIN_CLIENT_ID"] = "google-login-client"
    process.env["GOOGLE_LOGIN_CLIENT_SECRET"] = "google-login-secret"

    const response = await googleStart(
      createPostRequest("http://127.0.0.1:3000/api/auth/google/start")
    )

    const location = response.headers.get("location")
    expect(response.status).toBe(303)
    expect(location).toContain("https://accounts.google.com/o/oauth2/v2/auth")
    expect(location).toContain("client_id=google-login-client")
    expect(location).toContain("scope=openid+email+profile")
    expect(response.headers.get("set-cookie")).toContain(
      "glocalx_google_login_state="
    )
  })

  it("rejects invalid email login without creating a session", async () => {
    const response = await emailLogin(
      createPostRequest(
        "http://127.0.0.1:3000/api/auth/email/start",
        new URLSearchParams({ email: "not-an-email" })
      )
    )

    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe("/?auth_error=email")
    expect(response.headers.get("set-cookie") ?? "").not.toContain(
      demoSessionCookieName
    )
  })

  it("creates the current MVP session for a valid email login", async () => {
    const response = await emailLogin(
      createPostRequest(
        "http://127.0.0.1:3000/api/auth/email/start",
        new URLSearchParams({ email: "owner@store.com" })
      )
    )

    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe("/onboarding")
    expect(response.headers.get("set-cookie")).toContain(
      `${demoSessionCookieName}=demo-owner`
    )
  })

  it("creates a session after a successful Google OAuth callback", async () => {
    process.env["GOOGLE_LOGIN_CLIENT_ID"] = "google-login-client"
    process.env["GOOGLE_LOGIN_CLIENT_SECRET"] = "google-login-secret"
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ access_token: "google-access-token" })
        )
        .mockResolvedValueOnce(
          Response.json({
            email: "owner@example.com",
            name: "Owner",
            sub: "google-subject"
          })
        )
    )

    const response = await googleCallback(
      new NextRequest(
        "http://127.0.0.1:3000/api/auth/google/callback?code=code&state=google%3Atest-state",
        {
          headers: {
            cookie: `${googleLoginStateCookieName}=google:test-state`
          }
        }
      )
    )

    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe("/onboarding")
    expect(response.headers.get("set-cookie")).toContain(
      `${demoSessionCookieName}=demo-owner`
    )
  })

  it("creates a session after a successful Kakao OAuth callback", async () => {
    process.env["KAKAO_CLIENT_ID"] = "kakao-rest-api-key"
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ access_token: "kakao-access-token" })
        )
        .mockResolvedValueOnce(
          Response.json({
            id: 12345,
            kakao_account: {
              email: "owner@kakao.example",
              profile: { nickname: "Kakao Owner" }
            }
          })
        )
    )

    const response = await kakaoCallback(
      new NextRequest(
        "http://127.0.0.1:3000/api/auth/kakao/callback?code=code&state=kakao%3Atest-state",
        {
          headers: {
            cookie: `${kakaoLoginStateCookieName}=kakao:test-state`
          }
        }
      )
    )

    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe("/onboarding")
    expect(response.headers.get("set-cookie")).toContain(
      `${demoSessionCookieName}=demo-owner`
    )
  })
})
