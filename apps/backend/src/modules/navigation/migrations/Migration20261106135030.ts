import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261106135030 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "site_navigation" drop constraint if exists "site_navigation_key_unique";`);
    this.addSql(`create table if not exists "site_navigation" ("id" text not null, "key" text not null, "items" jsonb not null, "phone" text not null, "telegram_url" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "site_navigation_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_site_navigation_key_unique" ON "site_navigation" ("key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_site_navigation_deleted_at" ON "site_navigation" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "site_navigation" cascade;`);
  }

}
