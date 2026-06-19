import type { NextRequest } from "next/server"

import {
  getIntegrationDiagnosticsAccess,
  getIntegrationDiagnosticsCookieValues,
} from "@/diagnostics/integration-access"
import { getIntegrationRuntimeDiagnostics } from "@/integrations/runtime-diagnostics"

function isAdminDebugEnabled(): boolean {
  const value = process.env["ENABLE_ADMIN_DEBUG"]?.trim().toLowerCase()
  return value === "1" || value === "true"
}

export async function GET(request: NextRequest) {
  if (!isAdminDebugEnabled()) {
    return Response.json({ status: "NOT_FOUND" }, { status: 404 })
  }

  const access = await getIntegrationDiagnosticsAccess(
    getIntegrationDiagnosticsCookieValues(request.cookies)
  )
  if (access.status === "auth_required") {
    return Response.json(
      {
        status: "AUTH_REQUIRED",
        message: "로그인이 필요합니다.",
        sessionCheck: access.sessionCheck,
      },
      { status: 401 }
    )
  }

  return Response.json({
    status: "OK",
    integrations: await getIntegrationRuntimeDiagnostics(process.env),
    sessionCheck: access.sessionCheck,
  })
}
