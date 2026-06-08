import {
  blockedByCredentials,
  googleBusinessManageScope,
  missingEnvVars,
} from "./credentials"
import type {
  AdapterEnvironment,
  AdapterFetch,
  AdapterResult,
  GbpAccountManagementAdapter,
  GbpBusinessInformationAdapter,
  GbpLocalPostsAdapter,
  GbpReviewsAdapter,
  GbpVerificationsAdapter,
  GoogleOAuthAdapter,
  HttpRequestSpec,
  NaverSearchAdapter,
  NaverSearchResult,
} from "./contracts"

const naverEnvVars = ["NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET"] as const
const googleEnvVars = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const

function googleHeaders(accessToken: string): Readonly<Record<string, string>> {
  return {
    Authorization: `Bearer ${accessToken}`,
  }
}

function googleBlockedResult(
  env: AdapterEnvironment
): AdapterResult<HttpRequestSpec> {
  const missing = missingEnvVars(env, googleEnvVars)
  if (missing.length > 0) {
    return blockedByCredentials(missing)
  }
  return {
    kind: "ok",
    value: {
      method: "GET",
      url: "about:blank",
      headers: {},
    },
  }
}

function stripNaverHtml(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }
  return value
    .replace(/<\/?b>/g, "")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .trim()
}

function normalizedMissingFields(
  phone: string | undefined,
  hours: string | undefined
): ("phone" | "hours")[] {
  const missingFields: ("phone" | "hours")[] = []
  if (phone === undefined) {
    missingFields.push("phone")
  }
  if (hours === undefined) {
    missingFields.push("hours")
  }
  return missingFields
}

function naverCoordinate(value: unknown): number | undefined {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN
  if (!Number.isFinite(parsed)) {
    return undefined
  }
  return Math.abs(parsed) > 180 ? parsed / 10_000_000 : parsed
}

function parseNaverSearchResult(payload: unknown): NaverSearchResult {
  const record =
    typeof payload === "object" && payload !== null && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {}
  const items = Array.isArray(record["items"]) ? record["items"] : []
  return {
    candidates: items.flatMap((item) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        return []
      }
      const row = item as Record<string, unknown>
      const name = stripNaverHtml(row["title"])
      const roadAddress = stripNaverHtml(row["roadAddress"])
      const address = roadAddress || stripNaverHtml(row["address"])
      const category = stripNaverHtml(row["category"])
      if (
        name === undefined ||
        address === undefined ||
        category === undefined
      ) {
        return []
      }
      const phone = stripNaverHtml(row["telephone"])
      const hours = undefined
      const longitude = naverCoordinate(row["mapx"])
      const latitude = naverCoordinate(row["mapy"])
      return [
        {
          source: "NAVER_LOCAL" as const,
          name,
          address,
          category,
          ...(phone === undefined || phone === "" ? {} : { phone }),
          ...(longitude === undefined ? {} : { longitude }),
          ...(latitude === undefined ? {} : { latitude }),
          missingFields: normalizedMissingFields(phone, hours),
        },
      ]
    }),
  }
}

function setOptionalSearchParam(
  url: URL,
  name: string,
  value: string | number | undefined
): void {
  if (value !== undefined) {
    url.searchParams.set(name, String(value))
  }
}

export function createProductionNaverSearch(
  env: AdapterEnvironment,
  fetchImpl: AdapterFetch = fetch
): NaverSearchAdapter {
  return {
    async searchLocal(input) {
      const missing = missingEnvVars(env, naverEnvVars)
      if (missing.length > 0) {
        return blockedByCredentials(missing)
      }

      const url = new URL("https://openapi.naver.com/v1/search/local.json")
      url.searchParams.set("query", input.query)
      url.searchParams.set("display", String(input.display))
      url.searchParams.set("start", "1")
      url.searchParams.set("sort", "random")

      const request = {
        method: "GET",
        url: url.toString(),
        headers: {
          "X-Naver-Client-Id": env["NAVER_CLIENT_ID"] ?? "",
          "X-Naver-Client-Secret": env["NAVER_CLIENT_SECRET"] ?? "",
        },
      } satisfies HttpRequestSpec

      const response = await fetchImpl(request.url, {
        headers: request.headers,
        method: request.method,
      })
      if (!response.ok) {
        throw new Error(`Naver local search failed with ${response.status}.`)
      }
      return {
        kind: "ok",
        value: parseNaverSearchResult(await response.json()),
      }
    },
  }
}

export function createProductionGoogleOAuth(
  env: AdapterEnvironment
): GoogleOAuthAdapter {
  return {
    connect() {
      const missing = missingEnvVars(env, googleEnvVars)
      if (missing.length > 0) {
        return blockedByCredentials(missing)
      }
      return { kind: "ok", value: { subjectId: "production-oauth-request" } }
    },
  }
}

export function createProductionAccountManagement(
  env: AdapterEnvironment
): GbpAccountManagementAdapter {
  return {
    listAccounts(input) {
      const blocked = googleBlockedResult(env)
      if (blocked.kind === "blocked_by_credentials") {
        return blocked
      }

      const url = new URL(
        "https://mybusinessaccountmanagement.googleapis.com/v1/accounts"
      )
      setOptionalSearchParam(url, "pageSize", input.pageSize)
      setOptionalSearchParam(url, "pageToken", input.pageToken)
      setOptionalSearchParam(url, "parentAccount", input.parentAccount)

      return {
        kind: "ok",
        value: {
          method: "GET",
          url: url.toString(),
          headers: googleHeaders(input.accessToken),
          requiredScopes: [googleBusinessManageScope],
        },
      }
    },
  }
}

export function createProductionBusinessInformation(
  env: AdapterEnvironment
): GbpBusinessInformationAdapter {
  return {
    createLocation(input) {
      const blocked = googleBlockedResult(env)
      if (blocked.kind === "blocked_by_credentials") {
        return blocked
      }

      const url = new URL(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${input.accountName}/locations`
      )
      url.searchParams.set("requestId", input.requestId)
      url.searchParams.set("validateOnly", String(input.validateOnly ?? false))

      return {
        kind: "ok",
        value: {
          method: "POST",
          url: url.toString(),
          headers: googleHeaders(input.accessToken),
          requiredScopes: [googleBusinessManageScope],
          body: input.location,
        },
      }
    },
    listCategories(input) {
      const blocked = googleBlockedResult(env)
      if (blocked.kind === "blocked_by_credentials") {
        return blocked
      }

      const url = new URL(
        "https://mybusinessbusinessinformation.googleapis.com/v1/categories"
      )
      url.searchParams.set("regionCode", input.regionCode)
      url.searchParams.set("languageCode", input.languageCode)
      setOptionalSearchParam(url, "filter", input.filter)
      setOptionalSearchParam(url, "pageSize", input.pageSize)
      setOptionalSearchParam(url, "pageToken", input.pageToken)
      setOptionalSearchParam(url, "view", input.view)

      return {
        kind: "ok",
        value: {
          method: "GET",
          url: url.toString(),
          headers: googleHeaders(input.accessToken),
          requiredScopes: [googleBusinessManageScope],
        },
      }
    },
    searchGoogleLocations(input) {
      const blocked = googleBlockedResult(env)
      if (blocked.kind === "blocked_by_credentials") {
        return blocked
      }

      return {
        kind: "ok",
        value: {
          method: "POST",
          url: "https://mybusinessbusinessinformation.googleapis.com/v1/googleLocations:search",
          headers: googleHeaders(input.accessToken),
          requiredScopes: [googleBusinessManageScope],
          body: {
            pageSize: input.resultCount,
            ...(input.query === undefined ? {} : { query: input.query }),
            ...(input.location === undefined
              ? {}
              : { location: input.location }),
          },
        },
      }
    },
  }
}

export function createProductionVerifications(
  env: AdapterEnvironment
): GbpVerificationsAdapter {
  return {
    fetchVerificationOptions(input) {
      const blocked = googleBlockedResult(env)
      if (blocked.kind === "blocked_by_credentials") {
        return blocked
      }

      return {
        kind: "ok",
        value: {
          method: "POST",
          url: `https://mybusinessverifications.googleapis.com/v1/${input.locationName}:fetchVerificationOptions`,
          headers: googleHeaders(input.accessToken),
          requiredScopes: [googleBusinessManageScope],
          body: {
            languageCode: input.languageCode,
            ...(input.context === undefined ? {} : { context: input.context }),
          },
        },
      }
    },
    getVoiceOfMerchantState(input) {
      const blocked = googleBlockedResult(env)
      if (blocked.kind === "blocked_by_credentials") {
        return blocked
      }

      return {
        kind: "ok",
        value: {
          method: "GET",
          url: `https://mybusinessverifications.googleapis.com/v1/${input.locationName}/VoiceOfMerchantState`,
          headers: googleHeaders(input.accessToken),
          requiredScopes: [googleBusinessManageScope],
        },
      }
    },
  }
}

export function createProductionLocalPosts(
  env: AdapterEnvironment
): GbpLocalPostsAdapter {
  return {
    createLocalPost(input) {
      const blocked = googleBlockedResult(env)
      if (blocked.kind === "blocked_by_credentials") {
        return blocked
      }

      return {
        kind: "ok",
        value: {
          method: "POST",
          url: `https://mybusiness.googleapis.com/v4/${input.parent}/localPosts`,
          headers: googleHeaders(input.accessToken),
          requiredScopes: [googleBusinessManageScope],
          body: { summary: input.summary },
        },
      }
    },
  }
}

export function createProductionReviews(
  env: AdapterEnvironment
): GbpReviewsAdapter {
  return {
    listReviews(input) {
      const blocked = googleBlockedResult(env)
      if (blocked.kind === "blocked_by_credentials") {
        return blocked
      }

      const url = new URL(
        `https://mybusiness.googleapis.com/v4/${input.parent}/reviews`
      )
      url.searchParams.set("pageSize", String(input.pageSize))
      if (input.pageToken !== undefined) {
        url.searchParams.set("pageToken", input.pageToken)
      }
      url.searchParams.set("orderBy", "updateTime desc")

      return {
        kind: "ok",
        value: {
          method: "GET",
          url: url.toString(),
          headers: googleHeaders(input.accessToken),
          requiredScopes: [googleBusinessManageScope],
        },
      }
    },
    updateReply(input) {
      const blocked = googleBlockedResult(env)
      if (blocked.kind === "blocked_by_credentials") {
        return blocked
      }

      return {
        kind: "ok",
        value: {
          method: "PUT",
          url: `https://mybusiness.googleapis.com/v4/${input.reviewName}/reply`,
          headers: googleHeaders(input.accessToken),
          requiredScopes: [googleBusinessManageScope],
          body: { comment: input.comment },
        },
      }
    },
  }
}
