import { Router } from "express";
import { isAuthenticated } from "../../middleware/auth.middleware.js";
import {
  getLoggedInFreelancerProfile,
  upsertFreelanceProfile,
} from "./freelancer.controller.js";

export const freelancerRouter = Router();

freelancerRouter.get("/profile", isAuthenticated, getLoggedInFreelancerProfile);
freelancerRouter.put("/profile", isAuthenticated, upsertFreelanceProfile);
