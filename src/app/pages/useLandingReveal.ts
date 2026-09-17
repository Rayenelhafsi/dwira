import { useEffect, type RefObject } from "react";

/** Page-level motion keeps shared cards and controls independent of the landing. */
export function useLandingReveal(rootRef: RefObject<HTMLElement>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !window.IntersectionObserver || !Element.prototype.animate) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const seen = new WeakSet<Element>();
    const animations = new Set<Animation>();
    const selector = "h1, h2, .landing-hero p, .landing-hero button, .landing-hero label, article, [data-slot='card'], .grid > div, .landing-stat-grid > div, .landing-cta a";
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        if (preference.matches) continue;
        const siblings = entry.target.parentElement?.children;
        const index = siblings ? Array.prototype.indexOf.call(siblings, entry.target) : 0;
        const animation = entry.target.animate([
          { opacity: 0, transform: "translateY(24px) scale(.985)" },
          { opacity: 1, transform: "translateY(0) scale(1)" },
        ], { duration: 620, delay: Math.min(index, 4) * 45, easing: "cubic-bezier(.22, 1, .36, 1)", fill: "backwards" });
        animations.add(animation);
        animation.onfinish = () => animations.delete(animation);
      }
    }, { threshold: 0.08 });
    const register = () => {
      root.querySelectorAll(selector).forEach((element) => {
        if (seen.has(element)) return;
        seen.add(element);
        observer.observe(element);
      });
    };
    const stopMotion = () => {
      if (preference.matches) {
        animations.forEach((animation) => animation.cancel());
        animations.clear();
      }
    };
    register();
    const mutation = new MutationObserver(register);
    mutation.observe(root, { childList: true, subtree: true });
    preference.addEventListener("change", stopMotion);
    return () => {
      observer.disconnect();
      mutation.disconnect();
      preference.removeEventListener("change", stopMotion);
      animations.forEach((animation) => animation.cancel());
    };
  }, [rootRef]);
}
