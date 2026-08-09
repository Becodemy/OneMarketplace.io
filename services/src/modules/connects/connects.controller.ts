import { RequestHandler } from "express";
import { requireFreelancer } from "../freelancer/freelancer.controller.js";
import { ApiResponse } from "../../types/common.types.js";
import { asyncHandler } from "../../utils/async-handler.js";
import {
  completeConnectsPurchase,
  createConnectsCheckout,
  getConnectsHistory,
} from "./connects.service.js";
import { CONNECTS_PLANS, ConnectsPlan } from "../../config/constants.js";
import { ApiError } from "../../utils/api-error.js";
import { env } from "../../config/env.js";
import { stripe } from "../../config/stripe.js";

export const getAvailableConnects: RequestHandler = (request, response) => {
  requireFreelancer(request);

  const body: ApiResponse<{ connects: number }> = {
    success: true,
    message: "Available Connects retrieved",
    data: { connects: request.availableConnects ?? 0 },
  };

  response.status(200).json(body);
};

export const getLoggedInFreelancerConnectsHistory: RequestHandler =
  asyncHandler(async (request, response) => {
    const auth = requireFreelancer(request);
    const history = await getConnectsHistory(auth.userId);
    const body: ApiResponse<typeof history> = {
      success: true,
      message: "Connects history retrieved.",
      data: history,
    };

    response.status(200).json(body);
  });

export const buyConnects: RequestHandler = asyncHandler(
  async (request, response) => {
    const auth = requireFreelancer(request);
    const purchasedConnects = Number(request.body?.connects) as ConnectsPlan;

    if (!(purchasedConnects in CONNECTS_PLANS)) {
      throw new ApiError(400, "Select a valid Connects package.");
    }

    const url = await createConnectsCheckout(auth.userId, purchasedConnects);
    response.status(200).json({
      success: true,
      message: "Stripe Checkout created.",
      data: { url },
    } satisfies ApiResponse<{ url: string }>);
  },
);

export const connectsWebhook: RequestHandler = asyncHandler(
  async (request, response) => {
    const signature = request.headers["stripe-signature"];
    if (!env.stripeWebhookSecret || typeof signature !== "string") {
      request.logger.error({
        message: "Webhook secret is missing",
        importance: "critical",
        service: "connects-controller",
      });
      throw new ApiError(400, "Invalid Stripe webhook.");
    }

    const event = stripe.webhooks.constructEvent(
      request.body,
      signature,
      env.stripeWebhookSecret,
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const purchasedConnects = Number(
        session.metadata?.purchasedConnects,
      ) as ConnectsPlan;
      const freelancerId = session.metadata?.freelancerId;

      if (
        session.payment_status === "paid" &&
        freelancerId &&
        purchasedConnects in CONNECTS_PLANS
      ) {
        await completeConnectsPurchase(
          freelancerId,
          purchasedConnects,
          session.id,
        );

        request.logger.success({
          message: `${purchasedConnects} connects purchased successfully for ${freelancerId}!`,
          importance: "high",
        });
      }
    }

    response.status(200).json({ received: true });
  },
);
