import { z } from "zod"

const nonEmptyStringSchema = z.string().trim().min(1)

export const onboardingExtractionRequestSchema = z
  .object({
    source: z.literal("NAVER_LOCAL").optional().default("NAVER_LOCAL"),
    input: nonEmptyStringSchema,
  })
  .strict()

export const missingBusinessFieldSchema = z.enum(["phone", "hours"])

export const manualBusinessProfileSchema = z
  .object({
    name: nonEmptyStringSchema,
    address: nonEmptyStringSchema,
    phone: nonEmptyStringSchema.optional(),
    hours: nonEmptyStringSchema.optional(),
    websiteUri: z.url().optional(),
    category: nonEmptyStringSchema,
  })
  .strict()

export const adapterBusinessProfileCandidateSchema = z
  .object({
    source: z.enum(["NAVER_LOCAL", "MANUAL"]),
    name: nonEmptyStringSchema,
    address: nonEmptyStringSchema,
    category: nonEmptyStringSchema,
    phone: nonEmptyStringSchema.optional(),
    hours: nonEmptyStringSchema.optional(),
    websiteUri: z.url().optional(),
    latitude: z.number().finite().optional(),
    longitude: z.number().finite().optional(),
    naverPlaceUrl: z.url().optional(),
    missingFields: z.array(missingBusinessFieldSchema),
  })
  .strict()

export const onboardingConfirmRequestSchema = z.discriminatedUnion("source", [
  z
    .object({
      source: z.literal("NAVER_LOCAL"),
      input: nonEmptyStringSchema,
      candidate: adapterBusinessProfileCandidateSchema.extend({
        source: z.literal("NAVER_LOCAL"),
      }),
    })
    .strict(),
  z
    .object({
      source: z.literal("MANUAL"),
      input: nonEmptyStringSchema.optional(),
      profile: manualBusinessProfileSchema,
    })
    .strict(),
])

export const gbpSetupRequestSchema = z
  .object({
    storeId: nonEmptyStringSchema,
    mode: z.enum(["stub", "production"]),
    confirmedExtractionId: nonEmptyStringSchema.optional(),
    idempotencyKey: nonEmptyStringSchema.optional(),
  })
  .strict()

export const postDraftRequestSchema = z
  .object({
    storeId: nonEmptyStringSchema,
    ownerIntent: nonEmptyStringSchema,
    targetChannel: z.literal("GBP"),
  })
  .strict()

export const postPublishRequestSchema = z
  .object({
    storeId: nonEmptyStringSchema,
    idempotencyKey: nonEmptyStringSchema.optional(),
  })
  .strict()

export type OnboardingExtractionRequest = z.infer<
  typeof onboardingExtractionRequestSchema
>
export type ManualBusinessProfile = z.infer<typeof manualBusinessProfileSchema>
export type OnboardingConfirmRequest = z.infer<
  typeof onboardingConfirmRequestSchema
>
export type GbpSetupRequest = z.infer<typeof gbpSetupRequestSchema>
export type PostDraftRequest = z.infer<typeof postDraftRequestSchema>
export type PostPublishRequest = z.infer<typeof postPublishRequestSchema>
export type MissingBusinessField = z.infer<typeof missingBusinessFieldSchema>
export type AdapterBusinessProfileCandidate = z.infer<
  typeof adapterBusinessProfileCandidateSchema
>

export type ParsedValidationIssue = {
  readonly path: readonly (string | number)[]
  readonly message: string
}

export type ParseRoutePayloadResult<TValue> =
  | {
      readonly kind: "ok"
      readonly value: TValue
    }
  | {
      readonly kind: "validation_error"
      readonly issues: readonly ParsedValidationIssue[]
    }

export function parseRoutePayload<TValue>(
  schema: z.ZodType<TValue>,
  payload: unknown
): ParseRoutePayloadResult<TValue> {
  const parsed = schema.safeParse(payload)

  if (parsed.success) {
    return {
      kind: "ok",
      value: parsed.data,
    }
  }

  return {
    kind: "validation_error",
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.flatMap((pathSegment) =>
        typeof pathSegment === "symbol" ? [] : [pathSegment]
      ),
      message: issue.message,
    })),
  }
}
