"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Banner } from "@/components/ui/banner";
import { SYNTHETIC_AI_DRAFT, leadById } from "@/app/design/_data/fixtures";

/**
 * Borrador revisable por la persona — nunca una ruta de envío (R09, SECURITY.md):
 * solo copiar o descartar. "Copiar" usa el portapapeles del propio navegador,
 * nunca una petición de red.
 */
export function AiDraftTab() {
  const [body, setBody] = useState(SYNTHETIC_AI_DRAFT.body);
  const [copied, setCopied] = useState(false);
  const lead = leadById(SYNTHETIC_AI_DRAFT.leadId);

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[0.8125rem] text-[var(--text-secondary)]">
        {lead ? (
          <>
            Para <span className="font-medium text-[var(--text-primary)]">{lead.name}</span>.
          </>
        ) : null}{" "}
        Revisa y edita antes de copiarlo — nunca se envía automáticamente.
      </p>
      <Field id="ai-draft-subject" label="Asunto">
        {(describedBy) => <Input id="ai-draft-subject" defaultValue={SYNTHETIC_AI_DRAFT.subject} aria-describedby={describedBy} />}
      </Field>
      <Field id="ai-draft-body" label="Mensaje">
        {(describedBy) => (
          <Textarea id="ai-draft-body" value={body} onChange={(event) => { setBody(event.target.value); setCopied(false); }} aria-describedby={describedBy} className="min-h-32" />
        )}
      </Field>
      {copied ? (
        <Banner tone="success" title="Copiado al portapapeles">
          Pégalo donde quieras enviarlo tú mismo — ningún envío ocurre desde aquí.
        </Banner>
      ) : null}
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={copyDraft}>
          Copiar
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setBody(SYNTHETIC_AI_DRAFT.body);
            setCopied(false);
          }}
        >
          Descartar cambios
        </Button>
      </div>
    </div>
  );
}
