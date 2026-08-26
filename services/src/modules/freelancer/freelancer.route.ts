import { Router } from "express";
import { isAuthenticated } from "../../middleware/auth.middleware.js";
import {
  getFreelancerJobDetails,
  getFreelancerJobFeed,
  getLoggedInFreelancerProfile,
  getPublicFreelancer,
  upsertFreelanceProfile,
} from "./freelancer.controller.js";

export const freelancerRouter = Router();

freelancerRouter.get("/profile", isAuthenticated, getLoggedInFreelancerProfile);
freelancerRouter.get("/profile/:id", getPublicFreelancer);
freelancerRouter.put("/profile", isAuthenticated, upsertFreelanceProfile);
freelancerRouter.get("/jobs", isAuthenticated, getFreelancerJobFeed);
freelancerRouter.get("/jobs/:id", isAuthenticated, getFreelancerJobDetails);
