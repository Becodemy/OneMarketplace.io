export type Job = {
  id: string;
  title: string;
  company: string;
  verified: boolean;
  posted: string;
  type: "Hourly" | "Fixed price";
  budget: string;
  level: string;
  duration: string;
  description: string;
  skills: string[];
  proposals: string;
  clientRating?: number;
  clientSpent?: string;
  screeningQuestions?: string[];
  location?: string;
  featured?: boolean;
};
