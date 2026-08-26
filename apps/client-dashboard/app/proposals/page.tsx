import type { Metadata } from "next";
import { ClientShell } from "../_components/dashboard/client-shell";
import { ProposalsDashboard } from "../_components/proposals/proposals-dashboard";

export const metadata: Metadata = {
  title: "Proposals",
  description:
    "Review, shortlist, interview, and hire freelancers or agencies.",
};

export default async function ProposalsPage() {
  return (
    <ClientShell>
      <ProposalsDashboard />
    </ClientShell>
  );
}
