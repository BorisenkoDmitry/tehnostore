import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261110192520 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "content_article" add column if not exists "excerpt" text not null default '', add column if not exists "cover_image" text not null default '', add column if not exists "cover_alt" text not null default '';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "content_article" drop column if exists "excerpt", drop column if exists "cover_image", drop column if exists "cover_alt";`);
  }

}
