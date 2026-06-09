import type { AdapterResult, HttpRequestSpec } from "@/integrations/contracts"
import {
  gbpPerformanceDailyMetrics,
  type GbpPerformanceApiResponse,
} from "@/integrations/contracts"
import type { IntegrationAdapters } from "@/integrations/contracts"
import type { SqliteDatabase } from "@/server/db/sqlite"

import {
  buildGbpPerformanceRanges,
  datesInRange,
  formatGbpPerformanceDate,
} from "./performance-dates"
import {
  parseGbpPerformanceResponse,
  summarizePerformanceMetrics,
  type PerformanceMetricSummary,
} from "./performance-metrics"
import {
  loadGbpPerformanceConnection,
  loadGbpPerformanceLocation,
} from "./performance-repository"

export type GbpPerformanceFetch = (
  input: string,
  init?: RequestInit
) => Promise<Response>

export type GbpPerformanceDashboardResult =
  | {
      readonly locationName: string
      readonly metrics: readonly PerformanceMetricSummary[]
      readonly range: {
        readonly endDate: string
        readonly previousEndDate: string
        readonly previousStartDate: string
        readonly startDate: string
      }
      readonly refreshedAt: string
      readonly status: "READY"
    }
  | {
      readonly code:
        | "AMBIGUOUS_GBP_LOCATION"
        | "GOOGLE_CREDENTIALS_MISSING"
        | "LOCATION_NOT_VERIFIED"
        | "MISSING_BUSINESS_MANAGE_SCOPE"
        | "MISSING_GOOGLE_CONNECTION"
        | "MISSING_GBP_LOCATION"
        | "TOKEN_UNAVAILABLE"
      readonly message: string
      readonly status: "BLOCKED"
    }
  | {
      readonly code:
        | "GOOGLE_AUTH_REQUIRED"
        | "GOOGLE_QUOTA_EXCEEDED"
        | "GOOGLE_RESPONSE_MALFORMED"
        | "GOOGLE_UPSTREAM_ERROR"
        | "GOOGLE_UPSTREAM_UNAVAILABLE"
      readonly message: string
      readonly status: "ERROR"
    }

export type GetGbpPerformanceDashboardOptions = {
  readonly adapters: IntegrationAdapters
  readonly database: SqliteDatabase
  readonly fetchImpl?: GbpPerformanceFetch
  readonly now?: Date
  readonly storeId: string
}

function blocked(
  code: Extract<GbpPerformanceDashboardResult, { status: "BLOCKED" }>["code"],
  message: string
): GbpPerformanceDashboardResult {
  return { code, message, status: "BLOCKED" }
}

function error(
  code: Extract<GbpPerformanceDashboardResult, { status: "ERROR" }>["code"],
  message: string
): GbpPerformanceDashboardResult {
  return { code, message, status: "ERROR" }
}

function isHttpRequestSpec(
  value: GbpPerformanceApiResponse | HttpRequestSpec
): value is HttpRequestSpec {
  return "method" in value && "url" in value && "headers" in value
}

async function readJson(response: Response): Promise<unknown | undefined> {
  try {
    return await response.json()
  } catch (caught) {
    if (caught instanceof SyntaxError) {
      return undefined
    }
    throw caught
  }
}

async function executePerformanceSpec(
  spec: HttpRequestSpec,
  fetchImpl: GbpPerformanceFetch
): Promise<GbpPerformanceApiResponse | GbpPerformanceDashboardResult> {
  let response: Response
  try {
    response = await fetchImpl(spec.url, {
      headers: spec.headers,
      method: spec.method,
      signal: AbortSignal.timeout(8_000),
    })
  } catch (caught) {
    if (caught instanceof Error) {
      return error(
        "GOOGLE_UPSTREAM_UNAVAILABLE",
        "Google Business Profile 성과 API에 연결하지 못했습니다."
      )
    }
    throw caught
  }

  if (response.status === 401 || response.status === 403) {
    return error(
      "GOOGLE_AUTH_REQUIRED",
      "Google Business Profile 성과 권한을 다시 연결해주세요."
    )
  }
  if (response.status === 429) {
    return error(
      "GOOGLE_QUOTA_EXCEEDED",
      "Google Business Profile 성과 조회 한도를 초과했습니다."
    )
  }
  if (!response.ok) {
    return error(
      "GOOGLE_UPSTREAM_ERROR",
      "Google Business Profile 성과 API가 일시적으로 응답하지 않습니다."
    )
  }

  const payload = await readJson(response)
  const parsed = parseGbpPerformanceResponse(payload)
  if (parsed === undefined) {
    return error(
      "GOOGLE_RESPONSE_MALFORMED",
      "Google Business Profile 성과 응답을 읽지 못했습니다."
    )
  }
  return parsed
}

async function resolvePerformancePayload(
  result: AdapterResult<GbpPerformanceApiResponse | HttpRequestSpec>,
  fetchImpl: GbpPerformanceFetch
): Promise<GbpPerformanceApiResponse | GbpPerformanceDashboardResult> {
  if (result.kind === "blocked_by_credentials") {
    return blocked(
      "GOOGLE_CREDENTIALS_MISSING",
      "Google API 인증 정보가 설정되지 않았습니다."
    )
  }

  if (isHttpRequestSpec(result.value)) {
    return executePerformanceSpec(result.value, fetchImpl)
  }

  return result.value
}

export async function getGbpPerformanceDashboard(
  options: GetGbpPerformanceDashboardOptions
): Promise<GbpPerformanceDashboardResult> {
  const location = loadGbpPerformanceLocation(options.database, options.storeId)
  if (location.kind !== "ready") {
    if (location.kind === "missing_gbp_location") {
      return blocked(
        "MISSING_GBP_LOCATION",
        "연결된 Google Business Profile 매장을 찾지 못했습니다."
      )
    }
    if (location.kind === "ambiguous_gbp_location") {
      return blocked(
        "AMBIGUOUS_GBP_LOCATION",
        "Google Business Profile 매장이 여러 개입니다. 먼저 매장을 하나로 선택해주세요."
      )
    }
    return blocked(
      "LOCATION_NOT_VERIFIED",
      "Google Business Profile 인증이 완료되어야 성과를 볼 수 있습니다."
    )
  }

  const connection = loadGbpPerformanceConnection(options.database, options.storeId)
  if (connection.kind !== "ready") {
    if (connection.kind === "missing_google_connection") {
      return blocked(
        "MISSING_GOOGLE_CONNECTION",
        "Google 계정 연결이 필요합니다."
      )
    }
    if (connection.kind === "missing_business_manage_scope") {
      return blocked(
        "MISSING_BUSINESS_MANAGE_SCOPE",
        "Google Business Profile 성과를 보려면 business.manage 권한이 필요합니다."
      )
    }
    return blocked(
      "TOKEN_UNAVAILABLE",
      "Google 연결 토큰을 읽지 못했습니다. 계정을 다시 연결해주세요."
    )
  }

  const now = options.now ?? new Date()
  const ranges = buildGbpPerformanceRanges(now)
  const fetchImpl = options.fetchImpl ?? fetch
  const current = await resolvePerformancePayload(
    options.adapters.gbpPerformance.fetchMultiDailyMetricsTimeSeries({
      accessToken: connection.accessToken,
      dailyMetrics: gbpPerformanceDailyMetrics,
      dailyRange: ranges.current,
      location: location.googleLocationId,
      period: "current",
    }),
    fetchImpl
  )
  if ("status" in current) {
    return current
  }
  const previous = await resolvePerformancePayload(
    options.adapters.gbpPerformance.fetchMultiDailyMetricsTimeSeries({
      accessToken: connection.accessToken,
      dailyMetrics: gbpPerformanceDailyMetrics,
      dailyRange: ranges.previous,
      location: location.googleLocationId,
      period: "previous",
    }),
    fetchImpl
  )
  if ("status" in previous) {
    return previous
  }

  return {
    locationName: location.locationName,
    metrics: summarizePerformanceMetrics(
      current,
      previous,
      datesInRange(ranges.current)
    ),
    range: {
      endDate: formatGbpPerformanceDate(ranges.current.endDate),
      previousEndDate: formatGbpPerformanceDate(ranges.previous.endDate),
      previousStartDate: formatGbpPerformanceDate(ranges.previous.startDate),
      startDate: formatGbpPerformanceDate(ranges.current.startDate),
    },
    refreshedAt: now.toISOString(),
    status: "READY",
  }
}
