CREATE TABLE "owner_setup_limits" (
	"user_id" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "owner_setup_limits_attempts_valid" CHECK ("owner_setup_limits"."attempts" BETWEEN  1 AND 10)
);
--> statement-breakpoint
ALTER TABLE "owner_setup_limits" ADD CONSTRAINT "owner_setup_limits_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;