import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261107025929 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "insales_import_payload" drop constraint if exists "insales_import_payload_job_id_unique";`);
    this.addSql(`create table if not exists "insales_import_payload" ("id" text not null, "source_base64" text not null, "backup" jsonb null, "job_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "insales_import_payload_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_insales_import_payload_job_id_unique" ON "insales_import_payload" ("job_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_insales_import_payload_deleted_at" ON "insales_import_payload" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "insales_import_payload" add constraint "insales_import_payload_job_id_foreign" foreign key ("job_id") references "insales_import_job" ("id") on update cascade;`);

    this.addSql(`alter table if exists "insales_import_job" add column if not exists "has_backup" boolean not null default false;`);
    this.addSql(`insert into "insales_import_payload" ("id", "source_base64", "backup", "job_id", "created_at", "updated_at", "deleted_at") select 'inspayload_' || md5("id"), "source_base64", "backup", "id", "created_at", "updated_at", "deleted_at" from "insales_import_job" on conflict ("id") do nothing;`);
    this.addSql(`update "insales_import_job" set "has_backup" = ("backup" is not null), "status" = case when "status" = 'running' then 'failed' else "status" end, "error" = case when "status" = 'running' then 'Worker interrupted for payload migration; resume from the retained journal' else "error" end;`);
    this.addSql(`alter table if exists "insales_import_job" drop column if exists "source_base64", drop column if exists "backup";`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "insales_import_job" add column if not exists "source_base64" text null, add column if not exists "backup" jsonb null;`);
    this.addSql(`update "insales_import_job" as j set "source_base64" = p."source_base64", "backup" = p."backup" from "insales_import_payload" as p where p."job_id" = j."id";`);
    this.addSql(`alter table if exists "insales_import_job" alter column "source_base64" set not null;`);
    this.addSql(`drop table if exists "insales_import_payload" cascade;`);
    this.addSql(`alter table if exists "insales_import_job" drop column if exists "has_backup";`);
  }

}
