import { applyMigrations, openDatabase, seedDemoData } from "@/server/db/sqlite"
import type { SqliteDatabase } from "@/server/db/sqlite"

export {
  demoSessionCookieName,
  demoStoreCookieName,
  demoStoreId,
  demoUserId,
  onboardingCompleteCookieName,
  sessionCookieOptions,
} from "./session-cookies"
import { demoStoreId, demoUserId } from "./session-cookies"
import type { SessionCookieValues } from "./session-cookies"

export type DemoSession = {
  readonly userId: string
  readonly storeId: string
  readonly onboardingComplete: boolean
}

export type { SessionCookieValues } from "./session-cookies"

export function ensureDemoOwnerStore(): void {
  const database = openDatabase()
  applyMigrations(database)
  seedDemoData(database)
  database.close()
}

export function createDemoSession(onboardingComplete: boolean): DemoSession {
  return createSession(demoUserId, demoStoreId, onboardingComplete)
}

export function createSession(
  userId: string,
  storeId: string,
  onboardingComplete: boolean
): DemoSession {
  return {
    userId,
    storeId,
    onboardingComplete,
  }
}

export function isDemoSessionValid(sessionCookie: string | undefined): boolean {
  return sessionCookie === demoUserId
}

type SessionRow = {
  readonly count: number
}

type OnboardingStatusRow = {
  readonly onboarding_status: string
}

export function isStoredSessionValid(
  database: SqliteDatabase,
  userId: string,
  storeId: string
): boolean {
  // Cookie pairs are only trusted after the store ownership row matches.
  const row = database
    .prepare(
      "SELECT COUNT(*) AS count FROM stores WHERE id = ? AND owner_user_id = ?"
    )
    .get(storeId, userId) as SessionRow | undefined
  return (row?.count ?? 0) > 0
}

function isStoreOnboardingComplete(
  database: SqliteDatabase,
  storeId: string
): boolean {
  const row = database
    .prepare("SELECT onboarding_status FROM stores WHERE id = ?")
    .get(storeId) as OnboardingStatusRow | undefined
  return row?.onboarding_status === "COMPLETED"
}

export function getStoredSessionFromCookieValues(
  values: SessionCookieValues
): DemoSession | undefined {
  const userId = values.userId?.trim()
  const storeId = values.storeId?.trim()
  if (!userId || !storeId) {
    return undefined
  }

  ensureDemoOwnerStore()
  const database = openDatabase()
  try {
    // The database, not the completion cookie, is the onboarding source of truth.
    if (!isStoredSessionValid(database, userId, storeId)) {
      return undefined
    }

    return createSession(
      userId,
      storeId,
      isStoreOnboardingComplete(database, storeId)
    )
  } finally {
    database.close()
  }
}

export function completeStoredSessionOnboarding(
  values: Pick<SessionCookieValues, "storeId" | "userId">
): boolean {
  const userId = values.userId?.trim()
  const storeId = values.storeId?.trim()
  if (!userId || !storeId) {
    return false
  }

  ensureDemoOwnerStore()
  const database = openDatabase()
  try {
    // Completion writes use the same owner/store check as session reads.
    if (!isStoredSessionValid(database, userId, storeId)) {
      return false
    }

    database
      .prepare("UPDATE stores SET onboarding_status = ? WHERE id = ?")
      .run("COMPLETED", storeId)
    return true
  } finally {
    database.close()
  }
}
