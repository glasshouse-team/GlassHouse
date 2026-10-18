/** "Your host: Giorgi" with initials (profiles have only a name and an avatar). */
export function HostCard({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return (
    <div className="flex items-center gap-3">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatars come from any host
        <img src={avatarUrl} alt="" className="size-10 rounded-full object-cover" />
      ) : (
        <span className="flex size-10 items-center justify-center rounded-full bg-brand text-sm font-semibold text-primary-foreground">
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <p className="text-sm">
        <span className="font-medium">Your host: {name}</span>
      </p>
    </div>
  );
}
