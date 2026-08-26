import { Icon } from "@iconify/react";
import Link from "next/link";
import type { ClientProposal } from "../data/client-data";
import { AgencyMembersPagination } from "./agency-members-pagination";
import { WorkHistoryPagination } from "./work-history-pagination";
import Image from "next/image";

const agencyPortfolio = [
  {
    title: "Collaborative analytics workspace",
    category: "SaaS product",
    result: "Used by 4,000+ product teams",
    imageUrl: null,
    liveUrl: null,
    icon: "solar:chart-square-linear",
    tone: "from-[#dcebe2] to-[#abcbb8]",
  },
  {
    title: "AI-assisted research workflow",
    category: "AI application",
    result: "Reduced research review time by 42%",
    imageUrl: null,
    liveUrl: null,
    icon: "solar:magic-stick-3-linear",
    tone: "from-[#e6e2f1] to-[#beb5d8]",
  },
];

export function PublicMarketplaceProfile({
  profile,
}: {
  profile: ClientProposal;
}) {
  const agency = profile.accountType === "Agency";
  const firstName = profile.bidder.split(" ")[0];
  const portfolio = agency
    ? agencyPortfolio
    : (profile.portfolios ?? []).map((project) => ({
        title: project.title,
        category: project.category,
        result: project.description,
        imageUrl: project.cover_image.url,
        liveUrl: project.live_url,
        icon: "solar:code-square-linear",
        tone: "from-[#dcebe2] to-[#abcbb8]",
      }));

  return (
    <>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Link
            href="/proposals"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#52784f]"
          >
            <Icon icon="solar:arrow-left-linear" width="15" />
            Back to proposals
          </Link>
          <p className="mt-5 text-xs font-semibold tracking-[.14em] text-[#62805f] uppercase">
            Public {agency ? "agency" : "talent"} profile
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em] sm:text-4xl">
            {profile.bidder}
          </h1>
        </div>
        <Link
          href="/messages"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#252724] px-5 text-sm font-semibold text-white"
        >
          <Icon icon="solar:chat-round-dots-linear" width="18" />
          Message {agency ? "agency" : firstName}
        </Link>
      </div>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[290px_minmax(0,1fr)]">
        <aside className="grid gap-5 lg:sticky lg:top-24">
          <section className="rounded-3xl border border-black/8 bg-white p-6 text-center">
            <div className="relative mx-auto h-28 w-28">
              <span
                className={`flex h-full w-full items-center justify-center bg-[#496e67] text-3xl font-semibold text-white ${
                  agency ? "rounded-3xl" : "rounded-full"
                }`}
              >
                {profile.avatarUrl ? (
                  <Image
                    src={profile.avatarUrl}
                    alt={profile.bidder}
                    fill
                    sizes="112px"
                    className="rounded-full object-cover"
                  />
                ) : (
                  profile.initials
                )}
              </span>
              {profile.online && (
                <span className="absolute right-1 bottom-1 h-5 w-5 rounded-full border-4 border-white bg-[#59a05d]" />
              )}
            </div>
            <h2 className="mt-5 inline-flex items-center justify-center gap-1.5 text-xl font-semibold">
              {profile.bidder}
              {profile.verified && (
                <Icon
                  icon="solar:verified-check-bold"
                  width="18"
                  className="text-[#5b8658]"
                />
              )}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#656b63]">
              {profile.title}
            </p>
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-[#777c74]">
              <Icon icon="solar:map-point-linear" width="16" />
              {profile.location}
            </p>
            <div className="mt-6 grid grid-cols-3 border-y border-black/7 py-4">
              <Stat value={`${profile.jobSuccess}%`} label="Job success" />
              <Stat value={String(profile.rating)} label="Rating" bordered />
              <Stat
                value={String(profile.completedProjects)}
                label="Projects"
              />
            </div>
            <div className="mt-5 text-left">
              <Detail
                label={agency ? "Team size" : "Availability"}
                value={agency ? "8 specialists" : profile.duration}
              />
              <div className="mt-4">
                <Detail
                  label="Response time"
                  value={agency ? "Within 4 hours" : "Within 1 day"}
                />
              </div>
              <div className="mt-4">
                <p className="text-xs font-semibold tracking-wide text-[#858a82] uppercase">
                  Languages
                </p>
                <div className="mt-3 grid gap-2 text-sm text-[#656b63]">
                  {profile.languages?.length ? (
                    profile.languages.map(({ language, proficiency }) => (
                      <p key={language}>
                        {language} – {proficiency}
                      </p>
                    ))
                  ) : (
                    <p>Not specified</p>
                  )}
                </div>
              </div>
            </div>
          </section>
          {!agency && profile.verified && (
            <section className="rounded-2xl border border-[#d2dfcf] bg-[#edf4ea] p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#476f44]">
                <Icon icon="solar:verified-check-bold" width="20" />
                Identity verified
              </div>
              <p className="mt-2 text-xs leading-5 text-[#657063]">
                Securely verified through Stripe Identity.
              </p>
            </section>
          )}
        </aside>

        <div className="grid min-w-0 gap-6">
          <section className="overflow-hidden rounded-3xl border border-black/8 bg-white">
            <div className="bg-[radial-gradient(circle_at_82%_18%,rgba(151,195,145,.32),transparent_34%),linear-gradient(135deg,#e5efe2,#f8faf6)] p-6 sm:p-8">
              <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
                <div>
                  <p className="text-xs font-semibold tracking-[.14em] text-[#5c8159] uppercase">
                    Available for selected projects
                  </p>
                  <h2 className="mt-3 max-w-2xl text-3xl leading-tight font-semibold tracking-[-.04em]">
                    {agency
                      ? "A senior product team for ambitious digital products."
                      : profile.title}
                  </h2>
                </div>
                {!agency && (
                  <div className="shrink-0 sm:text-right">
                    <p className="text-xs text-[#7c8179]">Hourly rate</p>
                    <p className="mt-1 text-xl font-semibold">
                      ${profile.bid}
                      <span className="text-sm text-[#7c8179]">/hr</span>
                    </p>
                  </div>
                )}
              </div>
              <p className="mt-6 max-w-3xl text-sm leading-7 text-[#626860]">
                {agency
                  ? "We partner with product teams to design and build dependable web applications—from strategy and prototypes through scalable engineering and launch. Clients work with one accountable agency backed by focused specialists."
                  : profile.coverLetter}
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {profile.skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-xl bg-white/85 px-3 py-2 text-xs font-medium text-[#4f584d]"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <ProfileSection
            eyebrow="Selected work"
            title={agency ? "Agency portfolio" : "Portfolio"}
            detail={`${portfolio.length} featured projects`}
          >
            <div className="grid max-w-lg gap-4">
              {portfolio.map((project) => (
                <article
                  key={project.title}
                  className="overflow-hidden rounded-xl border border-black/10 bg-white"
                >
                  <div
                    className={`relative flex h-44 items-center justify-center bg-linear-to-br ${project.tone}`}
                  >
                    {project.imageUrl ? (
                      <Image
                        src={project.imageUrl}
                        alt={project.title}
                        fill
                        sizes="(max-width: 1024px) 100vw, 900px"
                        className="object-cover"
                      />
                    ) : (
                      <Icon
                        icon={project.icon}
                        width="38"
                        className="text-[#46645a]"
                      />
                    )}
                  </div>
                  <div className="p-4 sm:p-5">
                    <p className="text-xs font-semibold tracking-[.14em] text-[#62805f] uppercase">
                      {project.category}
                    </p>
                    <h3 className="mt-3 text-xl font-semibold tracking-[-.03em]">
                      {project.title}
                    </h3>
                    <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#777d75]">
                      {project.result}
                    </p>
                    {project.liveUrl && (
                      <div className="mt-5 border-t border-black/8 pt-4">
                        <a
                          href={project.liveUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 text-sm font-semibold text-[#52784f]"
                        >
                          View live project
                          <Icon icon="solar:arrow-right-up-linear" width="18" />
                        </a>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </ProfileSection>

          {agency && <AgencyMembersPagination />}

          <WorkHistoryPagination averageRating={profile.rating} />
        </div>
      </div>
    </>
  );
}

function ProfileSection({
  eyebrow,
  title,
  detail,
  children,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-black/8 bg-white p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold tracking-[.13em] text-[#62805f] uppercase">
            {eyebrow}
          </p>
          <h2 className="mt-2 text-xl font-semibold">{title}</h2>
        </div>
        <p className="text-xs text-[#8a8f87]">{detail}</p>
      </div>
      {children}
    </section>
  );
}

function Stat({
  value,
  label,
  bordered = false,
}: {
  value: string;
  label: string;
  bordered?: boolean;
}) {
  return (
    <div className={bordered ? "border-x border-black/7" : ""}>
      <strong className="block">{value}</strong>
      <span className="mt-1 block text-[10px] text-[#858a82]">{label}</span>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-[#858a82]">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}
