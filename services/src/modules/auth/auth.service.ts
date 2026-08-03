import { createClerkClient } from "@clerk/backend";
import { env } from "../../config/env.js";
import { ApiError } from "../../utils/api-error.js";
import { db } from "../../database/client.js";
import { accounts } from "../../database/schema.js";
import { redis } from "../../config/redis.js";
import {
  ACCOUNT_AUTH_CACHE_TTL_SECONDS,
  getAccountAuthCacheKey,
} from "../../config/constants.js";

export interface SignupInput {
  userId: string;
  sessionId?: string;
  role: "client" | "freelancer";
  accountExists: boolean;
  isOnboarded: boolean;
}

const toDatabaseRole = (role: SignupInput["role"]): "CLIENT" | "FREELANCER" =>
  role === "client" ? "CLIENT" : "FREELANCER";

export const receiveSignup = async (input: SignupInput): Promise<void> => {
  if (input.accountExists) {
    return;
  }

  const clerk = createClerkClient({ secretKey: env.clerkSecretKey });
  const user = await clerk.users.getUser(input.userId);
  const email =
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses.at(0)?.emailAddress;

  if (!email) {
    throw new ApiError(400, "The authenticated account has no email address.");
  }

  const now = new Date();

  try {
    await db
      .insert(accounts)
      .values({
        auth_id: input.userId,
        email,
        role: toDatabaseRole(input.role),
        identityVerified: false,
        isOnboardingComplete: false,
        created_at: now,
        updated_at: now,
      })
      .onConflictDoNothing({
        target: [accounts.auth_id, accounts.role],
      });
  } catch (error) {
    console.log(error, "db insert error");
  }

  await redis.setEx(
    getAccountAuthCacheKey(input.userId, input.role),
    ACCOUNT_AUTH_CACHE_TTL_SECONDS,
    JSON.stringify({
      userId: input.userId,
      role: input.role,
      accountExists: true,
      isOnboarded: false,
    }),
  );
};
