import { initials, speakerColor } from "@/lib/speaker";

/** A small circular initials chip tinted with the speaker's stable color. */
export function SpeakerAvatar({ userId, name, size = 28 }: { userId: string; name: string; size?: number }) {
  const color = speakerColor(userId);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        color,
        backgroundColor: `${color}22`,
        border: `1px solid ${color}55`,
      }}
      title={name}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
