import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261107095020 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "catalog_definition" add column if not exists "choice_values" jsonb not null default '[]';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "catalog_definition" drop column if exists "choice_values";`);
  }

}
