import { InjectManager, MedusaContext, MedusaService } from "@medusajs/framework/utils"
import type { Context } from "@medusajs/framework/types"
import type { SqlEntityManager } from "@medusajs/framework/mikro-orm/postgresql"
import CatalogRecord from "./models/catalog-record"
import CatalogVariant from "./models/catalog-variant"
import CatalogAttribute from "./models/catalog-attribute"
import CatalogDefinition from "./models/catalog-definition"
import CatalogChange from "./models/catalog-change"
import CatalogProfile from "./models/catalog-profile"
import CatalogVariantSearch from "./models/catalog-variant-search"

class CatalogAttributesModuleService extends MedusaService({
  CatalogRecord,
  CatalogVariant,
  CatalogAttribute,
  CatalogDefinition,
  CatalogChange,
  CatalogProfile,
  CatalogVariantSearch,
}) {
  @InjectManager()
  async replaceVariantSearches(rows: { id: string; fields: string[]; rows: string[][] }[], @MedusaContext() context: Context<SqlEntityManager> = {}) {
    if (!rows.length) return
    const manager = context.transactionManager ?? context.manager!
    await manager.getConnection().execute(`
      INSERT INTO catalog_variant_search (id, fields, rows)
      SELECT id, fields, rows FROM jsonb_to_recordset(?::jsonb) AS item(id text, fields jsonb, rows jsonb)
      ON CONFLICT (id) DO UPDATE SET fields = EXCLUDED.fields, rows = EXCLUDED.rows, updated_at = now(), deleted_at = NULL
    `, [JSON.stringify(rows)])
  }

  @InjectManager()
  async findVariantMismatches(groups: string[][], @MedusaContext() context: Context<SqlEntityManager> = {}): Promise<string[]> {
    if (groups.length < 2) return []
    const selection = groups.map((values) => ({ field: values[0].slice(0, values[0].indexOf(":")), values }))
    const manager = context.transactionManager ?? context.manager!
    // One bounded projection query replaces candidate pagination and product
    // hydration. Values are parameters; arbitrary labels never become SQL.
    const rows = await manager.getConnection().execute<{ id: string }[]>(`
      WITH selection AS (
        SELECT value->>'field' AS field, value->'values' AS choices
        FROM jsonb_array_elements(?::jsonb)
      )
      SELECT id FROM catalog_variant_search p
      WHERE p.deleted_at IS NULL
        AND (SELECT count(*) FROM selection s WHERE jsonb_exists(p.fields, s.field)) >= 2
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(p.rows) AS variant(tokens)
          WHERE NOT EXISTS (
            SELECT 1 FROM selection s
            WHERE jsonb_exists(p.fields, s.field)
              AND NOT jsonb_exists_any(variant.tokens, ARRAY(SELECT jsonb_array_elements_text(s.choices)))
          )
        )
    `, [JSON.stringify(selection)])
    return rows.map(({ id }) => id)
  }
}

export default CatalogAttributesModuleService
