import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261107024209 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "content_settings" drop constraint if exists "content_settings_key_unique";`);
    this.addSql(`alter table if exists "content_review" drop constraint if exists "content_review_source_key_unique";`);
    this.addSql(`alter table if exists "content_page" drop constraint if exists "content_page_slug_unique";`);
    this.addSql(`alter table if exists "content_lead" drop constraint if exists "content_lead_request_key_unique";`);
    this.addSql(`create table if not exists "content_lead" ("id" text not null, "request_key" text not null, "name" text not null, "email" text not null, "phone" text null, "message" text not null, "consent" boolean not null, "status" text check ("status" in ('new', 'in_progress', 'closed')) not null default 'new', "notes" text not null default '', "source" text not null default 'contacts', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "content_lead_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_content_lead_request_key_unique" ON "content_lead" ("request_key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_content_lead_deleted_at" ON "content_lead" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_content_lead_status_created_at" ON "content_lead" ("status", "created_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "content_page" ("id" text not null, "slug" text not null, "title" text not null, "body" jsonb not null default '[]', "blocks" jsonb not null default '[]', "metadata" jsonb not null default '{}', "status" text check ("status" in ('draft', 'published')) not null default 'draft', "revision" integer not null default 1, "published_at" timestamptz null, "published_snapshot" jsonb null, "provenance" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "content_page_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_content_page_slug_unique" ON "content_page" ("slug") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_content_page_deleted_at" ON "content_page" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_content_page_status_slug" ON "content_page" ("status", "slug") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "content_review" ("id" text not null, "source_key" text not null, "kind" text check ("kind" in ('shop', 'product')) not null, "product_id" text null, "author" text not null, "rating" integer not null, "body" text not null, "media" jsonb not null default '[]', "review_date" text not null, "status" text check ("status" in ('pending', 'published', 'rejected')) not null default 'pending', "position" integer not null default 0, "provenance" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "content_review_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_content_review_source_key_unique" ON "content_review" ("source_key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_content_review_deleted_at" ON "content_review" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_content_review_status_kind_position" ON "content_review" ("status", "kind", "position") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_content_review_product_id_status" ON "content_review" ("product_id", "status") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "content_settings" ("id" text not null, "key" text not null, "data" jsonb not null default '{}', "published_data" jsonb null, "revision" integer not null default 1, "published_at" timestamptz null, "provenance" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "content_settings_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_content_settings_key_unique" ON "content_settings" ("key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_content_settings_deleted_at" ON "content_settings" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "content_lead" cascade;`);

    this.addSql(`drop table if exists "content_page" cascade;`);

    this.addSql(`drop table if exists "content_review" cascade;`);

    this.addSql(`drop table if exists "content_settings" cascade;`);
  }

}
