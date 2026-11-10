import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261110174836 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "content_article" drop constraint if exists "content_article_slug_unique";`);
    this.addSql(`create table if not exists "content_article" ("id" text not null, "slug" text not null, "title" text not null, "body" jsonb not null default '[]', "metadata" jsonb not null default '{}', "revision" integer not null default 1, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "content_article_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_content_article_slug_unique" ON "content_article" ("slug") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_content_article_deleted_at" ON "content_article" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_content_article_created_at" ON "content_article" ("created_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "content_article" cascade;`);
  }

}
