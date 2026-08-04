import { RequestHandler } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { ApiError } from "../../utils/api-error.js";
import {
  ClientMetadataData,
  ClientProfileData,
  getClientProfile,
  saveClientProfile,
  SaveClientProfileInput,
} from "./client.service.js";
import { ApiResponse } from "../../types/common.types.js";

export const getLoggedInClientProfile: RequestHandler = asyncHandler(
  async (request, response) => {
    if (!request.auth) {
      throw new ApiError(401, "Authentication is required.");
    }

    if (request.auth.role !== "client") {
      throw new ApiError(403, "A client account is required.");
    }

    const profile = await getClientProfile(request.auth.userId);
    const responseBody: ApiResponse<ClientMetadataData | null> = {
      success: true,
      message: profile
        ? "Client profile retrived"
        : "Client profile has not been completed.",
      data: profile,
    };

    response.status(200).json(responseBody);
  },
);

interface ClientProfileBody {
  professionalRole?: string;
  companyName?: string;
  companyWebsite?: string | undefined;
  companySize?: string;
  industry?: string;
  companyDescription?: string;
}

const requireText = (value: string | undefined, fieldName: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, `${fieldName} is required.`);
  }

  return value.trim();
};

const requireWebsite = (value: string | undefined): string => {
  const website = requireText(value, "Company website");

  try {
    const url = new URL(website);

    if (url.protocol !== "https:") {
      throw new Error("Unsupported protocol.");
    }
  } catch (error) {
    throw new ApiError(400, "Company website must be a valid HTTP URL.");
  }

  return website;
};

export const upsertClientProfile: RequestHandler = asyncHandler(
  async (request, response) => {
    if (!request.auth) {
      throw new ApiError(401, "Authentication is required.");
    }

    if (request.auth.role !== "client") {
      throw new ApiError(403, "A client account is required.");
    }

    const body = request.body as ClientProfileBody;
    const input: SaveClientProfileInput = {
      userId: request.auth.userId,
      professionalRole: requireText(body.professionalRole, "Professional role"),
      companyName: requireText(body.companyName, "Company name"),
      companyWebsite: requireWebsite(body.companyWebsite),
      companySize: requireText(body.companySize, "Company size"),
      industry: requireText(body.industry, "Industry"),
      companyDescription: requireText(
        body.companyDescription,
        "Company description",
      ),
    };

    const profile = await saveClientProfile(input);
    const responseBody: ApiResponse<ClientProfileData> = {
      success: true,
      message: "Client profile saved.",
      data: profile,
    };

    response.status(200).json(responseBody);
  },
);
