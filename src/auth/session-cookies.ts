export const demoSessionCookieName = "glocalx_demo_session"
export const demoStoreCookieName = "glocalx_demo_store"
export const onboardingCompleteCookieName = "glocalx_onboarding_complete"

export const demoUserId = "demo-owner"
export const demoStoreId = "demo-store"

export type SessionCookieValues = {
  readonly onboardingComplete: string | undefined
  readonly storeId: string | undefined
  readonly userId: string | undefined
}

export const sessionCookieOptions = {
  httpOnly: true,
  maxAge: 60 * 60 * 24 * 7,
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
} as const
