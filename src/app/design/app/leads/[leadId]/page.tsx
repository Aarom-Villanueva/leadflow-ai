import { leadById } from "@/app/design/_data/fixtures";
import { LeadDetailClient, LeadNotFound } from "@/app/design/app/leads/_components/lead-detail-client";

export default async function LeadDetailPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  const lead = leadById(leadId);
  if (!lead) return <LeadNotFound />;
  return <LeadDetailClient lead={lead} />;
}
