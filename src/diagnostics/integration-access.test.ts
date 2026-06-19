import { describe, expect, it } from "vitest"

import { demoStoreId, demoUserId } from "@/auth/session-cookies"

import { getIntegrationDiagnosticsAccess } from "./integration-access"

describe("getIntegrationDiagnosticsAccess", () => {
  it("requires cookies before checking the session store", async () => {
    const access = await getIntegrationDiagnosticsAccess({
      onboardingComplete: undefined,
      storeId: undefined,
      userId: undefined,
    })

    expect(access).toEqual({
      sessionCheck: { status: "missing_cookies" },
      status: "auth_required",
    })
  })

  it("allows demo cookie diagnostics when the SQLite-backed session store is unavailable", async () => {
    const access = await getIntegrationDiagnosticsAccess(
      {
        onboardingComplete: undefined,
        storeId: demoStoreId,
        userId: demoUserId,
      },
      {
        loadSessionModule: async () => {
          throw new Error("Cannot find module '/private/better_sqlite3.node'")
        },
      }
    )

    expect(access).toEqual({
      sessionCheck: {
        error: {
          category: "module_not_found",
          code: null,
          name: "Error",
        },
        reason: "session_store_unavailable",
        status: "cookie_pair_unverified",
      },
      status: "authenticated",
    })
    expect(JSON.stringify(access)).not.toContain("/private")
  })

  it("rejects non-demo cookies when the session store cannot be checked", async () => {
    const access = await getIntegrationDiagnosticsAccess(
      {
        onboardingComplete: undefined,
        storeId: "other-store",
        userId: "other-user",
      },
      {
        loadSessionModule: async () => {
          throw new Error("Cannot find module '/private/better_sqlite3.node'")
        },
      }
    )

    expect(access).toMatchObject({
      sessionCheck: {
        error: {
          category: "module_not_found",
          name: "Error",
        },
        status: "session_check_unavailable",
      },
      status: "auth_required",
    })
    expect(JSON.stringify(access)).not.toContain("/private")
  })
})
