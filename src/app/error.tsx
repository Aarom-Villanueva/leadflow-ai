"use client";
export default function ErrorBoundary({ reset }: { reset: () => void }) {
  return <section role="alert" className="mx-auto max-w-xl px-6 py-20">
    <h1 className="text-3xl font-semibold">Algo no salió como esperábamos.</h1>
    <p className="my-6 text-slate-300">Vuelve a intentarlo. No se muestran detalles internos del error.</p>
    <button type="button" onClick={reset} className="min-h-12 rounded-xl bg-lime-300 px-6 font-semibold text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime-300">Reintentar</button>
  </section>;
}
