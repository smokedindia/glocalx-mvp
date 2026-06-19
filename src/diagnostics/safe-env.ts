import type { AdapterEnvironment } from "@/integrations/contracts"

export type SafeEnvValueDiagnostics = {
  readonly configured: boolean
  readonly length: number
  readonly placeholder: boolean
}

export type SafeRedirectUriDiagnostics = SafeEnvValueDiagnostics & {
  readonly callbackPathMatches: boolean | null
  readonly https: boolean | null
  readonly loopbackHost: boolean | null
  readonly validUrl: boolean | null
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0"
  )
}

export function safeEnvValueDiagnostics(
  env: AdapterEnvironment,
  name: string
): SafeEnvValueDiagnostics {
  const trimmedValue = env[name]?.trim() ?? ""
  return {
    configured: trimmedValue !== "",
    length: trimmedValue.length,
    placeholder: trimmedValue.startsWith("replace-with-"),
  }
}

export function safeRedirectUriDiagnostics(
  env: AdapterEnvironment,
  name: string,
  callbackPath: string
): SafeRedirectUriDiagnostics {
  const valueDiagnostics = safeEnvValueDiagnostics(env, name)
  const configuredValue = env[name]?.trim()

  if (!configuredValue) {
    return {
      ...valueDiagnostics,
      callbackPathMatches: null,
      https: null,
      loopbackHost: null,
      validUrl: null,
    }
  }

  try {
    const url = new URL(configuredValue)
    return {
      ...valueDiagnostics,
      callbackPathMatches: url.pathname === callbackPath,
      https: url.protocol === "https:",
      loopbackHost: isLoopbackHost(url.hostname),
      validUrl: true,
    }
  } catch (error) {
    if (error instanceof TypeError) {
      return {
        ...valueDiagnostics,
        callbackPathMatches: null,
        https: null,
        loopbackHost: null,
        validUrl: false,
      }
    }
    throw error
  }
}
