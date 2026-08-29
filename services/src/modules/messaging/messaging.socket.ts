import type { Server as HttpServer } from "node:http";
import { inArray, eq } from "drizzle-orm";
import { Server } from "socket.io";
import { db } from "../../database/client.js";
import {
  conversation_participants,
} from "../../database/schema.js";
import { authenticateAccount } from "../../middleware/auth.middleware.js";

let io: Server | undefined;
const userSockets = new Map<string, Set<string>>();

const getConversationUsers = async (userId: string) => {
  const memberships = await db
    .select({ conversationId: conversation_participants.conversation_id })
    .from(conversation_participants)
    .where(eq(conversation_participants.account_id, userId));
  const conversationIds = memberships.map(({ conversationId }) => conversationId);
  if (!conversationIds.length) return { conversationIds, userIds: [] };
  const participants = await db
    .select({ userId: conversation_participants.account_id })
    .from(conversation_participants)
    .where(inArray(conversation_participants.conversation_id, conversationIds));
  return {
    conversationIds,
    userIds: [...new Set(participants.map(({ userId }) => userId))],
  };
};

export const initializeMessagingSocket = (server: HttpServer) => {
  io = new Server(server, { cors: { origin: true, credentials: true } });
  io.use(async (socket, next) => {
    try {
      socket.data.auth = await authenticateAccount(
        socket.handshake.auth.token,
        socket.handshake.auth.role,
      );
      next();
    } catch (error) {
      next(new Error(error instanceof Error ? error.message : "Unauthorized"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.data.auth.userId as string;
    const { conversationIds, userIds } = await getConversationUsers(userId);
    socket.join(`user:${userId}`);
    conversationIds.forEach((id) => socket.join(`conversation:${id}`));

    const sockets = userSockets.get(userId) ?? new Set<string>();
    const cameOnline = sockets.size === 0;
    sockets.add(socket.id);
    userSockets.set(userId, sockets);
    socket.emit("presence:snapshot", {
      userIds: userIds.filter((id) => userSockets.has(id)),
    });
    if (cameOnline) {
      userIds.forEach((id) =>
        io?.to(`user:${id}`).emit("presence:update", { userId, online: true }),
      );
    }

    socket.on("typing:set", ({ conversationId, isTyping }) => {
      const room = `conversation:${conversationId}`;
      if (socket.rooms.has(room)) {
        socket.to(room).emit("typing:update", {
          conversationId,
          userId,
          isTyping: Boolean(isTyping),
        });
      }
    });

    socket.on("disconnect", () => {
      const activeSockets = userSockets.get(userId);
      activeSockets?.delete(socket.id);
      if (activeSockets?.size) return;
      userSockets.delete(userId);
      userIds.forEach((id) =>
        io?.to(`user:${id}`).emit("presence:update", {
          userId,
          online: false,
          lastActiveAt: new Date().toISOString(),
        }),
      );
    });
  });
};

export const emitConversationUpdate = async (
  conversationId: string,
  excludedUserId?: string,
) => {
  if (!io) return;
  const participants = await db
    .select({ userId: conversation_participants.account_id })
    .from(conversation_participants)
    .where(eq(conversation_participants.conversation_id, conversationId));
  participants.forEach(({ userId }) => {
    if (userId === excludedUserId) return;
    io?.in(`user:${userId}`).socketsJoin(`conversation:${conversationId}`);
    io?.to(`user:${userId}`).emit("conversation:update", {
      conversationId,
      messagesChanged: true,
    });
  });
};
