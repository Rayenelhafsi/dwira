import { Outlet } from "react-router";
import { Header, Footer } from "./components/HeaderFooter";
import { ScrollToTop } from "./components/ScrollToTop";
import { CookieConsentBanner } from "./components/CookieConsentBanner";

export function Layout() {
  return (
    <div className="flex flex-col min-h-screen">
      <ScrollToTop />
      <Header />
      <main className="flex-grow">
        <Outlet />
      </main>
      <Footer />
      <CookieConsentBanner />
    </div>
  );
}
