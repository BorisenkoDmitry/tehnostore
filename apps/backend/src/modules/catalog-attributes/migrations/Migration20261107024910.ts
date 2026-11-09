import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261107024910 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "catalog_record" add column if not exists "family_id" text null, add column if not exists "family_signature" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "catalog_record" drop column if exists "family_id", drop column if exists "family_signature";`);
  }

}
