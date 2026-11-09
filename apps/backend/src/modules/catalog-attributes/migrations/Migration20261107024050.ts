import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261107024050 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "catalog_definition" drop constraint if exists "catalog_definition_code_unique";`);
    this.addSql(`create table if not exists "catalog_change" ("id" text not null, "product_id" text not null, "variant_id" text null, "actor_id" text not null, "action" text not null, "reason" text not null, "before" jsonb not null, "after" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "catalog_change_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_catalog_change_deleted_at" ON "catalog_change" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_catalog_change_product_id_created_at" ON "catalog_change" ("product_id", "created_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "catalog_definition" ("id" text not null, "code" text not null, "label" text not null, "type" text check ("type" in ('text', 'number', 'boolean')) not null, "unit" text null, "public" boolean not null default true, "filterable" boolean not null default false, "position" integer not null default 0, "enabled" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "catalog_definition_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_catalog_definition_code_unique" ON "catalog_definition" ("code") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_catalog_definition_deleted_at" ON "catalog_definition" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "catalog_record" alter column "source_product_id" type text using ("source_product_id"::text);`);
    this.addSql(`alter table if exists "catalog_record" alter column "source_product_id" drop not null;`);

    this.addSql(`alter table if exists "catalog_variant" alter column "source_variant_id" type text using ("source_variant_id"::text);`);
    this.addSql(`alter table if exists "catalog_variant" alter column "source_variant_id" drop not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "catalog_change" cascade;`);

    this.addSql(`drop table if exists "catalog_definition" cascade;`);

    this.addSql(`alter table if exists "catalog_record" alter column "source_product_id" type text using ("source_product_id"::text);`);
    this.addSql(`alter table if exists "catalog_record" alter column "source_product_id" set not null;`);

    this.addSql(`alter table if exists "catalog_variant" alter column "source_variant_id" type text using ("source_variant_id"::text);`);
    this.addSql(`alter table if exists "catalog_variant" alter column "source_variant_id" set not null;`);
  }

}
