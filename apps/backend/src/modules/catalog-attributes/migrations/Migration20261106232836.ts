import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261106232836 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "catalog_attribute" alter column "numeric_value" type real using ("numeric_value"::real);`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "catalog_attribute" alter column "numeric_value" type integer using ("numeric_value"::integer);`);
  }

}
