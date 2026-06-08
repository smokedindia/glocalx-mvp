import type { AdapterBusinessProfileCandidate } from "@/domain/schemas"
import type { SqliteDatabase } from "@/server/db/sqlite"

export type IntegrationMode = "stub" | "production"

export type AdapterEnvironment = Readonly<Record<string, string | undefined>>

export type BlockedByCredentials = {
  readonly kind: "blocked_by_credentials"
  readonly code: "BLOCKED_BY_CREDENTIALS"
  readonly missingEnvVars: readonly string[]
}

export type AdapterOk<TValue> = {
  readonly kind: "ok"
  readonly value: TValue
}

export type AdapterResult<TValue> = AdapterOk<TValue> | BlockedByCredentials
export type AdapterPromiseResult<TValue> = Promise<AdapterResult<TValue>>
export type AdapterFetch = (
  input: string,
  init?: RequestInit
) => Promise<Response>

export type HttpMethod = "GET" | "POST" | "PUT"

export type HttpRequestSpec = {
  readonly method: HttpMethod
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  readonly requiredScopes?: readonly string[]
  readonly body?: unknown
}

export type NaverSearchInput = {
  readonly query: string
  readonly display: number
}

export type NaverSearchResult = {
  readonly candidates: readonly AdapterBusinessProfileCandidate[]
}

export type CreateLocationInput = {
  readonly accessToken: string
  readonly accountName: string
  readonly requestId: string
  readonly validateOnly?: boolean
  readonly location: Readonly<Record<string, unknown>>
}

export type ListAccountsInput = {
  readonly accessToken: string
  readonly pageSize?: number
  readonly pageToken?: string
  readonly parentAccount?: string
}

export type ListCategoriesInput = {
  readonly accessToken: string
  readonly regionCode: string
  readonly languageCode: string
  readonly filter?: string
  readonly pageSize?: number
  readonly pageToken?: string
  readonly view?: string
}

export type SearchGoogleLocationsInput = {
  readonly accessToken: string
  readonly resultCount: number
  readonly query?: string
  readonly location?: Readonly<Record<string, unknown>>
}

export type FetchVerificationOptionsInput = {
  readonly accessToken: string
  readonly locationName: string
  readonly languageCode: string
  readonly context?: Readonly<Record<string, unknown>>
}

export type GetVoiceOfMerchantStateInput = {
  readonly accessToken: string
  readonly locationName: string
}

export type CreateLocalPostInput = {
  readonly accessToken: string
  readonly parent: string
  readonly summary: string
}

export type ListReviewsInput = {
  readonly accessToken: string
  readonly parent: string
  readonly pageSize: number
  readonly pageToken?: string
}

export type UpdateReplyInput = {
  readonly accessToken: string
  readonly reviewName: string
  readonly comment: string
}

export interface NaverSearchAdapter {
  searchLocal(input: NaverSearchInput): AdapterPromiseResult<NaverSearchResult>
}

export interface GoogleOAuthAdapter {
  connect(): AdapterResult<{ readonly subjectId: string }>
}

export interface GbpAccountManagementAdapter {
  listAccounts(input: ListAccountsInput): AdapterResult<HttpRequestSpec>
}

export interface GbpBusinessInformationAdapter {
  createLocation(input: CreateLocationInput): AdapterResult<HttpRequestSpec>
  listCategories(input: ListCategoriesInput): AdapterResult<HttpRequestSpec>
  searchGoogleLocations(
    input: SearchGoogleLocationsInput
  ): AdapterResult<HttpRequestSpec>
}

export interface GbpVerificationsAdapter {
  fetchVerificationOptions(
    input: FetchVerificationOptionsInput
  ): AdapterResult<HttpRequestSpec>
  getVoiceOfMerchantState(
    input: GetVoiceOfMerchantStateInput
  ): AdapterResult<HttpRequestSpec>
}

export interface GbpLocalPostsAdapter {
  createLocalPost(input: CreateLocalPostInput): AdapterResult<HttpRequestSpec>
}

export interface GbpReviewsAdapter {
  listReviews(input: ListReviewsInput): AdapterResult<HttpRequestSpec>
  updateReply(input: UpdateReplyInput): AdapterResult<HttpRequestSpec>
}

export interface ContentGenerationAdapter {
  generatePostCopy(
    intent: string
  ): AdapterResult<{ readonly korean: string; readonly english: string }>
}

export interface TranslationAdapter {
  translate(
    text: string,
    targetLanguage: string
  ): AdapterResult<{ readonly text: string }>
}

export interface ClockAdapter {
  now(): Date
}

export interface JobSchedulerAdapter {
  schedule(jobType: string): AdapterResult<{ readonly jobId: string }>
}

export type IntegrationAdapters = {
  readonly mode: IntegrationMode
  readonly naverSearch: NaverSearchAdapter
  readonly googleOAuth: GoogleOAuthAdapter
  readonly gbpAccountManagement: GbpAccountManagementAdapter
  readonly gbpBusinessInformation: GbpBusinessInformationAdapter
  readonly gbpVerifications: GbpVerificationsAdapter
  readonly gbpLocalPosts: GbpLocalPostsAdapter
  readonly gbpReviews: GbpReviewsAdapter
  readonly contentGeneration: ContentGenerationAdapter
  readonly translation: TranslationAdapter
  readonly clock: ClockAdapter
  readonly jobScheduler: JobSchedulerAdapter
}

export type CreateIntegrationAdaptersOptions = {
  readonly env?: AdapterEnvironment
  readonly fetchImpl?: AdapterFetch
  readonly database?: SqliteDatabase
  readonly now?: Date
}
