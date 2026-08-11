import { RequestHandler } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { ApiResponse } from "../../types/common.types.js";
import {
  getNotifications,
  readAllNotifications,
} from "./notifications.service.js";
import { addNotificationClient } from "./notification.sse.js";

export const listNotifications: RequestHandler = asyncHandler(
  async (request, response) => {
    const data = await getNotifications(request.auth!.userId);
    response.json({
      success: true,
      message: "Notifications retrieved.",
      data,
    } satisfies ApiResponse<typeof data>);
  },
);

export const markAllNotificationsRead: RequestHandler = asyncHandler(
  async (request, response) => {
    await readAllNotifications(request.auth!.userId);
    response.json({
      success: true,
      message: "Notifications marked as read.",
    } satisfies ApiResponse<never>);
  },
);

export const notificationStream: RequestHandler = (request, response) => {
  response.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  response.flushHeaders();
  response.write("event: connected\ndata: {}\n\n");

  const heartbeat = setInterval(
    () => response.write(": heartbeat\n\n"),
    25_000,
  );
  const removeClient = addNotificationClient(request.auth!.userId, response);
  request.on("close", () => {
    clearInterval(heartbeat);
    removeClient();
  });
};
