import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261106232800 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "catalog_variant" drop constraint if exists "catalog_variant_source_variant_id_unique";`);
    this.addSql(`alter table if exists "catalog_record" drop constraint if exists "catalog_record_source_product_id_unique";`);
    this.addSql(`create table if not exists "catalog_record" ("id" text not null, "source_product_id" text not null, "source_hash" text not null, "source_data" jsonb not null, "searchable_text" text not null, "attributes" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "catalog_record_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_catalog_record_source_product_id_unique" ON "catalog_record" ("source_product_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_catalog_record_deleted_at" ON "catalog_record" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "catalog_variant" ("id" text not null, "source_variant_id" text not null, "source_data" jsonb not null, "attributes" jsonb not null, "record_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "catalog_variant_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_catalog_variant_source_variant_id_unique" ON "catalog_variant" ("source_variant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_catalog_variant_record_id" ON "catalog_variant" ("record_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_catalog_variant_deleted_at" ON "catalog_variant" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "catalog_attribute" ("id" text not null, "key" text not null, "label" text not null, "raw_value" text not null, "value" text not null, "normalized_value" text not null, "type" text check ("type" in ('text', 'number', 'boolean')) not null, "numeric_value" integer null, "unit" text null, "filterable" boolean not null default false, "scope" text check ("scope" in ('product', 'variant')) not null, "record_id" text not null, "variant_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "catalog_attribute_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_catalog_attribute_record_id" ON "catalog_attribute" ("record_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_catalog_attribute_variant_id" ON "catalog_attribute" ("variant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_catalog_attribute_deleted_at" ON "catalog_attribute" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_catalog_attribute_filter" ON "catalog_attribute" ("key", "normalized_value", "record_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_catalog_attribute_record" ON "catalog_attribute" ("record_id", "key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_catalog_attribute_variant" ON "catalog_attribute" ("variant_id") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "catalog_variant" add constraint "catalog_variant_record_id_foreign" foreign key ("record_id") references "catalog_record" ("id") on update cascade;`);

    this.addSql(`alter table if exists "catalog_attribute" add constraint "catalog_attribute_record_id_foreign" foreign key ("record_id") references "catalog_record" ("id") on update cascade;`);
    this.addSql(`alter table if exists "catalog_attribute" add constraint "catalog_attribute_variant_id_foreign" foreign key ("variant_id") references "catalog_variant" ("id") on update cascade on delete set null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "catalog_variant" drop constraint if exists "catalog_variant_record_id_foreign";`);

    this.addSql(`alter table if exists "catalog_attribute" drop constraint if exists "catalog_attribute_record_id_foreign";`);

    this.addSql(`alter table if exists "catalog_attribute" drop constraint if exists "catalog_attribute_variant_id_foreign";`);

    this.addSql(`drop table if exists "catalog_record" cascade;`);

    this.addSql(`drop table if exists "catalog_variant" cascade;`);

    this.addSql(`drop table if exists "catalog_attribute" cascade;`);
  }

}
