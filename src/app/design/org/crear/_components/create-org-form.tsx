"use client";

import { useId, useState } from "react";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const TIMEZONES = ["America/Bogota", "America/Lima", "America/Mexico_City", "America/Argentina/Buenos_Aires", "Europe/Madrid"];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function CreateOrgForm({ vista }: { vista: string }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const nameId = useId();
  const slugId = useId();
  const tzId = useId();
  const loading = vista === "carga";

  return (
    <div className="flex flex-col gap-4" aria-busy={loading}>
      <Field id={nameId} label="Nombre de la organización" required>
        {(describedBy) => (
          <Input
            id={nameId}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (!slugEdited) setSlug(slugify(event.target.value));
            }}
            aria-describedby={describedBy}
            disabled={loading}
          />
        )}
      </Field>
      <Field
        id={slugId}
        label="Slug"
        hint="Se usa en enlaces internos; puedes editarlo."
        error={vista === "validacion" ? "Este slug ya está en uso; elige otro." : undefined}
      >
        {(describedBy) => (
          <div className="flex items-center gap-2">
            <Input
              id={slugId}
              value={slug}
              onChange={(event) => {
                setSlugEdited(true);
                setSlug(slugify(event.target.value));
              }}
              aria-invalid={vista === "validacion" || undefined}
              aria-describedby={describedBy}
              disabled={loading}
              className="flex-1"
            />
            {slug && vista !== "validacion" ? <Badge tone="success">Disponible</Badge> : null}
          </div>
        )}
      </Field>
      <Field id={tzId} label="Zona horaria" required>
        {(describedBy) => (
          <Select id={tzId} defaultValue={TIMEZONES[0]} aria-describedby={describedBy} disabled={loading}>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {loading ? (
        <Button variant="primary" disabled className="mt-2">
          Creando organización…
        </Button>
      ) : (
        <ButtonLink href="/design/app/leads" variant="primary" className="mt-2 self-start">
          Crear organización
        </ButtonLink>
      )}
    </div>
  );
}
