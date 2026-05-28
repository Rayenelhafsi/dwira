import { FileText, Download } from "lucide-react";

const CGV_PDF_PATH = "/legal/CGV_Dwira_Immobilier.pdf";

export default function CgvPage() {
  return (
    <section className="min-h-screen bg-slate-50 px-4 py-28 md:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
              <FileText size={14} />
              Document legal
            </p>
            <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">Conditions Generales de Vente</h1>
          </div>
          <a
            href={CGV_PDF_PATH}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            <Download size={16} />
            Telecharger le PDF
          </a>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <iframe
            title="Conditions Generales de Vente Dwira Immobilier"
            src={CGV_PDF_PATH}
            className="h-[78vh] w-full"
          />
        </div>
      </div>
    </section>
  );
}
