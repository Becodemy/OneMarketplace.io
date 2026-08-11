import { AckPolicy, ConsumerMessages, JsMsg, JSONCodec } from "nats";
import {
  NotificationEvent,
  NOTIFICATIONS_CONSUMER,
  NOTIFICATIONS_STREAM,
  NOTIFICATIONS_SUBJECT,
} from "./subjects.js";
import { db } from "../database/client.js";
import { notifications } from "../database/schema.js";
import { emitNotification } from "../modules/notifications/notification.sse.js";
import { Request } from "express";
import { getNats } from "../config/nats.js";

const codec = JSONCodec<NotificationEvent>();
const buffer: Array<{ event: NotificationEvent; message: JsMsg }> = [];
let flushing = false;
let messages: ConsumerMessages | undefined;

const flush = async (request?: Request) => {
  if (flushing || !buffer.length) return;
  flushing = true;
  const batch = buffer.splice(0, 100);

  try {
    const inserted = await db
      .insert(notifications)
      .values(
        batch.map(({ event }) => ({
          event_id: event.eventId,
          recipient_id: event.recipientId,
          type: event.type,
          title: event.title,
          message: event.message,
          link: event.link,
          metadata: event.metadata,
          created_at: new Date(event.createdAt),
        })),
      )
      .onConflictDoNothing({ target: notifications.event_id })
      .returning();

    batch.forEach(({ message }) => message.ack());
    inserted.forEach((notification) =>
      emitNotification(notification.recipient_id, notification),
    );
  } catch (error: any) {
    request?.logger.error({
      message: `Notification batch could not be stored ${error.message}`,
      importance: "high",
      service: "notification-consumer",
    });
    console.error("Notification batch could not be stored", error);
    batch.forEach(({ message }) => message.nak(2_000));
  } finally {
    flushing = false;
    if (buffer.length >= 100) void flush();
  }
};

export const startNotificationConsumer = async () => {
  const nats = await getNats();
  const manager = await nats.jetstreamManager();

  try {
    await manager.streams.info(NOTIFICATIONS_STREAM);
  } catch (error) {
    await manager.streams.add({
      name: NOTIFICATIONS_STREAM,
      subjects: [NOTIFICATIONS_SUBJECT],
    });
  }

  try {
    await manager.consumers.info(NOTIFICATIONS_STREAM, NOTIFICATIONS_CONSUMER);
  } catch (error) {
    await manager.consumers.add(NOTIFICATIONS_STREAM, {
      durable_name: NOTIFICATIONS_CONSUMER,
      ack_policy: AckPolicy.Explicit,
      ack_wait: 30_000_000_000,
      filter_subject: NOTIFICATIONS_SUBJECT,
    });
  }

  const consumer = await nats
    .jetstream()
    .consumers.get(NOTIFICATIONS_STREAM, NOTIFICATIONS_CONSUMER);

  messages = await consumer.consume({
    callback: (message) => {
      try {
        buffer.push({ event: codec.decode(message.data), message });
        if (buffer.length >= 100) void flush();
      } catch (error) {
        message.term();
      }
    },
  });
};

setInterval(() => void flush(), 2_000).unref();

export const stopNotificationConsumer = async () => {
  await flush();
  await messages?.close();
};
