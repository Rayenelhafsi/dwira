import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "leaflet/dist/leaflet.css";
import "./styles/index.css";
import { initMetaPixel, trackMetaPageViewOncePerPath } from "./app/utils/metaConversions.ts";

function installApiCredentialsFetchPatch() {
  if (typeof window === "undefined") return;
  const originalFetch = window.fetch.bind(window);
  const apiBaseRaw = String(import.meta.env.VITE_API_URL || "/api").trim() || "/api";

  const toAbsoluteUrl = (value: string) => {
    try {
      return new URL(value, window.location.origin).toString();
    } catch {
      return value;
    }
  };

  const apiBaseAbsolute = toAbsoluteUrl(apiBaseRaw);
  const apiPath = (() => {
    try {
      return new URL(apiBaseAbsolute).pathname.replace(/\/+$/, "");
    } catch {
      return "/api";
    }
  })();

  const isApiRequest = (requestUrl: string) => {
    const absolute = toAbsoluteUrl(requestUrl);
    if (absolute.startsWith(apiBaseAbsolute)) return true;
    if (absolute.startsWith(`${window.location.origin}${apiPath}`)) return true;
    if (requestUrl.startsWith("/api")) return true;
    return false;
  };

  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (!isApiRequest(requestUrl)) {
      return originalFetch(input, init);
    }

    const nextInit: RequestInit = {
      ...(init || {}),
      credentials: init?.credentials || "include",
    };
    return originalFetch(input, nextInit);
  }) as typeof window.fetch;
}

installApiCredentialsFetchPatch();
initMetaPixel();
trackMetaPageViewOncePerPath();

createRoot(document.getElementById("root")!).render(<App />);
