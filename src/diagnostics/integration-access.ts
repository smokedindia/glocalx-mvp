import {
  demoSessionCookieName,
  demoStoreCookieName,
  demoStoreId,
  demoUserId,
  onboardingCompleteCookieName,
  type SessionCookieValues,
} from "@/auth/session-cookies"
import type * as SessionModuleImport from "@/auth/session"

import { safeErrorDiagnostics, type SafeErrorDiagnostics } from "./safe-error"

type SessionModule = typeof SessionModuleImport
type SessionVerifier = Pick<SessionModule, "getStoredSessionFromCookieValues">

type CookieReader = {
  readonly get: (
    name: string
  ) => { readonly value: string | undefined } | undefined
}

export type IntegrationDiagnosticsSessionCheck =
  | { readonly status: "verified" }
  | {
      readonly status: "cookie_pair_unverified"
      readonly reason: "session_store_unavailable"
      readonly error: SafeErrorDiagnostics
    }
  | { readonly status: "missing_cookies" }
  | { readonly status: "invalid_session" }
  | {
      readonly status: "session_check_unavailable"
      readonly error: SafeErrorDiagnostics
    }

export type IntegrationDiagnosticsAccess =
  | {
      readonly status: "authenticated"
      readonly sessionCheck: IntegrationDiagnosticsSessionCheck
    }
  | {
      readonly status: "auth_required"
      readonly sessionCheck: IntegrationDiagnosticsSessionCheck
    }

export type IntegrationDiagnosticsAccessOptions = {
  readonly loadSessionModule?: () => Promise<SessionVerifier>
}

export function getIntegrationDiagnosticsCookieValues(
  cookies: CookieReader
): SessionCookieValues {
  return {
    onboardingComplete: cookies.get(onboardingCompleteCookieName)?.value,
    storeId: cookies.get(demoStoreCookieName)?.value,
    userId: cookies.get(demoSessionCookieName)?.value,
  }
}

function hasCookiePair(values: SessionCookieValues): boolean {
  return (
    (values.userId?.trim() ?? "") !== "" &&
    (values.storeId?.trim() ?? "") !== ""
  )
}

function hasDemoCookiePair(values: SessionCookieValues): boolean {
  return (
    values.userId?.trim() === demoUserId &&
    values.storeId?.trim() === demoStoreId
  )
}

export async function getIntegrationDiagnosticsAccess(
  values: SessionCookieValues,
  options: IntegrationDiagnosticsAccessOptions = {}
): Promise<IntegrationDiagnosticsAccess> {
  if (!hasCookiePair(values)) {
    return {
      sessionCheck: { status: "missing_cookies" },
      status: "auth_required",
    }
  }

  const loadSessionModule =
    options.loadSessionModule ?? (() => import("@/auth/session"))

  try {
    const sessionModule = await loadSessionModule()
    const session = sessionModule.getStoredSessionFromCookieValues(values)
    return session === undefined
      ? {
          sessionCheck: { status: "invalid_session" },
          status: "auth_required",
        }
      : {
          sessionCheck: { status: "verified" },
          status: "authenticated",
        }
  } catch (error) {
    const safeError = safeErrorDiagnostics(error, "database_open_failed")
    if (hasDemoCookiePair(values)) {
      return {
        sessionCheck: {
          error: safeError,
          reason: "session_store_unavailable",
          status: "cookie_pair_unverified",
        },
        status: "authenticated",
      }
    }

    return {
      sessionCheck: {
        error: safeError,
        status: "session_check_unavailable",
      },
      status: "auth_required",
    }
  }
}
