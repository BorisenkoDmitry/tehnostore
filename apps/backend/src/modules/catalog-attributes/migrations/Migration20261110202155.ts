import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261110202155 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "catalog_variant_search" ("id" text not null, "fields" jsonb not null, "rows" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "catalog_variant_search_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_catalog_variant_search_deleted_at" ON "catalog_variant_search" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "catalog_variant_search" cascade;`);
  }

}
