import { ActionLink } from "@/components/ui/action-link";
import { SectionHeading } from "@/components/ui/section-heading";

const principles = [
  { number: "01", title: "Relaciones con contexto", description: "La visión: reunir prospectos, conversaciones y próximas acciones en un mismo lugar." },
  { number: "02", title: "Un proceso más claro", description: "Un pipeline pensado para entender en qué punto está cada oportunidad." },
  { number: "03", title: "IA con criterio humano", description: "Asistencia para resumir y redactar. Las decisiones y la aprobación siempre serán tuyas." },
];

export default function Home() {
  return <>
    <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-6 py-7 sm:px-10">
      <a href="#main" aria-label="LeadFlow AI, inicio" className="flex items-center gap-3 rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime-300">
        <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-xl bg-lime-300 text-lg font-bold text-slate-950">L</span>
        <span className="text-xl font-semibold tracking-tight">LeadFlow <span className="text-lime-300">AI</span></span>
      </a>
      <nav aria-label="Navegación principal"><a href="#vision" className="rounded text-sm text-slate-200 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime-300">Conoce la visión <span aria-hidden="true">↗</span></a></nav>
    </header>
    <main id="main" tabIndex={-1}>
      <section aria-labelledby="hero-title" className="mx-auto grid max-w-6xl gap-14 px-6 pb-20 pt-16 sm:px-10 sm:pt-24 lg:grid-cols-[1.3fr_1fr] lg:items-center">
        <div>
          <p className="mb-7 text-xs font-semibold uppercase tracking-[0.22em] text-lime-300">Gestión comercial · Asistencia inteligente</p>
          <h1 id="hero-title" className="max-w-3xl text-5xl leading-[1.08] font-semibold tracking-tight sm:text-6xl lg:text-7xl">Más contexto.<br /><span className="text-lime-300">Mejores próximos pasos.</span></h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-slate-300">Estamos construyendo una forma más clara de cuidar tus relaciones comerciales. Organización, seguimiento e inteligencia artificial, con las personas al mando.</p>
          <div className="mt-9"><ActionLink href="#vision">Explorar la visión <span aria-hidden="true" className="ml-4">↓</span></ActionLink></div>
        </div>
        <aside aria-labelledby="status-title" className="rounded-3xl border border-slate-700 bg-[#122126] p-8 sm:p-10">
          <div aria-hidden="true" className="mb-12 flex gap-2"><span className="size-2 rounded-full bg-lime-300" /><span className="size-2 rounded-full bg-slate-600" /><span className="size-2 rounded-full bg-slate-600" /></div>
          <p className="text-xs font-medium uppercase tracking-widest text-slate-300">El primer paso</p>
          <h2 id="status-title" className="mt-4 text-3xl font-semibold">Una base sólida para lo que viene.</h2>
          <p className="mt-5 leading-7 text-slate-300">LeadFlow AI está en desarrollo. Esta entrega establece su base técnica; las funciones comerciales todavía no están disponibles.</p>
          <p className="mt-9 border-t border-slate-700 pt-5 text-sm text-lime-300">LF-001 <span className="mx-2 text-slate-400">/</span> Base técnica inicial</p>
        </aside>
      </section>
      <section id="vision" aria-labelledby="vision-title" className="border-y border-slate-800 bg-[#0e1b20]">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:px-10">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-lime-300">La dirección</p>
          <SectionHeading id="vision-title">Menos dispersión. Más claridad.</SectionHeading>
          <div className="mt-12 grid gap-10 md:grid-cols-3">{principles.map((principle) => <article key={principle.number}>
            <span className="text-sm text-lime-300">{principle.number}</span><h3 className="mt-5 text-xl font-semibold">{principle.title}</h3><p className="mt-3 leading-7 text-slate-300">{principle.description}</p>
          </article>)}</div>
        </div>
      </section>
    </main>
    <footer className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 px-6 py-8 text-sm text-slate-400 sm:px-10"><p>LeadFlow AI</p><p>Diseñado para avanzar con intención.</p></footer>
  </>;
}
