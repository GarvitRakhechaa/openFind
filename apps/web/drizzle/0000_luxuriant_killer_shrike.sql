CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_provider" text NOT NULL,
	"auth_subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_auth_provider_nonempty" CHECK (length(trim("accounts"."auth_provider")) > 0),
	CONSTRAINT "accounts_auth_subject_nonempty" CHECK (length(trim("accounts"."auth_subject")) > 0)
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"enrollment_status" text DEFAULT 'pending' NOT NULL,
	"lost_status" text DEFAULT 'found' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "devices_display_name_length" CHECK (length(trim("devices"."display_name")) BETWEEN 1 AND 100),
	CONSTRAINT "devices_enrollment_status_valid" CHECK ("devices"."enrollment_status" IN ('pending', 'active', 'revoked')),
	CONSTRAINT "devices_lost_status_valid" CHECK ("devices"."lost_status" IN ('lost', 'found'))
);
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_owner_account_id_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_subject_unique" ON "accounts" USING btree ("auth_provider","auth_subject");--> statement-breakpoint
CREATE INDEX "devices_owner_account_idx" ON "devices" USING btree ("owner_account_id");