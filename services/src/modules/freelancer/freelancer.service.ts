import { and, count, desc, eq } from "drizzle-orm";
import { db } from "../../database/client.js";
import {
  accounts,
  client_metadata,
  freelancer_metadata,
  freelancer_portfolios,
  job_posts,
  proposals,
} from "../../database/schema.js";
import {
  FreelancerProfileData,
  PortfolioData,
  SaveFreelancerProfileInput,
} from "./@types.js";
import { env } from "../../config/env.js";
import { ApiError } from "../../utils/api-error.js";
import { imageKit } from "../../config/imageKit.js";
import { randomUUID } from "crypto";
import { APIError } from "@imagekit/nodejs";
import { redis } from "../../config/redis.js";
import {
  ACCOUNT_AUTH_CACHE_TTL_SECONDS,
  getAccountAuthCacheKey,
} from "../../config/constants.js";
import { addConnects } from "../connects/connects.service.js";
import { createClerkClient } from "@clerk/backend";

const getClientCountry = async (clientId: string) => {
  if (!env.clerkSecretKey) {
    throw new ApiError(503, "Authentication is not configured.");
  }

  const client = await createClerkClient({
    secretKey: env.clerkSecretKey,
  }).users.getUser(clientId);
  const country = client.unsafeMetadata.country;

  return typeof country === "string" ? country : null;
};

export const getFreelancerProfile = async (
  userId: string,
): Promise<FreelancerProfileData | null> => {
  const [result] = await db
    .select()
    .from(freelancer_metadata)
    .innerJoin(
      accounts,
      and(
        eq(accounts.auth_id, freelancer_metadata.auth_id),
        eq(accounts.role, "FREELANCER"),
      ),
    )
    .where(eq(freelancer_metadata.auth_id, userId))
    .limit(1);

  if (!result) return null;

  const profile = result.freelancer_metadata;

  const portfolios = await db
    .select()
    .from(freelancer_portfolios)
    .where(eq(freelancer_portfolios.freelancer_id, profile.id));

  return {
    ...profile,
    identityVerified: result.accounts.identityVerified === true,
    joined_at: profile.created_at,
    portfolios,
  };
};

const uploadPortfolioImages = async (
  userId: string,
  portfolios: PortfolioData[],
) => {
  if (!env.imageKitPrivateKey) {
    throw new ApiError(503, "Portfolio image uploads are not configured.");
  }

  const uploadedFileIds: string[] = [];
  const uploadedPortfolios: PortfolioData[] = [];

  try {
    for (const portfolio of portfolios) {
      if (!portfolio.cover_image.url.startsWith("data:image/")) {
        uploadedPortfolios.push(portfolio);
        continue;
      }

      const upload = await imageKit.files.upload({
        file: portfolio.cover_image.url,
        fileName: `portfolio-${randomUUID()}`,
        folder: `/onemarketplace/freelancer-portfolios/${userId}`,
      });

      if (!upload.fileId || !upload.url) {
        throw new ApiError(502, "Portfolio image upload failed.");
      }

      uploadedFileIds.push(upload.fileId);
      uploadedPortfolios.push({
        ...portfolio,
        cover_image: { imageId: upload.fileId, url: upload.url },
      });
    }

    return { uploadedPortfolios, uploadedFileIds };
  } catch (error) {
    await Promise.allSettled(
      uploadedFileIds.map((fileId) => imageKit.files.delete(fileId)),
    );
    throw error;
  }
};

export const saveFreelancerProfile = async (
  input: SaveFreelancerProfileInput,
  isOnboarded: Boolean | undefined,
): Promise<FreelancerProfileData> => {
  const existingImages = await db
    .select({ cover_image: freelancer_portfolios.cover_image })
    .from(freelancer_portfolios)
    .innerJoin(
      freelancer_metadata,
      eq(freelancer_portfolios.freelancer_id, freelancer_metadata.id),
    )
    .where(eq(freelancer_metadata.auth_id, input.userId));

  const { uploadedPortfolios, uploadedFileIds } = await uploadPortfolioImages(
    input.userId,
    input.portfolios,
  );

  let profile: FreelancerProfileData;

  try {
    profile = await db.transaction(async (transaction) => {
      const [account] = await transaction
        .update(accounts)
        .set({ isOnboardingComplete: true })
        .where(
          and(
            eq(accounts.auth_id, input.userId),
            eq(accounts.role, "FREELANCER"),
          ),
        )
        .returning();

      if (!account) throw new ApiError(404, "Freelancer account not found.");

      const metadataValues = {
        professional_title: input.professional_title,
        professional_description: input.professional_description,
        hourly_rate: input.hourly_rate,
        country: input.country,
        city: input.city,
        availability_status: input.availability_status,
        weekly_availability: input.weekly_availability,
        experience_level: input.experience_level,
        skills: input.skills,
        languages: input.languages,
      };

      const [metadata] = await transaction
        .insert(freelancer_metadata)
        .values({
          auth_id: input.userId,
          ...metadataValues,
        })
        .onConflictDoUpdate({
          target: freelancer_metadata.auth_id,
          set: metadataValues,
        })
        .returning();

      if (!metadata) {
        throw new ApiError(500, "Freelancer profile could not be saved.");
      }

      await transaction
        .delete(freelancer_portfolios)
        .where(eq(freelancer_portfolios.freelancer_id, metadata.id));

      const portfolios = await transaction
        .insert(freelancer_portfolios)
        .values(
          uploadedPortfolios.map((portfolio) => ({
            freelancer_id: metadata.id,
            ...portfolio,
          })),
        )
        .returning();

      return {
        professional_title: metadata.professional_title,
        professional_description: metadata.professional_description,
        hourly_rate: metadata.hourly_rate,
        country: metadata.country,
        city: metadata.city,
        availability_status: metadata.availability_status,
        weekly_availability: metadata.weekly_availability,
        experience_level: metadata.experience_level,
        skills: metadata.skills,
        languages: metadata.languages,
        portfolios,
        identityVerified: account.identityVerified === true,
        joined_at: metadata.created_at,
      };
    });
  } catch (error) {
    await Promise.allSettled(
      uploadedFileIds.map((fileId) => imageKit.files.delete(fileId)),
    );
    throw error;
  }

  const retainedImageIds = new Set(
    uploadedPortfolios.map(({ cover_image }) => cover_image.imageId),
  );

  await Promise.allSettled(
    existingImages
      .map(({ cover_image }) => cover_image.imageId)
      .filter((fileId) => fileId && !retainedImageIds.has(fileId))
      .map((fileId) => imageKit.files.delete(fileId)),
  );

  try {
    if (!isOnboarded) {
      await addConnects(input.userId);
    }
  } catch (error) {
    console.log(error, "onboarding freelancer connects adding error.");
  }

  await redis.setEx(
    getAccountAuthCacheKey(input.userId, "freelancer"),
    ACCOUNT_AUTH_CACHE_TTL_SECONDS,
    JSON.stringify({
      userId: input.userId,
      role: "freelancer",
      accountExists: true,
      isOnboarded: true,
    }),
  );

  return profile;
};

export const getMatchedJobPosts = async (
  userId: string,
  filters: {
    sort?: "best-match" | "recent";
    levels?: string[];
    durations?: string[];
    minBudget?: number;
    maxBudget?: number;
    minProposals?: number;
    maxProposals?: number;
    paymentVerified?: boolean;
  } = {},
) => {
  const [profile] = await db
    .select({ skills: freelancer_metadata.skills })
    .from(freelancer_metadata)
    .where(eq(freelancer_metadata.auth_id, userId));

  if (!profile) throw new ApiError(404, "Freelancer profile not found.");

  const skills = profile.skills.map((skill) => skill.toLowerCase());

  const jobs = await db
    .select({
      job: job_posts,
      companyName: client_metadata.company_name,
      paymentVerified: accounts.paymentMethodVerified,
    })
    .from(job_posts)
    .innerJoin(accounts, eq(job_posts.client_id, accounts.auth_id))
    .innerJoin(
      client_metadata,
      eq(job_posts.client_id, client_metadata.auth_id),
    )
    .where(eq(job_posts.status, "PUBLISHED"))
    .orderBy(desc(job_posts.published_at));

  const proposalCounts = await db
    .select({ jobId: proposals.job_id, count: count(proposals.id) })
    .from(proposals)
    .groupBy(proposals.job_id);

  const clientCountries = new Map(
    await Promise.all(
      [...new Set(jobs.map(({ job }) => job.client_id))].map(
        async (clientId) =>
          [clientId, await getClientCountry(clientId)] as const,
      ),
    ),
  );

  const counts = new Map(
    proposalCounts?.map((item) => [item.jobId, Number(item.count)]),
  );

  const filteredJobs = jobs
    .map(({ job, companyName, paymentVerified }) => ({
      ...job,
      companyName,
      clientCountry: clientCountries.get(job.client_id) ?? null,
      paymentVerified: paymentVerified === true,
      proposalCount: counts?.get(job.id) ?? 0,
    }))
    .filter((job) => {
      const budget = Number(job.total_budget);
      return (
        (!filters.levels?.length ||
          filters.levels.includes(job.expertise_level)) &&
        (!filters.durations?.length ||
          filters.durations.includes(job.expected_duration)) &&
        (filters.minBudget === undefined || budget >= filters.minBudget) &&
        (filters.maxBudget === undefined || budget <= filters.maxBudget) &&
        (filters.minProposals === undefined ||
          job.proposalCount >= filters.minProposals) &&
        (filters.maxProposals === undefined ||
          job.proposalCount <= filters.maxProposals) &&
        (!filters.paymentVerified || job.paymentVerified)
      );
    });

  if (filters.sort === "recent") return filteredJobs;

  return filteredJobs
    .map((job) => {
      const jobSkills = job.skills.map((skill) => skill.toLowerCase());
      const content = `${job.title} ${job.description}`.toLowerCase();
      const skillMatches = skills.filter((skill) =>
        jobSkills.some(
          (jobSkill) => jobSkill === skill || jobSkill.includes(skill),
        ),
      ).length;
      const contentMatches = skills.filter((skill) =>
        content.includes(skill),
      ).length;

      return { ...job, matchScore: skillMatches * 2 + contentMatches };
    })
    .filter((job) => job.matchScore > 0)
    .sort(
      (first, second) =>
        second.matchScore - first.matchScore ||
        new Date(second.published_at ?? second.created_at ?? 0).getTime() -
          new Date(first.published_at ?? first?.created_at ?? 0).getTime(),
    );
};

export const getFreelancerJobPost = async (jobId: string) => {
  const [result] = await db
    .select({
      job: job_posts,
      companyName: client_metadata.company_name,
      companyDescription: client_metadata.company_description,
      paymentVerified: accounts.paymentMethodVerified,
      clientJoinedAt: accounts.created_at,
    })
    .from(job_posts)
    .innerJoin(accounts, eq(job_posts.client_id, accounts.auth_id))
    .innerJoin(
      client_metadata,
      eq(job_posts.client_id, client_metadata.auth_id),
    )
    .where(and(eq(job_posts.id, jobId), eq(job_posts.status, "PUBLISHED")))
    .limit(1);

  if (!result) throw new ApiError(404, "Job post not found.");

  const [proposalTotal] = await db
    .select({ count: count(proposals.id) })
    .from(proposals)
    .where(eq(proposals.job_id, jobId));

  const clientCountry = await getClientCountry(result.job.client_id);

  return {
    ...result.job,
    companyName: result.companyName,
    companyDescription: result.companyDescription,
    clientCountry,
    paymentVerified: result.paymentVerified === true,
    clientJoinedAt: result.clientJoinedAt,
    proposalCount: Number(proposalTotal?.count ?? 0),
  };
};

export const getPublicFreelancerProfile = async (profileId: string) => {
  const [freelancer] = await db
    .select({ userId: freelancer_metadata.auth_id })
    .from(freelancer_metadata)
    .where(eq(freelancer_metadata.id, profileId))
    .limit(1);
  if (!freelancer) return null;

  const profile = await getFreelancerProfile(freelancer.userId);
  if (!profile) return null;

  const user = await createClerkClient({
    secretKey: env.clerkSecretKey,
  }).users.getUser(freelancer.userId);
  const { auth_id: _authId, ...publicProfile } =
    profile as FreelancerProfileData & {
      auth_id?: string;
    };

  return {
    ...publicProfile,
    id: profileId,
    name: user.fullName ?? "Freelancer",
    avatarUrl: user.imageUrl || null,
  };
};
