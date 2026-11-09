import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261107121833 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "catalog_definition" drop constraint if exists "catalog_definition_type_check";`);

    this.addSql(`alter table if exists "catalog_definition" add constraint "catalog_definition_type_check" check("type" in ('text', 'number', 'boolean', 'money'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "catalog_definition" drop constraint if exists "catalog_definition_type_check";`);

    this.addSql(`alter table if exists "catalog_definition" add constraint "catalog_definition_type_check" check("type" in ('text', 'number', 'boolean'));`);
  }

}
