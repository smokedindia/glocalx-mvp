export type SafeErrorCategory =
  | "database_open_failed"
  | "migration_failed"
  | "module_not_found"
  | "native_binding_unavailable"
  | "permission_denied"
  | "unknown"

export type SafeErrorDiagnostics = {
  readonly category: SafeErrorCategory
  readonly code: string | null
  readonly name: string
}

function errorCode(error: Error): string | null {
  if (!("code" in error)) {
    return null
  }

  const code = error.code
  return typeof code === "string" ? code : null
}

function classifyError(
  error: Error,
  fallbackCategory: SafeErrorCategory
): SafeErrorCategory {
  const code = errorCode(error)
  const message = error.message.toLowerCase()

  if (code === "MODULE_NOT_FOUND" || message.includes("cannot find module")) {
    return "module_not_found"
  }

  if (
    message.includes("better_sqlite3.node") ||
    message.includes("node-gyp") ||
    message.includes("native addon") ||
    message.includes("was compiled against") ||
    message.includes("invalid elf") ||
    message.includes("mach-o")
  ) {
    return "native_binding_unavailable"
  }

  if (code === "EACCES" || code === "EPERM" || message.includes("permission")) {
    return "permission_denied"
  }

  return fallbackCategory
}

export function safeErrorDiagnostics(
  error: unknown,
  fallbackCategory: SafeErrorCategory = "unknown"
): SafeErrorDiagnostics {
  if (error instanceof Error) {
    return {
      category: classifyError(error, fallbackCategory),
      code: errorCode(error),
      name: error.name,
    }
  }

  return {
    category: fallbackCategory,
    code: null,
    name: typeof error,
  }
}
