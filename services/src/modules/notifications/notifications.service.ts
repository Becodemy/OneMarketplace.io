import { desc, eq } from "drizzle-orm";
import { db } from "../../database/client.js";
import { notifications } from "../../database/schema.js";

export const getNotifications = (userId: string) =>
  db
    .select()
    .from(notifications)
    .where(eq(notifications.recipient_id, userId))
    .orderBy(desc(notifications.created_at))
    .limit(10);

export const readAllNotifications = (userId: string) =>
  db
    .update(notifications)
    .set({ is_read: true, read_at: new Date() })
    .where(eq(notifications.recipient_id, userId));
