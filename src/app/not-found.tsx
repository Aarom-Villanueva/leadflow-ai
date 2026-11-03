import Link from "next/link";
export default function NotFound() {
  return <main id="main" className="mx-auto max-w-xl px-6 py-20"><h1 className="text-3xl font-semibold">Página no encontrada</h1><p className="my-6">La dirección solicitada no está disponible.</p><Link href="/" className="text-lime-300 underline underline-offset-4">Volver al inicio</Link></main>;
}
