import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { describe, expect, it } from "vitest"

import { getSqliteReadinessDiagnostics } from "./sqlite-diagnostics"

describe("getSqliteReadinessDiagnostics", () => {
  it("reports native module load failures without leaking filesystem paths", async () => {
    const diagnostics = await getSqliteReadinessDiagnostics(
      {},
      {
        loadSqliteModule: async () => {
          throw new Error("Cannot find module '/private/better_sqlite3.node'")
        },
      }
    )

    expect(diagnostics.nativeModule).toEqual({
      error: {
        category: "module_not_found",
        code: null,
        name: "Error",
      },
      importable: false,
    })
    expect(diagnostics.database.openable).toBe(false)
    expect(JSON.stringify(diagnostics)).not.toContain("/private")
  })

  it("opens the configured SQLite path and verifies required migrations", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "glocalx-sqlite-"))
    const databasePath = join(tempDirectory, "diagnostics.db")

    try {
      const diagnostics = await getSqliteReadinessDiagnostics({
        GLOCALX_DB_PATH: databasePath,
      })

      expect(diagnostics.databasePath).toMatchObject({
        env: {
          configured: true,
          length: databasePath.length,
          placeholder: false,
        },
        resolvedKind: "custom-env-path",
      })
      expect(diagnostics.nativeModule).toEqual({ importable: true })
      expect(diagnostics.database).toMatchObject({
        missingRequiredTables: [],
        migrationsApplied: true,
        openable: true,
        requiredTableCount: 17,
      })
    } finally {
      rmSync(dirname(databasePath), { force: true, recursive: true })
    }
  })
})
