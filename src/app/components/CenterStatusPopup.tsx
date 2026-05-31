import { CheckCircle2, XCircle } from "lucide-react";

type CenterStatusPopupProps = {
  open: boolean;
  title: string;
  message: string;
  tone?: "success" | "error";
  onClose?: () => void;
};

export default function CenterStatusPopup({
  open,
  title,
  message,
  tone = "success",
  onClose,
}: CenterStatusPopupProps) {
  if (!open) return null;

  const success = tone === "success";

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/35 backdrop-blur-[1px]">
      <div
        className={`w-[92%] max-w-md rounded-3xl border p-6 shadow-2xl animate-[popupScale_.24s_ease-out] ${
          success ? "border-emerald-200 bg-white" : "border-rose-200 bg-white"
        }`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 rounded-full p-2 ${
              success ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
            }`}
          >
            {success ? <CheckCircle2 className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
            <p className="mt-1 text-sm text-gray-600">{message}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white ${
              success ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
            }`}
          >
            OK
          </button>
        </div>
      </div>
      <style>{`
        @keyframes popupScale {
          0% { transform: scale(0.92); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

