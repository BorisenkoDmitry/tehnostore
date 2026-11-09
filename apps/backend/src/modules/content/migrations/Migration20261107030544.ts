import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261107030544 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "content_lead" add column if not exists "type" text check ("type" in ('contact')) not null default 'contact', add column if not exists "product_id" text null, add column if not exists "order_id" text null;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_content_lead_type_status_created_at" ON "content_lead" ("type", "status", "created_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_content_lead_email_created_at" ON "content_lead" ("email", "created_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_content_lead_type_status_created_at";`);
    this.addSql(`drop index if exists "IDX_content_lead_email_created_at";`);
    this.addSql(`alter table if exists "content_lead" drop column if exists "type", drop column if exists "product_id", drop column if exists "order_id";`);
  }

}
