import { relations } from "drizzle-orm";
import {
  boolean,
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
