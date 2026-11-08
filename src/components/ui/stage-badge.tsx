import { Badge, type BadgeTone } from "@/components/ui/badge";

export type StageKind = "open" | "won" | "lost";

const tones: Record<StageKind, BadgeTone> = { open: "info", won: "success", lost: "danger" };

export function StageBadge({ name, kind }: { name: string; kind: StageKind }) {
  return <Badge tone={tones[kind]}>{name}</Badge>;
}
