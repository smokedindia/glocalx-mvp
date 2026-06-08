import type {
  CreateIntegrationAdaptersOptions,
  IntegrationAdapters,
} from "./contracts"
import {
  createProductionAccountManagement,
  createProductionBusinessInformation,
  createProductionGoogleOAuth,
  createProductionLocalPosts,
  createProductionNaverSearch,
  createProductionReviews,
  createProductionVerifications,
} from "./production"
import {
  createStubAccountManagement,
  createStubBusinessInformation,
  createStubClock,
  createStubContentGeneration,
  createStubGoogleOAuth,
  createStubJobScheduler,
  createStubLocalPosts,
  createStubNaverSearch,
  createStubReviews,
  createStubTranslation,
  createStubVerifications,
} from "./stub"

export function createIntegrationAdapters(
  options: CreateIntegrationAdaptersOptions = {}
): IntegrationAdapters {
  const env = options.env ?? process.env
  const mode =
    env["APP_INTEGRATION_MODE"] === "production" ? "production" : "stub"
  const now = options.now ?? new Date("2026-06-04T00:00:00.000Z")

  if (mode === "production") {
    return {
      mode,
      naverSearch: createProductionNaverSearch(env, options.fetchImpl),
      googleOAuth: createProductionGoogleOAuth(env),
      gbpAccountManagement: createProductionAccountManagement(env),
      gbpBusinessInformation: createProductionBusinessInformation(env),
      gbpVerifications: createProductionVerifications(env),
      gbpLocalPosts: createProductionLocalPosts(env),
      gbpReviews: createProductionReviews(env),
      contentGeneration: createStubContentGeneration(),
      translation: createStubTranslation(),
      clock: createStubClock(now),
      jobScheduler: createStubJobScheduler(),
    }
  }

  return {
    mode,
    naverSearch: createStubNaverSearch(options.database),
    googleOAuth: createStubGoogleOAuth(),
    gbpAccountManagement: createStubAccountManagement(),
    gbpBusinessInformation: createStubBusinessInformation(),
    gbpVerifications: createStubVerifications(),
    gbpLocalPosts: createStubLocalPosts(),
    gbpReviews: createStubReviews(),
    contentGeneration: createStubContentGeneration(),
    translation: createStubTranslation(),
    clock: createStubClock(now),
    jobScheduler: createStubJobScheduler(),
  }
}
