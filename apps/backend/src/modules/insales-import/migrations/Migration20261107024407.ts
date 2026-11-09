import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261107024407 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "insales_import_job" ("id" text not null, "filename" text not null, "source_sha256" text not null, "source_base64" text not null, "actor_id" text not null, "status" text check ("status" in ('preview', 'queued', 'running', 'completed', 'review', 'failed', 'cancelled')) not null default 'preview', "report" jsonb not null, "progress" jsonb not null, "backup" jsonb null, "error" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "insales_import_job_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_insales_import_job_deleted_at" ON "insales_import_job" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_insales_import_job_status_created_at" ON "insales_import_job" ("status", "created_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "insales_import_job" cascade;`);
  }

}
