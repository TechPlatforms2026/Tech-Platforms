import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 380);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Yukarı çık"
      className="fixed right-5 bottom-20 z-30 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/40 bg-[#0F1623]/95 text-sky-400 shadow-lg backdrop-blur transition-all hover:border-sky-400 hover:bg-sky-500 hover:text-slate-950 md:bottom-6"
    >
      <ArrowUp className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
