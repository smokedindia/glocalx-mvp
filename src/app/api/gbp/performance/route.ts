import type { NextRequest } from "next/server"

import {
  demoSessionCookieName,
  demoStoreCookieName,
  getStoredSessionFromCookieValues,
  onboardingCompleteCookieName,
} from "@/auth/session"
import { getGbpPerformanceSummary } from "@/gbp/performance"
import { openDatabase } from "@/server/db/sqlite"

function readSession(request: NextRequest) {
  return getStoredSessionFromCookieValues({
    onboardingComplete: request.cookies.get(onboardingCompleteCookieName)
      ?.value,
    storeId: request.cookies.get(demoStoreCookieName)?.value,
    userId: request.cookies.get(demoSessionCookieName)?.value,
  })
}

async function handlePerformanceRequest(request: NextRequest) {
  const session = readSession(request)
  if (session === undefined || !session.onboardingComplete) {
    return Response.json(
      {
        status: "AUTH_REQUIRED",
        message: "로그인이 필요합니다.",
      },
      { status: 401 }
    )
  }

  const database = openDatabase()
  try {
    return Response.json(getGbpPerformanceSummary(database, session.storeId))
  } finally {
    database.close()
  }
}

export async function GET(request: NextRequest) {
  return handlePerformanceRequest(request)
}

export async function POST(request: NextRequest) {
  return handlePerformanceRequest(request)
}
