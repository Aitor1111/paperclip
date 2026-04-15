ALTER TABLE "documents" ADD COLUMN "folder" text;--> statement-breakpoint
CREATE INDEX "documents_company_folder_idx" ON "documents" USING btree ("company_id","folder");
