import { Badge, PageHeader } from "./ui";
import { Sparkles } from "lucide-react";

export function Placeholder({ name }: { name: string }) {
  return (
    <>
      <PageHeader
        eyebrow="BeatVault workspace"
        title={name}
        description="This space is reserved for a future BeatVault module."
      />
      <section className="panel placeholder">
         <div className="placeholder-icon"><Sparkles size={24} aria-hidden="true" /></div>
        <h2>Coming into focus</h2>
        <p>
          {name} will become part of your production ecosystem in a future
          release.
        </p>
        <Badge tone="violet">Planned module</Badge>
      </section>
    </>
  );
}
