import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../../database/client.js";
import {
  accounts,
  client_metadata,
  connects,
  connects_history,
  freelancer_metadata,
  job_posts,
  proposals,
} from "../../database/schema.js";
import { ApiError } from "../../utils/api-error.js";
import {
  CONNECTS_CACHE_TTL_SECONDS,
  getConnectsCacheKey,
  PROPOSAL_CONNECTS,
} from "../../config/constants.js";
import { redis } from "../../config/redis.js";
import { env } from "../../config/env.js";
import { createClerkClient } from "@clerk/backend";
import { sendNotification } from "../../events/publisher.js";

export const submitProposal = async (
  freelancerId: string,
  input: {
    jobId: string;
    coverLetter: string;
    bidAmount: number;
    duration: string;
    screeningAnswers: string[];
  },
) => {
  const result = await db.transaction(async (transaction) => {
    const [job] = await transaction
      .select({
        id: job_posts.id,
        title: job_posts.title,
        clientId: job_posts.client_id,
        screeningQuestions: job_posts.screening_questions,
      })
      .from(job_posts)
      .where(
        and(eq(job_posts.id, input.jobId), eq(job_posts.status, "PUBLISHED")),
      )
      .limit(1);
    if (!job) throw new ApiError(404, "Job post not found.");

    const questions = job.screeningQuestions ?? [];
    if (
      input.screeningAnswers.length !== questions.length ||
      input.screeningAnswers.some((answer) => !answer)
    ) {
      throw new ApiError(400, "Answer every screening question.");
    }

    const [balance] = await transaction
      .update(connects)
      .set({
        connects: sql`${connects.connects} - ${PROPOSAL_CONNECTS}`,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(connects.freelancer_id, freelancerId),
          gte(connects.connects, PROPOSAL_CONNECTS),
        ),
      )
      .returning();

    if (!balance) throw new ApiError(400, "Not enough Connects.");

    const [proposal] = await transaction
      .insert(proposals)
      .values({
        job_id: input.jobId,
        sender_id: freelancerId,
        sender_type: "FREELANCER",
        cover_letter: input.coverLetter,
        bid_amount: input.bidAmount.toString(),
        duration: input.duration,
        screening_answers: questions.map((question, index) => ({
          question,
          answer: input.screeningAnswers[index]!,
        })),
      })
      .onConflictDoNothing()
      .returning();
    if (!proposal)
      throw new ApiError(409, "You already submitted a proposal for this job.");

    await transaction.insert(connects_history).values({
      connects_id: balance.id,
      type: "Proposal submitted",
      description: job.title,
      amount: -PROPOSAL_CONNECTS,
    });
    return {
      proposal,
      connects: balance.connects,
      clientId: job.clientId,
      jobTitle: job.title,
    };
  });

  await redis.setEx(
    getConnectsCacheKey(freelancerId),
    CONNECTS_CACHE_TTL_SECONDS,
    String(result.connects),
  );

  await sendNotification({
    recipientId: result.clientId,
    type: "PROPOSAL_RECEIVED",
    title: "New proposal received",
    message: `A freelancer applied to “${result.jobTitle}”.`,
    link: `/proposals/${input.jobId}`,
    metadata: { proposalId: result.proposal.id, jobId: input.jobId },
  });

  return result;
};

const ACTIVE_PROPOSAL_STATUSES = new Set([
  "SUBMITTED",
  "VIEWED",
  "INTERVIEWED",
  "HIRED",
]);

export const getFreelancerProposalMetadata = async (freelancerId: string) => {
  const freelancerProposals = await db
    .select({
      jobId: proposals.job_id,
      status: proposals.status,
      submittedAt: proposals.created_at,
    })
    .from(proposals)
    .where(
      and(
        eq(proposals.sender_id, freelancerId),
        eq(proposals.sender_type, "FREELANCER"),
      ),
    )
    .orderBy(desc(proposals.created_at));

  const normalizedProposals = freelancerProposals.map((proposal) => ({
    ...proposal,
    status: proposal.status.toUpperCase(),
  }));

  return {
    proposals: normalizedProposals,
    counts: {
      total: normalizedProposals.length,
      active: normalizedProposals.filter((proposal) =>
        ACTIVE_PROPOSAL_STATUSES.has(proposal.status),
      ).length,
      viewed: normalizedProposals.filter(
        (proposal) => proposal.status === "VIEWED",
      ).length,
      interviewed: normalizedProposals.filter(
        (proposal) => proposal.status === "INTERVIEWED",
      ).length,
    },
  };
};

export const getFreelancerProposals = async (freelancerId: string) =>
  db
    .select({
      id: proposals.id,
      jobId: proposals.job_id,
      title: job_posts.title,
      company: client_metadata.company_name,
      status: proposals.status,
      submittedAt: proposals.created_at,
      budget: job_posts.total_budget,
      bidAmount: proposals.bid_amount,
      duration: proposals.duration,
      coverLetter: proposals.cover_letter,
      skills: job_posts.skills,
    })
    .from(proposals)
    .innerJoin(job_posts, eq(proposals.job_id, job_posts.id))
    .leftJoin(client_metadata, eq(job_posts.client_id, client_metadata.auth_id))
    .where(
      and(
        eq(proposals.sender_id, freelancerId),
        eq(proposals.sender_type, "FREELANCER"),
      ),
    )
    .orderBy(desc(proposals.created_at));

export const getClientJobProposals = async (
  clientId: string,
  jobId: string,
) => {
  const rows = await db
    .select({
      id: proposals.id,
      senderId: proposals.sender_id,
      freelancerId: freelancer_metadata.id,
      verified: accounts.identityVerified,
      professionalTitle: freelancer_metadata.professional_title,
      country: freelancer_metadata.country,
      city: freelancer_metadata.city,
      skills: freelancer_metadata.skills,
      coverLetter: proposals.cover_letter,
      bidAmount: proposals.bid_amount,
      duration: proposals.duration,
      screeningAnswers: proposals.screening_answers,
      status: proposals.status,
      isShortlisted: proposals.is_shortlisted,
      submittedAt: proposals.created_at,
    })
    .from(proposals)
    .innerJoin(job_posts, eq(proposals.job_id, job_posts.id))
    .leftJoin(
      freelancer_metadata,
      eq(proposals.sender_id, freelancer_metadata.auth_id),
    )
    .leftJoin(accounts, eq(proposals.sender_id, accounts.auth_id))
    .where(and(eq(proposals.job_id, jobId), eq(job_posts.client_id, clientId)))
    .orderBy(desc(proposals.created_at));

  const clerk = createClerkClient({ secretKey: env.clerkSecretKey });
  return Promise.all(
    rows.map(async ({ senderId, ...proposal }) => {
      try {
        const user = await clerk.users.getUser(senderId);
        return {
          ...proposal,
          senderName: user.fullName,
          avatar: user.imageUrl || null,
        };
      } catch (error) {
        return { ...proposal, senderName: null, avatarUrl: null };
      }
    }),
  );
};

export const updateProposal = async (proposalId: string, clientId: string) => {
  const [existing] = await db
    .select({
      id: proposals.id,
      senderId: proposals.sender_id,
      status: proposals.status,
      jobTitle: job_posts.title,
    })
    .from(proposals)
    .innerJoin(job_posts, eq(proposals.job_id, job_posts.id))
    .where(and(eq(proposals.id, proposalId), eq(job_posts.client_id, clientId)))
    .limit(1);
  if (!existing) throw new ApiError(404, "Proposal not found.");

  if (existing.status !== "SUBMITTED") {
    return { ...existing, changed: false };
  }

  const [updated] = await db
    .update(proposals)
    .set({ status: "VIEWED", updated_at: new Date() })
    .where(and(eq(proposals.id, proposalId), eq(proposals.status, "SUBMITTED")))
    .returning();

  return {
    ...existing,
    status: updated?.status ?? existing.status,
    changed: Boolean(updated),
  };
};

export const shortlistProposal = async (
  proposalId: string,
  clientId: string,
) => {
  const [proposal] = await db
    .update(proposals)
    .set({ is_shortlisted: true, updated_at: new Date() })
    .from(job_posts)
    .where(
      and(
        eq(proposals.id, proposalId),
        eq(proposals.job_id, job_posts.id),
        eq(job_posts.client_id, clientId),
      ),
    )
    .returning({ id: proposals.id, isShortlisted: proposals.is_shortlisted });
  if (!proposal) throw new ApiError(404, "Proposal not found.");
  return proposal;
};
