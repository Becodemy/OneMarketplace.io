import { Router } from "express";
import { SERVICE_NAME } from "../config/constants.js";
import { ApiResponse } from "../types/common.types.js";
import { authRouter } from "../modules/auth/auth.route.js";
import { clientRouter } from "../modules/client/client.route.js";
import { freelancerRouter } from "../modules/freelancer/freelancer.route.js";
import { jobRouter } from "../modules/jobs/jobs.route.js";
import { connectsRouter } from "../modules/connects/connects.route.js";
import { notificationRouter } from "../modules/notifications/notifications.route.js";
import { proposalRouter } from "../modules/proposals/proposals.route.js";
import { messagingRouter } from "../modules/messaging/messaging.route.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/client", clientRouter);
apiRouter.use("/freelancer", freelancerRouter);
apiRouter.use("/jobs", jobRouter);
apiRouter.use("/connects", connectsRouter);
apiRouter.use("/notifications", notificationRouter);
apiRouter.use("/proposals", proposalRouter);
apiRouter.use("/conversations", messagingRouter);

apiRouter.get("/health", (_request, response) => {
  const body: ApiResponse<{
    service: string;
    status: "healthy";
    timestamp: string;
  }> = {
    success: true,
    message: "Service is healthy",
    data: {
      service: SERVICE_NAME,
      status: "healthy",
      timestamp: new Date().toISOString(),
    },
  };

  response.status(200).json(body);
});
