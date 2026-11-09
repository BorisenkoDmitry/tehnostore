import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261107031135 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "catalog_profile" drop constraint if exists "catalog_profile_key_unique";`);
    this.addSql(`create table if not exists "catalog_profile" ("id" text not null, "key" text not null, "scope" text not null, "region_id" text not null, "product_types" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "catalog_profile_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_catalog_profile_key_unique" ON "catalog_profile" ("key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_catalog_profile_deleted_at" ON "catalog_profile" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "catalog_definition" add column if not exists "role" text check ("role" in ('spec', 'color', 'variant_axis')) not null default 'spec', add column if not exists "filter_control" text check ("filter_control" in ('checkbox', 'swatch', 'range')) not null default 'checkbox';`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "catalog_profile" cascade;`);

    this.addSql(`alter table if exists "catalog_definition" drop column if exists "role", drop column if exists "filter_control";`);
  }

}
