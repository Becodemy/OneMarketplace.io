import { relations, sql } from "drizzle-orm";
import {
  AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const accountRole = pgEnum("account_role", ["FREELANCER", "CLIENT"]);

export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  auth_id: text("auth_id").notNull().unique(),
  email: text("email").notNull(),
  stripe_customer_id: text("stripe_customer_id").unique(),
  role: accountRole().default("CLIENT").notNull(),
  identityVerified: boolean("identityVerified").default(false),
  paymentMethodVerified: boolean("paymentMethodVerified").default(false),
  isOnboardingComplete: boolean("isOnboardingComplete").default(false),
  created_at: timestamp("created_at", { withTimezone: true }),
  updated_at: timestamp("updated_at", { withTimezone: true }),
});

export const client_metadata = pgTable("client_metadata", {
  id: uuid("id").defaultRandom().primaryKey(),
  auth_id: text("auth_id").notNull().unique(),
  role: text("role").notNull(),
  company_name: text("company_name").notNull(),
  company_website: text("company_website").notNull(),
  company_size: text("company_size").notNull(),
  industry: text("industry").notNull(),
  company_description: text("company_description").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }),
  updated_at: timestamp("updated_at", { withTimezone: true }),
});

export const freelancer_metadata = pgTable("freelancer_metadata", {
  id: uuid("id").defaultRandom().primaryKey(),
  auth_id: text("auth_id").notNull().unique(),
  professional_title: text("professional_title").notNull(),
  professional_description: text("professional_description").notNull(),
  hourly_rate: numeric("hourly_rate", {
    precision: 6,
    scale: 2,
  }).notNull(),
  country: text("country").notNull(),
  city: text("city").notNull(),
  availability_status: text("availability_status")
    .notNull()
    .default("AVAILABLE"),
  weekly_availability: text("weekly_availability").notNull(),
  experience_level: text("experience_level").notNull(),
  skills: text("skills").array().notNull().default([]),
  languages: jsonb("languages")
    .$type<Array<{ language: string; proficiency: string }>>()
    .notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const freelancer_portfolios = pgTable("freelancer_portfolios", {
  id: uuid("id").defaultRandom().primaryKey(),
  freelancer_id: uuid("freelancer_id")
    .notNull()
    .references(() => freelancer_metadata.id, {
      onDelete: "cascade",
    }),
  title: text("title").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  live_url: text("live_url"),
  cover_image: jsonb("cover_image")
    .$type<{
      imageId: string;
      url: string;
    }>()
    .notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const freelancerMetadataRelations = relations(
  freelancer_metadata,
  ({ many }) => ({
    portfolios: many(freelancer_portfolios),
  }),
);

export const freelancerPortfolioRelations = relations(
  freelancer_portfolios,
  ({ one }) => ({
    freelancer: one(freelancer_metadata, {
      fields: [freelancer_portfolios.freelancer_id],
      references: [freelancer_metadata.id],
    }),
  }),
);

export const job_posts = pgTable("job_posts", {
  id: uuid("id").defaultRandom().primaryKey(),
  client_id: text("client_id")
    .notNull()
    .references(() => accounts.auth_id, {
      onDelete: "cascade",
    }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  expertise_level: text("expertise_level").notNull(),
  expected_duration: text("expected_duration").notNull(),
  skills: text("skills").array().notNull().default([]),

  total_budget: numeric("total_budget", {
    precision: 9,
    scale: 2,
  }).notNull(),

  milestones: jsonb("milestones")
    .$type<
      Array<{
        id: string;
        title: string;
        budget: number;
        dueDate: string;
      }>
    >()
    .notNull(),

  screening_questions: text("screening_questions").array().default([]),

  attachments: jsonb("attachments")
    .$type<
      Array<{
        fileId: string;
        fileName: string;
        fileUrl: string;
        fileType: string;
        fileSize: number;
      }>
    >()
    .default([]),

  status: text("status").notNull().default("DRAFT"),

  published_at: timestamp("published_at", {
    withTimezone: true,
  }),

  hired_at: timestamp("hired_at", {
    withTimezone: true,
  }),

  created_at: timestamp("created_at", {
    withTimezone: true,
  }).defaultNow(),

  updated_at: timestamp("updated_at", {
    withTimezone: true,
  }).defaultNow(),
});

export const connects = pgTable("connects", {
  id: uuid("id").defaultRandom().primaryKey(),
  freelancer_id: text("freelancer_id")
    .notNull()
    .unique()
    .references(() => freelancer_metadata.auth_id, {
      onDelete: "cascade",
    }),
  connects: integer("connects").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const connects_history = pgTable("connects_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  connects_id: uuid("connects_id")
    .notNull()
    .references(() => connects.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  description: text("description").notNull(),
  amount: integer("amount").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const connects_purchase_history = pgTable("connects_purchase_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  connects_id: uuid("connects_id")
    .notNull()
    .references(() => connects.id, { onDelete: "cascade" }),
  purchased_connects: integer("purchased_connects").notNull(),
  amount_paid: numeric("amount_paid").notNull(),
  payment_id: text("payment_id").notNull().unique(),
  status: text("status").notNull().default("PENDING"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const connectsRelations = relations(connects, ({ many, one }) => ({
  freelancer: one(freelancer_metadata, {
    fields: [connects.freelancer_id],
    references: [freelancer_metadata.auth_id],
  }),
  history: many(connects_history),
  purchases: many(connects_purchase_history),
}));

export const connectsHistoryRelations = relations(
  connects_history,
  ({ one }) => ({
    balance: one(connects, {
      fields: [connects_history.connects_id],
      references: [connects.id],
    }),
  }),
);

export const connectsPurchaseHistoryRelations = relations(
  connects_purchase_history,
  ({ one }) => ({
    balance: one(connects, {
      fields: [connects_purchase_history.connects_id],
      references: [connects.id],
    }),
  }),
);

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  event_id: text("event_id").notNull().unique(),
  recipient_id: text("recipient_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  link: text("link"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  is_read: boolean("is_read").notNull().default(false),
  read_at: timestamp("read_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const proposals = pgTable(
  "proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    job_id: uuid("job_id")
      .notNull()
      .references(() => job_posts.id, { onDelete: "cascade" }),
    sender_id: text("sender_id").notNull(),
    sender_type: text("sender_type").notNull(),
    cover_letter: text("cover_letter").notNull(),
    bid_amount: numeric("bid_amount", { precision: 9, scale: 2 }).notNull(),
    duration: text("duration").notNull(),
    screening_answers: jsonb("screening_answers")
      .$type<Array<{ question: string; answer: string }>>()
      .notNull()
      .default([]),
    status: text("status").notNull().default("SUBMITTED"),
    is_shortlisted: boolean("is_shortlisted").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("proposal_sender_job_unique").on(table.sender_id, table.job_id),
  ],
);

export const proposalRelations = relations(proposals, ({ one }) => ({
  job: one(job_posts, {
    fields: [proposals.job_id],
    references: [job_posts.id],
  }),
}));

export const freelancer_saved_job_posts = pgTable(
  "freelancer_saved_job_posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    job_id: uuid("job_id")
      .notNull()
      .references(() => job_posts.id, { onDelete: "cascade" }),
    freelancer_id: text("freelancer_id")
      .notNull()
      .references(() => freelancer_metadata.auth_id, { onDelete: "cascade" }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("freelancer_saved_job_posts_freelancer_job_unique").on(
      table.freelancer_id,
      table.job_id,
    ),
  ],
);

export const freelancerSavedJobPostRelations = relations(
  freelancer_saved_job_posts,
  ({ one }) => ({
    job: one(job_posts, {
      fields: [freelancer_saved_job_posts.job_id],
      references: [job_posts.id],
    }),
    freelancer: one(freelancer_metadata, {
      fields: [freelancer_saved_job_posts.freelancer_id],
      references: [freelancer_metadata.auth_id],
    }),
  }),
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    job_id: uuid("job_id").references(() => job_posts.id, {
      onDelete: "set null",
    }),
    proposal_id: uuid("proposal_id").references(() => proposals.id, {
      onDelete: "set null",
    }),
    context_key: text("context_key").notNull(),
    last_message_id: uuid("last_message_id").references(
      (): AnyPgColumn => messages.id,
      { onDelete: "set null" },
    ),
    last_message_at: timestamp("last_message_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("conversations_context_key_unique").on(table.context_key),
    index("conversations_last_message_at_idx").on(table.last_message_at),
    index("conversations_job_id_idx").on(table.job_id),
    index("conversations_proposal_id_idx").on(table.proposal_id),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversation_id: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    sender_id: text("sender_id").references(() => accounts.auth_id, {
      onDelete: "set null",
    }),
    message_type: text("message_type").notNull().default("USER"),
    body: text("body"),
    event_type: text("event_type"),
    event_payload: jsonb("event_payload").$type<Record<string, unknown>>(),
    reply_to_message_id: uuid("reply_to_message_id").references(
      (): AnyPgColumn => messages.id,
      { onDelete: "set null" },
    ),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("messages_conversation_created_id_idx").on(
      table.conversation_id,
      table.created_at,
      table.id,
    ),
    index("messages_reply_to_message_id_idx").on(table.reply_to_message_id),
    check(
      "messages_content_check",
      sql`${table.message_type} = 'USER' OR (${table.message_type} = 'SYSTEM_EVENT' AND ${table.event_type} IS NOT NULL)`,
    ),
  ],
);

export const conversation_participants = pgTable(
  "conversation_participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversation_id: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    account_id: text("account_id")
      .notNull()
      .references(() => accounts.auth_id, { onDelete: "cascade" }),
    participant_type: text("participant_type").notNull(),
    last_read_message_id: uuid("last_read_message_id").references(
      () => messages.id,
      { onDelete: "set null" },
    ),
    last_read_at: timestamp("last_read_at", { withTimezone: true }),
    unread_count: integer("unread_count").notNull().default(0),
    joined_at: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    last_active_at: timestamp("last_active_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("conversation_participants_conversation_account_unique").on(
      table.conversation_id,
      table.account_id,
    ),
    index("conversation_participants_account_conversation_idx").on(
      table.account_id,
      table.conversation_id,
    ),
    check(
      "conversation_participants_unread_count_check",
      sql`${table.unread_count} >= 0`,
    ),
  ],
);

export const message_attachments = pgTable(
  "message_attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    message_id: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    storage_key: text("storage_key").notNull(),
    file_url: text("file_url").notNull(),
    file_name: text("file_name").notNull(),
    mime_type: text("mime_type").notNull(),
    file_size: integer("file_size").notNull(),
    attachment_type: text("attachment_type").notNull(),
    is_available: boolean("is_available").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("message_attachments_message_created_idx").on(
      table.message_id,
      table.created_at,
    ),
    check("message_attachments_file_size_check", sql`${table.file_size} >= 0`),
  ],
);

export const conversationRelations = relations(
  conversations,
  ({ many, one }) => ({
    job: one(job_posts, {
      fields: [conversations.job_id],
      references: [job_posts.id],
    }),
    proposal: one(proposals, {
      fields: [conversations.proposal_id],
      references: [proposals.id],
    }),
    lastMessage: one(messages, {
      fields: [conversations.last_message_id],
      references: [messages.id],
    }),
    participants: many(conversation_participants),
    messages: many(messages),
  }),
);

export const conversationParticipantRelations = relations(
  conversation_participants,
  ({ one }) => ({
    conversations: one(conversations, {
      fields: [conversation_participants.conversation_id],
      references: [conversations.id],
    }),
    account: one(accounts, {
      fields: [conversation_participants.account_id],
      references: [accounts.auth_id],
    }),
    lastReadMessage: one(messages, {
      fields: [conversation_participants.last_read_message_id],
      references: [messages.id],
    }),
  }),
);

export const messageRelations = relations(messages, ({ many, one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversation_id],
    references: [conversations.id],
  }),
  sender: one(accounts, {
    fields: [messages.sender_id],
    references: [accounts.auth_id],
  }),
  replyTo: one(messages, {
    fields: [messages.reply_to_message_id],
    references: [messages.id],
    relationName: "message_replies",
  }),
  replies: many(messages, { relationName: "message_replies" }),
  attachments: many(message_attachments),
}));

export const messageAttachmentRelations = relations(
  message_attachments,
  ({ one }) => ({
    message: one(messages, {
      fields: [message_attachments.message_id],
      references: [messages.id],
    }),
  }),
);
