import { Buffer } from "node:buffer"

import { z } from "zod"

import { adapterBusinessProfileCandidateSchema } from "@/domain/schemas"
import type { AdapterBusinessProfileCandidate } from "@/domain/schemas"
import { locationStatusSchema } from "@/domain/location-status"
import type { LocationStatus } from "@/domain/location-status"
import { googleBusinessManageScope } from "@/integrations/credentials"
import type {
  AdapterFetch,
  HttpRequestSpec,
  IntegrationAdapters,
} from "@/integrations/contracts"
import type { SqliteDatabase } from "@/server/db/sqlite"

import { shouldScheduleGbpFollowUp } from "./state-machine"

const locationSpecBodySchema = z
  .object({
    status: locationStatusSchema,
    name: z.string().optional(),
  })
  .passthrough()

const accountListBodySchema = z
  .object({
    accounts: z
      .array(
        z
          .object({
            name: z.string(),
            accountName: z.string().optional(),
          })
          .passthrough()
      )
      .default([]),
  })
  .passthrough()

const categoriesBodySchema = z
  .object({
    categories: z
      .array(
        z
          .object({
            categoryId: z.string(),
            displayName: z.string().optional(),
          })
          .passthrough()
      )
      .default([]),
  })
  .passthrough()

const googleLocationsBodySchema = z
  .object({
    googleLocations: z.array(z.record(z.string(), z.unknown())).default([]),
  })
  .passthrough()

const oauthConnectionRowSchema = z.object({
  encrypted_access_token: z.string(),
  encrypted_refresh_token: z.string().nullable(),
  subject_id: z.string(),
})

const confirmedExtractionRowSchema = z.object({
  candidate_json: z.string(),
  id: z.string(),
})

const storeProfileRowSchema = z.object({
  address: z.string(),
  category: z.string(),
  hours: z.string().nullable(),
  name: z.string(),
  phone: z.string().nullable(),
})

export type GbpSetupMode = "stub" | "production"

export type GbpSetupResult =
  | {
      readonly status: "VERIFICATION_PENDING" | "VERIFIED" | "CREATE_REQUESTED"
      readonly googleLocationId: string
      readonly oauthConnectionId: string
      readonly gbpLocationId: string
      readonly followUpJobId?: string
      readonly auditLogId: string
      readonly message: string
    }
  | {
      readonly status: "CLAIM_REQUIRED"
      readonly googleLocationId: string
      readonly requestAdminRightsUrl: string
      readonly followUpRequired: boolean
      readonly message: string
    }
  | {
      readonly status: "BLOCKED_BY_CREDENTIALS"
      readonly missingEnvVars: readonly string[]
      readonly message: string
    }
  | {
      readonly status: "MANUAL_FOLLOW_UP"
      readonly message: string
    }

export type SetupGoogleBusinessProfileOptions = {
  readonly adapters: IntegrationAdapters
  readonly database: SqliteDatabase
  readonly confirmedExtractionId?: string
  readonly fetchImpl?: AdapterFetch
  readonly idempotencyKey?: string
  readonly mode: GbpSetupMode
  readonly storeId: string
}

export type BuildClaimRequiredResultOptions = {
  readonly googleLocationId: string
  readonly requestAdminRightsUrl: string
}

function addDays(date: Date, days: number): string {
  const nextDate = new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
  return nextDate.toISOString()
}

function locationStatusFromSpecBody(body: unknown): LocationStatus {
  const parsed = locationSpecBodySchema.safeParse(body)
  if (!parsed.success) {
    return "VERIFICATION_PENDING"
  }
  return parsed.data.status
}

function googleLocationIdFromSpecBody(body: unknown): string {
  const parsed = locationSpecBodySchema.safeParse(body)
  return parsed.success && parsed.data.name !== undefined
    ? parsed.data.name
    : "locations/stub-created"
}

function decryptTokenPlaceholder(encryptedToken: string): string {
  return encryptedToken.replace(/^encrypted:/, "")
}

function stableSetupId(prefix: string, value: string): string {
  return `${prefix}-${Buffer.from(value).toString("base64url").slice(0, 24)}`
}

function readLatestGoogleOAuthConnection(
  database: SqliteDatabase,
  storeId: string
): z.infer<typeof oauthConnectionRowSchema> | undefined {
  const row = database
    .prepare(
      "SELECT encrypted_access_token, encrypted_refresh_token, subject_id FROM oauth_connections WHERE store_id = ? AND provider = 'GOOGLE' ORDER BY created_at DESC LIMIT 1"
    )
    .get(storeId)
  return row === undefined ? undefined : oauthConnectionRowSchema.parse(row)
}

function readStoreProfile(
  database: SqliteDatabase,
  storeId: string
): AdapterBusinessProfileCandidate | undefined {
  const row = database
    .prepare(
      "SELECT name, address, phone, category, hours FROM stores WHERE id = ?"
    )
    .get(storeId)
  if (row === undefined) {
    return undefined
  }
  const profile = storeProfileRowSchema.parse(row)
  return {
    source: "MANUAL",
    name: profile.name,
    address: profile.address,
    category: profile.category,
    ...(profile.phone === null ? {} : { phone: profile.phone }),
    ...(profile.hours === null ? {} : { hours: profile.hours }),
    missingFields: [
      ...(profile.phone === null ? (["phone"] as const) : []),
      ...(profile.hours === null ? (["hours"] as const) : []),
    ],
  }
}

function readConfirmedProfile(
  options: SetupGoogleBusinessProfileOptions
): AdapterBusinessProfileCandidate | undefined {
  const row =
    options.confirmedExtractionId === undefined
      ? options.database
          .prepare(
            "SELECT id, candidate_json FROM business_profile_extractions WHERE store_id = ? AND status = 'CONFIRMED' ORDER BY created_at DESC LIMIT 1"
          )
          .get(options.storeId)
      : options.database
          .prepare(
            "SELECT id, candidate_json FROM business_profile_extractions WHERE id = ? AND store_id = ? AND status = 'CONFIRMED'"
          )
          .get(options.confirmedExtractionId, options.storeId)
  if (row === undefined) {
    return readStoreProfile(options.database, options.storeId)
  }

  const parsedRow = confirmedExtractionRowSchema.parse(row)
  const parsedJson: unknown = JSON.parse(parsedRow.candidate_json)
  const candidate = adapterBusinessProfileCandidateSchema.safeParse(parsedJson)
  if (candidate.success) {
    return candidate.data
  }

  return readStoreProfile(options.database, options.storeId)
}

async function executeSpecBody(
  spec: HttpRequestSpec,
  fetchImpl: AdapterFetch | undefined
): Promise<unknown> {
  if (spec.url.startsWith("stub://")) {
    return spec.body
  }

  const response = await (fetchImpl ?? fetch)(spec.url, {
    ...(spec.body === undefined ? {} : { body: JSON.stringify(spec.body) }),
    headers: {
      Accept: "application/json",
      ...(spec.body === undefined
        ? {}
        : { "Content-Type": "application/json;charset=utf-8" }),
      ...spec.headers,
    },
    method: spec.method,
  })
  if (!response.ok) {
    throw new Error(
      `Google Business Profile request failed with ${response.status}.`
    )
  }
  return response.json()
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined
}

function readRequestAdminRightsUrl(
  googleLocations: readonly Record<string, unknown>[]
): string | undefined {
  for (const location of googleLocations) {
    const direct =
      readString(location["requestAdminRightsUrl"]) ??
      readString(location["requestAdminRightsUri"])
    if (direct !== undefined) {
      return direct
    }
  }
  return undefined
}

function readGoogleLocationName(
  googleLocations: readonly Record<string, unknown>[]
): string {
  for (const location of googleLocations) {
    const name =
      readString(location["name"]) ?? readString(location["locationName"])
    if (name !== undefined) {
      return name
    }
  }
  return "googleLocations/matched"
}

function parseSimpleHours(
  hours: string | undefined
): Readonly<Record<string, unknown>> | undefined {
  if (hours === undefined) {
    return undefined
  }
  const match = hours.match(
    /(\d{1,2}):(\d{2})\s*(?:~|-|–|—)\s*(\d{1,2}):(\d{2})/
  )
  if (match === null) {
    return undefined
  }
  const [, openHour, openMinute, closeHour, closeMinute] = match
  const days = [
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
  ]
  return {
    periods: days.map((day) => ({
      openDay: day,
      openTime: {
        hours: Number(openHour),
        minutes: Number(openMinute),
      },
      closeDay: day,
      closeTime: {
        hours: Number(closeHour),
        minutes: Number(closeMinute),
      },
    })),
  }
}

function googleCategoryIdFromProfile(
  profile: AdapterBusinessProfileCandidate
): string | undefined {
  const value = (
    profile as AdapterBusinessProfileCandidate & {
      readonly googleCategoryId?: string
    }
  ).googleCategoryId
  return readString(value)
}

function buildGoogleLocationPayload(
  profile: AdapterBusinessProfileCandidate,
  categoryId: string
): Readonly<Record<string, unknown>> {
  return {
    title: profile.name,
    storefrontAddress: {
      revision: 0,
      regionCode: "KR",
      languageCode: "ko",
      addressLines: [profile.address],
    },
    categories: {
      primaryCategory: {
        categoryId,
      },
    },
    ...(profile.phone === undefined
      ? {}
      : { phoneNumbers: { primaryPhone: profile.phone } }),
    ...(profile.websiteUri === undefined
      ? {}
      : { websiteUri: profile.websiteUri }),
    ...(parseSimpleHours(profile.hours) === undefined
      ? {}
      : { regularHours: parseSimpleHours(profile.hours) }),
    ...(profile.latitude === undefined || profile.longitude === undefined
      ? {}
      : {
          latlng: {
            latitude: profile.latitude,
            longitude: profile.longitude,
          },
        }),
  }
}

function scheduleFollowUpIfNeeded(
  database: SqliteDatabase,
  adapters: IntegrationAdapters,
  storeId: string,
  status: LocationStatus
): string | undefined {
  if (!shouldScheduleGbpFollowUp(status)) {
    return undefined
  }

  const jobId = "setup-gbp-follow-up"
  database
    .prepare(
      "INSERT OR REPLACE INTO job_runs (id, store_id, job_type, status, idempotency_key, run_after, attempts, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      jobId,
      storeId,
      "GBP_FOLLOW_UP",
      "SCHEDULED",
      "setup-gbp-follow-up-key",
      addDays(adapters.clock.now(), 7),
      0,
      adapters.clock.now().toISOString(),
      adapters.clock.now().toISOString()
    )
  return jobId
}

function persistSetupRecords(
  options: SetupGoogleBusinessProfileOptions,
  status: LocationStatus,
  subjectId: string
): GbpSetupResult {
  const createdAt = options.adapters.clock.now().toISOString()
  const accountId = "setup-gbp-account"
  const oauthConnectionId = "setup-oauth-google"
  const gbpLocationId = "setup-gbp-location"
  const googleLocationId = "locations/stub-created"
  const auditLogId = "setup-gbp-audit"

  options.database
    .prepare(
      "INSERT OR REPLACE INTO oauth_connections (id, store_id, provider, subject_id, encrypted_access_token, encrypted_refresh_token, scopes_json, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      oauthConnectionId,
      options.storeId,
      "GOOGLE",
      subjectId,
      "encrypted:stub-access-token",
      "encrypted:stub-refresh-token",
      JSON.stringify([googleBusinessManageScope]),
      "2026-06-05T00:00:00.000Z",
      createdAt
    )

  options.database
    .prepare(
      "INSERT OR REPLACE INTO gbp_accounts (id, store_id, google_account_id, account_name, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(
      accountId,
      options.storeId,
      "accounts/stub",
      "Stub GBP Account",
      createdAt
    )

  options.database
    .prepare(
      "INSERT OR REPLACE INTO gbp_locations (id, store_id, gbp_account_id, google_location_id, status, request_admin_rights_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      gbpLocationId,
      options.storeId,
      accountId,
      googleLocationId,
      status,
      null,
      createdAt,
      createdAt
    )

  const followUpJobId = scheduleFollowUpIfNeeded(
    options.database,
    options.adapters,
    options.storeId,
    status
  )

  options.database
    .prepare(
      "INSERT OR REPLACE INTO audit_logs (id, store_id, actor_user_id, action, idempotency_key, redacted_payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      auditLogId,
      options.storeId,
      "demo-owner",
      "gbp.setup.stub",
      "setup-gbp-audit-key",
      JSON.stringify({ accessToken: "[REDACTED]", status }),
      createdAt
    )

  const resultStatus =
    status === "VERIFIED" || status === "CREATE_REQUESTED"
      ? status
      : "VERIFICATION_PENDING"
  const message =
    status === "VERIFIED"
      ? "Google 비즈니스 프로필이 연결되었습니다."
      : "Google 비즈니스 프로필 생성 요청이 접수되었습니다. 인증 완료까지 기다려주세요."

  if (followUpJobId !== undefined) {
    return {
      status: resultStatus,
      googleLocationId,
      oauthConnectionId,
      gbpLocationId,
      followUpJobId,
      auditLogId,
      message,
    }
  }

  return {
    status: resultStatus,
    googleLocationId,
    oauthConnectionId,
    gbpLocationId,
    auditLogId,
    message,
  }
}

function persistGbpRegistrationRecords(
  options: SetupGoogleBusinessProfileOptions,
  input: {
    readonly accountName: string
    readonly accountDisplayName: string
    readonly action: string
    readonly googleLocationId: string
    readonly redactedPayload: Readonly<Record<string, unknown>>
    readonly requestAdminRightsUrl?: string
    readonly status: LocationStatus
  }
): GbpSetupResult {
  const createdAt = options.adapters.clock.now().toISOString()
  const accountId = stableSetupId("setup-gbp-account", input.accountName)
  const gbpLocationId = stableSetupId(
    "setup-gbp-location",
    `${options.storeId}:${input.googleLocationId}`
  )
  const auditLogId = stableSetupId(
    "setup-gbp-audit",
    options.idempotencyKey ?? `${options.storeId}:${input.action}`
  )

  options.database
    .prepare(
      "INSERT OR REPLACE INTO gbp_accounts (id, store_id, google_account_id, account_name, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(
      accountId,
      options.storeId,
      input.accountName,
      input.accountDisplayName,
      createdAt
    )

  options.database
    .prepare(
      "INSERT OR REPLACE INTO gbp_locations (id, store_id, gbp_account_id, google_location_id, status, request_admin_rights_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      gbpLocationId,
      options.storeId,
      accountId,
      input.googleLocationId,
      input.status,
      input.requestAdminRightsUrl ?? null,
      createdAt,
      createdAt
    )

  const followUpJobId = scheduleFollowUpIfNeeded(
    options.database,
    options.adapters,
    options.storeId,
    input.status
  )

  options.database
    .prepare(
      "INSERT OR REPLACE INTO audit_logs (id, store_id, actor_user_id, action, idempotency_key, redacted_payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      auditLogId,
      options.storeId,
      "demo-owner",
      input.action,
      options.idempotencyKey ?? auditLogId,
      JSON.stringify(input.redactedPayload),
      createdAt
    )

  if (input.status === "CLAIM_REQUIRED") {
    return {
      status: "CLAIM_REQUIRED",
      googleLocationId: input.googleLocationId,
      requestAdminRightsUrl: input.requestAdminRightsUrl ?? "",
      followUpRequired: true,
      message:
        "이미 소유자가 있는 Google 비즈니스 프로필입니다. 관리자 권한 요청을 진행해주세요.",
    }
  }

  if (followUpJobId !== undefined) {
    return {
      status:
        input.status === "VERIFIED" || input.status === "CREATE_REQUESTED"
          ? input.status
          : "VERIFICATION_PENDING",
      googleLocationId: input.googleLocationId,
      oauthConnectionId: "production-oauth-google",
      gbpLocationId,
      followUpJobId,
      auditLogId,
      message:
        "Google 비즈니스 프로필 생성 요청이 접수되었습니다. 인증 완료까지 기다려주세요.",
    }
  }

  return {
    status:
      input.status === "VERIFIED" || input.status === "CREATE_REQUESTED"
        ? input.status
        : "VERIFICATION_PENDING",
    googleLocationId: input.googleLocationId,
    oauthConnectionId: "production-oauth-google",
    gbpLocationId,
    auditLogId,
    message:
      input.status === "VERIFIED"
        ? "Google 비즈니스 프로필이 연결되었습니다."
        : "Google 비즈니스 프로필 생성 요청이 접수되었습니다. 인증 완료까지 기다려주세요.",
  }
}

export function buildClaimRequiredResult(
  options: BuildClaimRequiredResultOptions
): GbpSetupResult {
  return {
    status: "CLAIM_REQUIRED",
    googleLocationId: options.googleLocationId,
    requestAdminRightsUrl: options.requestAdminRightsUrl,
    followUpRequired: true,
    message:
      "이미 소유자가 있는 Google 비즈니스 프로필입니다. 관리자 권한 요청을 진행해주세요.",
  }
}

async function setupProductionGoogleBusinessProfile(
  options: SetupGoogleBusinessProfileOptions
): Promise<GbpSetupResult> {
  const profile = readConfirmedProfile(options)
  if (profile === undefined) {
    return {
      status: "MANUAL_FOLLOW_UP",
      message: "확정된 매장 정보를 먼저 저장해주세요.",
    }
  }

  const oauthConnection = readLatestGoogleOAuthConnection(
    options.database,
    options.storeId
  )
  if (oauthConnection === undefined) {
    return {
      status: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: ["GOOGLE_OAUTH_CONNECTION"],
      message: "Google Business Profile 권한이 있는 계정 연결이 필요합니다.",
    }
  }

  const accessToken = decryptTokenPlaceholder(
    oauthConnection.encrypted_access_token
  )
  const accountResult = options.adapters.gbpAccountManagement.listAccounts({
    accessToken,
    pageSize: 20,
  })
  if (accountResult.kind === "blocked_by_credentials") {
    return {
      status: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: accountResult.missingEnvVars,
      message: "Google Business Profile 인증 정보가 설정되지 않았습니다.",
    }
  }

  const accountBody = accountListBodySchema.parse(
    await executeSpecBody(accountResult.value, options.fetchImpl)
  )
  const account = accountBody.accounts[0]
  if (account === undefined) {
    return {
      status: "MANUAL_FOLLOW_UP",
      message:
        "연결된 Google 계정에서 사용할 수 있는 GBP 계정을 찾지 못했습니다.",
    }
  }

  let googleCategoryId = googleCategoryIdFromProfile(profile)
  if (googleCategoryId === undefined) {
    const categoryResult =
      options.adapters.gbpBusinessInformation.listCategories({
        accessToken,
        filter: `displayName=${profile.category}`,
        languageCode: "ko",
        pageSize: 10,
        regionCode: "KR",
        view: "BASIC",
      })
    if (categoryResult.kind === "blocked_by_credentials") {
      return {
        status: "BLOCKED_BY_CREDENTIALS",
        missingEnvVars: categoryResult.missingEnvVars,
        message: "Google Business Profile 인증 정보가 설정되지 않았습니다.",
      }
    }
    const categoryBody = categoriesBodySchema.parse(
      await executeSpecBody(categoryResult.value, options.fetchImpl)
    )
    googleCategoryId = categoryBody.categories[0]?.categoryId
  }

  if (googleCategoryId === undefined) {
    return {
      status: "MANUAL_FOLLOW_UP",
      message: "Google 비즈니스 카테고리를 확인한 뒤 다시 시도해주세요.",
    }
  }

  const locationPayload = buildGoogleLocationPayload(profile, googleCategoryId)
  const searchResult =
    options.adapters.gbpBusinessInformation.searchGoogleLocations({
      accessToken,
      location: locationPayload,
      resultCount: 5,
    })
  if (searchResult.kind === "blocked_by_credentials") {
    return {
      status: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: searchResult.missingEnvVars,
      message: "Google Business Profile 인증 정보가 설정되지 않았습니다.",
    }
  }

  const googleLocationBody = googleLocationsBodySchema.parse(
    await executeSpecBody(searchResult.value, options.fetchImpl)
  )
  const requestAdminRightsUrl = readRequestAdminRightsUrl(
    googleLocationBody.googleLocations
  )
  if (requestAdminRightsUrl !== undefined) {
    return persistGbpRegistrationRecords(options, {
      accountDisplayName: account.accountName ?? account.name,
      accountName: account.name,
      action: "gbp.setup.claim_required",
      googleLocationId: readGoogleLocationName(
        googleLocationBody.googleLocations
      ),
      redactedPayload: {
        accessToken: "[REDACTED]",
        profileName: profile.name,
        requestAdminRightsUrl,
      },
      requestAdminRightsUrl,
      status: "CLAIM_REQUIRED",
    })
  }

  const requestId =
    options.idempotencyKey ??
    stableSetupId("gbp-create-request", `${options.storeId}:${profile.name}`)
  const validateResult = options.adapters.gbpBusinessInformation.createLocation(
    {
      accessToken,
      accountName: account.name,
      location: locationPayload,
      requestId,
      validateOnly: true,
    }
  )
  if (validateResult.kind === "blocked_by_credentials") {
    return {
      status: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: validateResult.missingEnvVars,
      message: "Google Business Profile 인증 정보가 설정되지 않았습니다.",
    }
  }
  await executeSpecBody(validateResult.value, options.fetchImpl)

  const createResult = options.adapters.gbpBusinessInformation.createLocation({
    accessToken,
    accountName: account.name,
    location: locationPayload,
    requestId,
    validateOnly: false,
  })
  if (createResult.kind === "blocked_by_credentials") {
    return {
      status: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: createResult.missingEnvVars,
      message: "Google Business Profile 인증 정보가 설정되지 않았습니다.",
    }
  }

  const createBody = await executeSpecBody(
    createResult.value,
    options.fetchImpl
  )
  const googleLocationId = googleLocationIdFromSpecBody(createBody)
  const status = locationStatusFromSpecBody(createBody)

  const verificationResult =
    options.adapters.gbpVerifications.fetchVerificationOptions({
      accessToken,
      languageCode: "ko",
      locationName: googleLocationId,
    })
  const voiceResult = options.adapters.gbpVerifications.getVoiceOfMerchantState(
    {
      accessToken,
      locationName: googleLocationId,
    }
  )
  const verificationBody =
    verificationResult.kind === "ok"
      ? await executeSpecBody(
          verificationResult.value,
          options.fetchImpl
        ).catch(() => undefined)
      : undefined
  const voiceBody =
    voiceResult.kind === "ok"
      ? await executeSpecBody(voiceResult.value, options.fetchImpl).catch(
          () => undefined
        )
      : undefined

  return persistGbpRegistrationRecords(options, {
    accountDisplayName: account.accountName ?? account.name,
    accountName: account.name,
    action: "gbp.setup.create_requested",
    googleLocationId,
    redactedPayload: {
      accessToken: "[REDACTED]",
      googleCategoryId,
      profileName: profile.name,
      verificationOptionsFetched: verificationBody !== undefined,
      voiceOfMerchantFetched: voiceBody !== undefined,
    },
    status,
  })
}

export async function setupGoogleBusinessProfile(
  options: SetupGoogleBusinessProfileOptions
): Promise<GbpSetupResult> {
  if (options.adapters.mode === "production") {
    return setupProductionGoogleBusinessProfile(options)
  }

  const oauthResult = options.adapters.googleOAuth.connect()
  if (oauthResult.kind === "blocked_by_credentials") {
    return {
      status: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: oauthResult.missingEnvVars,
      message: "Google OAuth 인증 정보가 설정되지 않았습니다.",
    }
  }

  const locationResult = options.adapters.gbpBusinessInformation.createLocation(
    {
      accessToken: "stub-access-token",
      accountName: "accounts/stub",
      requestId: "setup-gbp-location",
      location: { title: "브런치모먼트 홍대점" },
    }
  )
  if (locationResult.kind === "blocked_by_credentials") {
    return {
      status: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: locationResult.missingEnvVars,
      message: "Google Business Profile 인증 정보가 설정되지 않았습니다.",
    }
  }

  return persistSetupRecords(
    options,
    locationStatusFromSpecBody(locationResult.value.body),
    oauthResult.value.subjectId
  )
}
