ALTER TABLE "bf_v9"."users" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "bf_v9"."users" CASCADE;--> statement-breakpoint
ALTER TABLE "bf_v9"."orders" DROP CONSTRAINT "orders_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "bf_v9"."orders" ADD CONSTRAINT "orders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "bf_v9"."user"("id") ON DELETE no action ON UPDATE no action;