import { getDemoSession } from "@/auth/server-session"
import { getGbpPerformanceDashboard } from "@/gbp/performance"
import { createIntegrationAdapters } from "@/integrations"
import { openDatabase } from "@/server/db/sqlite"

export async function GET() {
  const session = await getDemoSession()
  if (session === undefined) {
    return Response.json(
      {
        message: "로그인이 필요합니다.",
        status: "UNAUTHENTICATED",
      },
      { status: 401 }
    )
  }

  const database = openDatabase()
  try {
    const adapters = createIntegrationAdapters({ database })
    const result = await getGbpPerformanceDashboard({
      adapters,
      database,
      storeId: session.storeId,
    })
    const status =
      result.status === "READY" ? 200 : result.status === "BLOCKED" ? 409 : 502
    return Response.json(result, { status })
  } finally {
    database.close()
  }
}
