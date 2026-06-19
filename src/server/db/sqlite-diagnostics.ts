import { safeEnvValueDiagnostics } from "@/diagnostics/safe-env"
import {
  safeErrorDiagnostics,
  type SafeErrorDiagnostics,
} from "@/diagnostics/safe-error"
import type { AdapterEnvironment } from "@/integrations/contracts"
import type * as SqliteModuleImport from "./sqlite"

type SqliteModule = typeof SqliteModuleImport
type SqliteLoadResult =
  | { readonly kind: "ok"; readonly module: SqliteModule }
  | { readonly kind: "error"; readonly error: SafeErrorDiagnostics }

type SqliteNativeModuleDiagnostics =
  | { readonly importable: true }
  | { readonly importable: false; readonly error: SafeErrorDiagnostics }

type SqliteDatabaseDiagnostics =
  | {
      readonly openable: true
      readonly requiredTableCount: number
      readonly missingRequiredTables: readonly string[]
      readonly migrationsApplied: boolean
      readonly sqliteVersion: string | null
    }
  | {
      readonly openable: false
      readonly error: SafeErrorDiagnostics
      readonly requiredTableCount: number
      readonly missingRequiredTables: readonly string[]
      readonly migrationsApplied: false
      readonly sqliteVersion: null
    }

export type SqliteReadinessDiagnostics = {
  readonly databasePath: {
    readonly env: ReturnType<typeof safeEnvValueDiagnostics>
    readonly resolvedKind:
      | "custom-env-path"
      | "tmp-vercel-default"
      | "workspace-default"
  }
  readonly database: SqliteDatabaseDiagnostics
  readonly nativeModule: SqliteNativeModuleDiagnostics
}

export type SqliteReadinessOptions = {
  readonly loadSqliteModule?: () => Promise<SqliteModule>
}

function databasePathKind(
  env: AdapterEnvironment
): SqliteReadinessDiagnostics["databasePath"]["resolvedKind"] {
  if ((env["GLOCALX_DB_PATH"]?.trim() ?? "") !== "") {
    return "custom-env-path"
  }

  return env["VERCEL"] === "1" ? "tmp-vercel-default" : "workspace-default"
}

async function loadSqlite(
  options: SqliteReadinessOptions
): Promise<SqliteLoadResult> {
  const loadSqliteModule =
    options.loadSqliteModule ?? (() => import("./sqlite"))
  try {
    return { kind: "ok", module: await loadSqliteModule() }
  } catch (error) {
    return {
      kind: "error",
      error: safeErrorDiagnostics(error, "native_binding_unavailable"),
    }
  }
}

function readSqliteVersion(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null
  }

  if (!("sqlite_version" in value)) {
    return null
  }

  return typeof value.sqlite_version === "string" ? value.sqlite_version : null
}

function readTableNames(rows: readonly unknown[]): ReadonlySet<string> {
  const tableNames = new Set<string>()
  for (const row of rows) {
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      continue
    }

    if ("name" in row && typeof row.name === "string") {
      tableNames.add(row.name)
    }
  }
  return tableNames
}

export async function getSqliteReadinessDiagnostics(
  env: AdapterEnvironment,
  options: SqliteReadinessOptions = {}
): Promise<SqliteReadinessDiagnostics> {
  const loadedSqlite = await loadSqlite(options)
  const databasePath = {
    env: safeEnvValueDiagnostics(env, "GLOCALX_DB_PATH"),
    resolvedKind: databasePathKind(env),
  }

  if (loadedSqlite.kind === "error") {
    return {
      databasePath,
      database: {
        error: loadedSqlite.error,
        missingRequiredTables: [],
        migrationsApplied: false,
        openable: false,
        requiredTableCount: 0,
        sqliteVersion: null,
      },
      nativeModule: {
        error: loadedSqlite.error,
        importable: false,
      },
    }
  }

  let database: ReturnType<SqliteModule["openDatabase"]> | undefined
  try {
    database = loadedSqlite.module.openDatabase()
    loadedSqlite.module.applyMigrations(database)

    const sqliteVersion = readSqliteVersion(
      database.prepare("SELECT sqlite_version() AS sqlite_version").get()
    )
    const tableNames = readTableNames(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
    )
    const missingRequiredTables = loadedSqlite.module.requiredTableNames.filter(
      (tableName) => !tableNames.has(tableName)
    )

    return {
      databasePath,
      database: {
        missingRequiredTables,
        migrationsApplied: true,
        openable: true,
        requiredTableCount: loadedSqlite.module.requiredTableNames.length,
        sqliteVersion,
      },
      nativeModule: { importable: true },
    }
  } catch (error) {
    const fallbackCategory =
      database === undefined ? "database_open_failed" : "migration_failed"
    return {
      databasePath,
      database: {
        error: safeErrorDiagnostics(error, fallbackCategory),
        missingRequiredTables: [],
        migrationsApplied: false,
        openable: false,
        requiredTableCount: loadedSqlite.module.requiredTableNames.length,
        sqliteVersion: null,
      },
      nativeModule: { importable: true },
    }
  } finally {
    database?.close()
  }
}
