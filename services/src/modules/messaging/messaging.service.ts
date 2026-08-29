import { createClerkClient } from "@clerk/backend";
import { and, count, desc, eq, inArray, lt, ne, or, sql } from "drizzle-orm";
import { env } from "../../config/env.js";
import { db } from "../../database/client.js";
import {
  accounts,
  client_metadata,
  conversation_participants,
  conversations,
  freelancer_metadata,
  job_posts,
  message_attachments,
  messages,
  proposals,
} from "../../database/schema.js";
import { ApiError } from "../../utils/api-error.js";
import {
  deleteDocuments,
  uploadDocuments,
} from "../../utils/upload-documents.js";
import { emitConversationUpdate } from "./messaging.socket.js";

export interface AttachmentInput {
  fileId: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  attachmentType: string;
}

const requireMember = async (conversationId: string, userId: string) => {
  const [participant] = await db
    .select()
    .from(conversation_participants)
    .where(
      and(
        eq(conversation_participants.conversation_id, conversationId),
        eq(conversation_participants.account_id, userId),
      ),
    )
    .limit(1);
  if (!participant) throw new ApiError(404, "Conversation not found.");
  return participant;
};

const getParticipantProfiles = async (conversationIds: string[]) => {
  if (!conversationIds.length) return new Map<string, unknown[]>();

  const rows = await db
    .select({
      conversationId: conversation_participants.conversation_id,
      accountId: conversation_participants.account_id,
      participantType: conversation_participants.participant_type,
      email: accounts.email,
      professionalTitle: freelancer_metadata.professional_title,
      companyName: client_metadata.company_name,
    })
    .from(conversation_participants)
    .innerJoin(
      accounts,
      eq(conversation_participants.account_id, accounts.auth_id),
    )
    .leftJoin(
      freelancer_metadata,
      eq(conversation_participants.account_id, freelancer_metadata.auth_id),
    )
    .leftJoin(
      client_metadata,
      eq(conversation_participants.account_id, client_metadata.auth_id),
    )
    .where(inArray(conversation_participants.conversation_id, conversationIds));

  const clerkUsers = new Map<
    string,
    { name: string | null; avatarUrl: string | null }
  >();
  if (env.clerkSecretKey) {
    const clerk = createClerkClient({ secretKey: env.clerkSecretKey });
    await Promise.all(
      [...new Set(rows.map(({ accountId }) => accountId))].map(
        async (accountId) => {
          try {
            const user = await clerk.users.getUser(accountId);
            clerkUsers.set(accountId, {
              name:
                [user.firstName, user.lastName].filter(Boolean).join(" ") ||
                null,
              avatarUrl: user.imageUrl || null,
            });
          } catch {
            clerkUsers.set(accountId, { name: null, avatarUrl: null });
          }
        },
      ),
    );
  }

  const profiles = new Map<string, unknown[]>();
  for (const row of rows) {
    const clerkUser = clerkUsers.get(row.accountId);
    const profile = {
      ...row,
      name: clerkUser?.name ?? row.companyName ?? row.email,
      avatarUrl: clerkUser?.avatarUrl ?? null,
    };
    profiles.set(row.conversationId, [
      ...(profiles.get(row.conversationId) ?? []),
      profile,
    ]);
  }
  return profiles;
};

export const getConversations = async (userId: string) => {
  const rows = await db
    .select({
      id: conversations.id,
      jobId: conversations.job_id,
      proposalId: conversations.proposal_id,
      lastMessageAt: conversations.last_message_at,
      updatedAt: conversations.updated_at,
      unreadCount: conversation_participants.unread_count,
      lastMessage: {
        id: messages.id,
        senderId: messages.sender_id,
        messageType: messages.message_type,
        body: messages.body,
        eventType: messages.event_type,
        createdAt: messages.created_at,
      },
      lastAttachmentName: sql<string | null>`(
        SELECT ${message_attachments.file_name}
        FROM ${message_attachments}
        WHERE ${message_attachments.message_id} = ${messages.id}
        LIMIT 1
      )`,
      jobTitle: job_posts.title,
    })
    .from(conversation_participants)
    .innerJoin(
      conversations,
      eq(conversation_participants.conversation_id, conversations.id),
    )
    .leftJoin(messages, eq(conversations.last_message_id, messages.id))
    .leftJoin(job_posts, eq(conversations.job_id, job_posts.id))
    .where(eq(conversation_participants.account_id, userId))
    .orderBy(
      desc(conversations.last_message_at),
      desc(conversations.created_at),
    );

  const profiles = await getParticipantProfiles(rows.map(({ id }) => id));
  return {
    conversations: rows.map((row) => ({
      ...row,
      participants: profiles.get(row.id) ?? [],
    })),
    totalUnread: rows.reduce((total, row) => total + row.unreadCount, 0),
  };
};

/*
innerJoin returns a row only when matching records exist in both tables.

leftJoin keeps every row from the table/query on the left, even when no 
matching row exists on the joined table. Missing joined values become null.

so in simple language innerjoin means it must need to have value 
and leftjoin means it can be optional

If the entire query has no matching rows from the main/left 
table, then the query returns: []

So:
Main row exists, joined row missing → joined data is null
Main row does not exist → result
*/

export const createConversation = async (
  clientId: string,
  input: { recipientId?: string; jobId?: string; proposalId?: string },
) => {
  let recipientId = input.recipientId;
  let jobId = input.jobId;

  if (input.proposalId) {
    const [proposal] = await db
      .select({
        freelancerId: proposals.sender_id,
        jobId: proposals.job_id,
        clientId: job_posts.client_id,
      })
      .from(proposals)
      .innerJoin(job_posts, eq(proposals.job_id, job_posts.id))
      .where(eq(proposals.id, input.proposalId))
      .limit(1);
    if (!proposal || proposal.clientId !== clientId) {
      throw new ApiError(404, "Proposal not found.");
    }
    recipientId = proposal.freelancerId;
    jobId = proposal.jobId;
  } else {
    if (!recipientId) throw new ApiError(400, "Recipient is required.");
    const [recipient] = await db
      .select({ role: accounts.role })
      .from(accounts)
      .where(eq(accounts.auth_id, recipientId))
      .limit(1);
    if (recipient?.role !== "FREELANCER") {
      throw new ApiError(404, "Freelancer not found.");
    }
    if (jobId) {
      const [job] = await db
        .select({ id: job_posts.id })
        .from(job_posts)
        .where(and(eq(job_posts.id, jobId), eq(job_posts.client_id, clientId)))
        .limit(1);
      if (!job) throw new ApiError(404, "Job post not found.");
    }
  }

  const contextKey = jobId
    ? `job:${jobId}:client:${clientId}:talent:${recipientId}`
    : `direct:client:${clientId}:talent:${recipientId}`;

  const conversationId = await db.transaction(async (transaction) => {
    const [created] = await transaction
      .insert(conversations)
      .values({
        job_id: jobId,
        proposal_id: input.proposalId,
        context_key: contextKey,
      })
      .onConflictDoNothing({ target: conversations.context_key })
      .returning({ id: conversations.id });

    const existing =
      created ??
      (
        await transaction
          .select({ id: conversations.id })
          .from(conversations)
          .where(eq(conversations.context_key, contextKey))
          .limit(1)
      )[0];
    if (!existing)
      throw new ApiError(500, "Conversation could not be created.");

    await transaction
      .insert(conversation_participants)
      .values([
        {
          conversation_id: existing.id,
          account_id: clientId,
          participant_type: "CLIENT",
        },
        {
          conversation_id: existing.id,
          account_id: recipientId!,
          participant_type: "FREELANCER",
        },
      ])
      .onConflictDoNothing();
    return existing.id;
  });

  const data = await getConversations(clientId);
  return data.conversations.find(({ id }) => id === conversationId)!;
};

const encodeCursor = (message: { createdAt: Date; id: string }) =>
  Buffer.from(
    JSON.stringify([message.createdAt.toISOString(), message.id]),
  ).toString("base64url");

const decodeCursor = (cursor: string) => {
  try {
    const [createdAt, id] = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as [string, string];
    const date = new Date(createdAt);
    if (!id || Number.isNaN(date.getTime())) throw new Error();
    return { createdAt: date, id };
  } catch {
    throw new ApiError(400, "Message cursor is invalid.");
  }
};

const hydrateMessages = async (
  rows: Array<{
    id: string;
    conversationId: string;
    senderId: string | null;
    messageType: string;
    body: string | null;
    eventType: string | null;
    eventPayload: Record<string, unknown> | null;
    replyToMessageId: string | null;
    createdAt: Date;
  }>,
) => {
  if (!rows.length) return [];
  const attachments = await db
    .select()
    .from(message_attachments)
    .where(
      inArray(
        message_attachments.message_id,
        rows.map(({ id }) => id),
      ),
    );
  const replyIds = rows
    .map(({ replyToMessageId }) => replyToMessageId)
    .filter((id): id is string => Boolean(id));
  const replies = replyIds.length
    ? await db
        .select({
          id: messages.id,
          senderId: messages.sender_id,
          messageType: messages.message_type,
          body: messages.body,
          eventType: messages.event_type,
        })
        .from(messages)
        .where(inArray(messages.id, replyIds))
    : [];

  return rows.map((message) => ({
    ...message,
    attachments: attachments.filter(
      ({ message_id }) => message_id === message.id,
    ),
    replyTo: replies.find(({ id }) => id === message.replyToMessageId) ?? null,
  }));
};

export const getMessages = async (
  conversationId: string,
  userId: string,
  cursor?: string,
  limit = 30,
) => {
  await requireMember(conversationId, userId);
  const before = cursor ? decodeCursor(cursor) : null;
  const rows = await db
    .select({
      id: messages.id,
      conversationId: messages.conversation_id,
      senderId: messages.sender_id,
      messageType: messages.message_type,
      body: messages.body,
      eventType: messages.event_type,
      eventPayload: messages.event_payload,
      replyToMessageId: messages.reply_to_message_id,
      createdAt: messages.created_at,
    })
    .from(messages)
    .where(
      and(
        eq(messages.conversation_id, conversationId),
        before
          ? or(
              lt(messages.created_at, before.createdAt),
              and(
                eq(messages.created_at, before.createdAt),
                lt(messages.id, before.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(messages.created_at), desc(messages.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const oldest = page.at(-1);
  return {
    messages: (await hydrateMessages(page)).reverse(),
    nextCursor: hasMore && oldest ? encodeCursor(oldest) : null,
  };
};

export const sendMessage = async (
  conversationId: string,
  senderId: string,
  input: {
    body?: string;
    replyToMessageId?: string;
    attachments: AttachmentInput[];
  },
) => {
  await requireMember(conversationId, senderId);
  if (input.replyToMessageId) {
    const [reply] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.id, input.replyToMessageId),
          eq(messages.conversation_id, conversationId),
        ),
      )
      .limit(1);
    if (!reply) throw new ApiError(400, "Reply message is invalid.");
  }

  const { documents: uploaded, uploadedIds } = await uploadDocuments(
    `/onemarketplace/messages/${conversationId}/${senderId}`,
    input.attachments,
  );
  let message;
  try {
    message = await db.transaction(async (transaction) => {
      const [created] = await transaction
        .insert(messages)
        .values({
          conversation_id: conversationId,
          sender_id: senderId,
          body: input.body,
          reply_to_message_id: input.replyToMessageId,
        })
        .returning();
      if (!created) throw new ApiError(500, "Message could not be sent.");

      if (uploaded.length) {
        await transaction.insert(message_attachments).values(
          uploaded.map((attachment) => ({
            message_id: created.id,
            storage_key: attachment.fileId,
            file_url: attachment.fileUrl,
            file_name: attachment.fileName,
            mime_type: attachment.mimeType,
            file_size: attachment.fileSize,
            attachment_type: attachment.attachmentType,
          })),
        );
      }
      await transaction
        .update(conversations)
        .set({
          last_message_id: created.id,
          last_message_at: created.created_at,
          updated_at: new Date(),
        })
        .where(eq(conversations.id, conversationId));
      await transaction
        .update(conversation_participants)
        .set({
          unread_count: sql`${conversation_participants.unread_count} + 1`,
        })
        .where(
          and(
            eq(conversation_participants.conversation_id, conversationId),
            ne(conversation_participants.account_id, senderId),
          ),
        );
      return created;
    });
  } catch (error) {
    await deleteDocuments(uploadedIds);
    throw error;
  }

  const hydrated = (
    await hydrateMessages([
      {
        id: message.id,
        conversationId: message.conversation_id,
        senderId: message.sender_id,
        messageType: message.message_type,
        body: message.body,
        eventType: message.event_type,
        eventPayload: message.event_payload,
        replyToMessageId: message.reply_to_message_id,
        createdAt: message.created_at,
      },
    ])
  )[0]!;
  await emitConversationUpdate(conversationId, senderId);
  return hydrated;
};

export const markConversationRead = async (
  conversationId: string,
  userId: string,
  lastReadMessageId: string,
) => {
  await requireMember(conversationId, userId);
  const [message] = await db
    .select({ id: messages.id, createdAt: messages.created_at })
    .from(messages)
    .where(
      and(
        eq(messages.id, lastReadMessageId),
        eq(messages.conversation_id, conversationId),
      ),
    )
    .limit(1);
  if (!message) throw new ApiError(400, "Read message is invalid.");

  const [remaining] = await db
    .select({ value: count(messages.id) })
    .from(messages)
    .where(
      and(
        eq(messages.conversation_id, conversationId),
        ne(messages.sender_id, userId),
        or(
          sql`${messages.created_at} > ${message.createdAt}`,
          and(
            eq(messages.created_at, message.createdAt),
            sql`${messages.id} > ${message.id}`,
          ),
        ),
      ),
    );

  const [participant] = await db
    .update(conversation_participants)
    .set({
      last_read_message_id: message.id,
      last_read_at: new Date(),
      unread_count: remaining?.value ?? 0,
    })
    .where(
      and(
        eq(conversation_participants.conversation_id, conversationId),
        eq(conversation_participants.account_id, userId),
      ),
    )
    .returning({ unreadCount: conversation_participants.unread_count });
  return { conversationId, lastReadMessageId: message.id, ...participant };
};
