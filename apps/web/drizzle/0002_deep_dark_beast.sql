CREATE TABLE "mobile_auth_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"nonce_hash" text NOT NULL,
	"verifier_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "mobile_auth_attempts_id_format" CHECK ("mobile_auth_attempts"."id" ~ '^[A-Za-z0-9_-]{43}$'),
	CONSTRAINT "mobile_auth_attempts_nonce_hash_format" CHECK ("mobile_auth_attempts"."nonce_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "mobile_auth_attempts_verifier_hash_format" CHECK ("mobile_auth_attempts"."verifier_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "mobile_auth_attempts_expiry_window" CHECK ("mobile_auth_attempts"."expires_at" > "mobile_auth_attempts"."created_at" AND "mobile_auth_attempts"."expires_at" <= "mobile_auth_attempts"."created_at" + interval '5 minutes'),
	CONSTRAINT "mobile_auth_attempts_consumed_window" CHECK ("mobile_auth_attempts"."consumed_at" IS NULL OR ("mobile_auth_attempts"."consumed_at" >= "mobile_auth_attempts"."created_at" AND "mobile_auth_attempts"."consumed_at" < "mobile_auth_attempts"."expires_at"))
);
--> statement-breakpoint
CREATE INDEX "mobile_auth_attempts_expiry_idx" ON "mobile_auth_attempts" USING btree ("expires_at");