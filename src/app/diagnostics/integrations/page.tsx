import { cookies } from "next/headers"

import {
  getIntegrationDiagnosticsAccess,
  getIntegrationDiagnosticsCookieValues,
} from "@/diagnostics/integration-access"
import { getIntegrationRuntimeDiagnostics } from "@/integrations/runtime-diagnostics"

function isAdminDebugEnabled(): boolean {
  const value = process.env["ENABLE_ADMIN_DEBUG"]?.trim().toLowerCase()
  return value === "1" || value === "true"
}

function payloadJson(payload: unknown): string {
  return JSON.stringify(payload, null, 2)
}

export default async function IntegrationDiagnosticsPage() {
  const cookieStore = await cookies()
  const access = await getIntegrationDiagnosticsAccess(
    getIntegrationDiagnosticsCookieValues(cookieStore)
  )

  const payload = !isAdminDebugEnabled()
    ? { status: "NOT_FOUND" }
    : access.status === "auth_required"
      ? {
          status: "AUTH_REQUIRED",
          message: "로그인이 필요합니다.",
          sessionCheck: access.sessionCheck,
        }
      : {
          status: "OK",
          integrations: await getIntegrationRuntimeDiagnostics(process.env),
          sessionCheck: access.sessionCheck,
        }

  return (
    <main className="min-h-screen bg-white p-6 text-sm text-[var(--ink)]">
      <pre className="whitespace-pre-wrap break-words">
        {payloadJson(payload)}
      </pre>
    </main>
  )
}
