// Public pages (registration form, parent portal, landing) show whose they are
// (organizations step 5): the organization's name on top, its contact e-mail at
// the bottom when it has one. Never the app's name, never another organization's.
export type PublicOrg = { name: string; contactEmail: string | null };

export function OrgName({ org }: { org: PublicOrg }) {
  return <p className="text-[14px] font-semibold text-ink">{org.name}</p>;
}

export function OrgFooter({ org, label }: { org: PublicOrg; label: string }) {
  if (!org.contactEmail) return null;
  return (
    <footer className="mt-12 border-t border-mist pt-4 text-[13px] text-ink-secondary">
      {label}{" "}
      <a href={`mailto:${org.contactEmail}`} className="text-ember hover:underline">
        {org.contactEmail}
      </a>
    </footer>
  );
}
