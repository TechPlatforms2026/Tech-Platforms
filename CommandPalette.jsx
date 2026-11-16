import { useEffect, useState } from "react";
import {
  BookOpen,
  FileCode2,
  FolderUp,
  Gamepad2,
  Globe,
  MessageSquare,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Terminal,
  X
} from "lucide-react";
function CommandPalette({
  open,
  onClose,
  threads,
  files,
  isAdmin,
  onSelectPlatform,
  onNavigate,
  onSelectThread,
  onOpenVerify
}) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);
  if (!open) return null;
  const q = query.trim().toLowerCase();
  const platformActions = [
    { id: "techgames", label: "Tech Games v1", desc: "Oyun Salonu, Gemini 4 Hydrogen Oyun Stüdyosu ve Sohbet", icon: Gamepad2 },
    { id: "techdocs", label: "Tech Documentations", desc: "Platform rehberi, telif ve 3 gün ban kuralları", icon: BookOpen },
    { id: "techcore", label: "TechCore Sunucusu", desc: "Forum, Canlı Sohbet ve Dosya Merkezi", icon: Globe }
  ];
  const navActions = [
    { id: "home", label: "Forum & Canlı İnternet Akışı", desc: "Tartışmalar ve canlı haberler", icon: Globe },
    { id: "chat", label: "Canlı Sohbet Kanalları", desc: "Çok odalı gerçek zamanlı sohbet", icon: MessageSquare },
    { id: "upload", label: "Dosya Merkezi & Telif Kalkanı", desc: "Dosya yükle, tara ve indir", icon: FolderUp },
    { id: "settings", label: "Hesap & Sistem Ayarları", desc: "Profil, şifre ve tercihler", icon: Settings }
  ];
  if (isAdmin) {
    navActions.push({
      id: "admin",
      label: "Yönetim Merkezi",
      desc: "Başvurular, üyeler ve posta günlükleri",
      icon: ShieldCheck
    });
  }
  const matchedPlatforms = platformActions.filter(
    (p) => !q || p.label.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q)
  );
  const matchedNav = navActions.filter(
    (n) => !q || n.label.toLowerCase().includes(q) || n.desc.toLowerCase().includes(q)
  );
  const matchedThreads = threads.filter((t) => !q || t.title.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)).slice(0, 4);
  const matchedFiles = files.filter((f) => !q || f.fileName.toLowerCase().includes(q)).slice(0, 3);
  return <div
    role="dialog"
    aria-modal="true"
    aria-label="Hızlı komut ve arama paleti"
    className="fixed inset-0 z-50 flex items-start justify-center bg-black/75 p-4 pt-16 backdrop-blur-sm sm:pt-24"
    onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}
  >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-700/80 bg-[#0F1623] shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
          <label htmlFor="cmd-palette-input" className="sr-only">
            Platform, komut, tartışma veya dosya ara
          </label>
          <input
    id="cmd-palette-input"
    type="text"
    autoFocus
    value={query}
    onChange={(e) => setQuery(e.target.value)}
    placeholder="Platform, sayfa, komut, tartışma veya dosya ara..."
    className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
  />
          <button
    type="button"
    onClick={onClose}
    aria-label="Komut paletini kapat"
    className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
  >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="custom-scroll max-h-[60vh] divide-y divide-slate-800/80 overflow-y-auto p-2">
          {matchedPlatforms.length > 0 && <div className="py-1">
              <p className="px-3 py-1.5 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                Tech Platforms
              </p>
              {matchedPlatforms.map((plat) => {
    const Icon = plat.icon;
    return <button
      key={plat.id}
      type="button"
      onClick={() => {
        onSelectPlatform(plat.id);
        onClose();
      }}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-slate-800/80"
    >
                    <Icon className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white">{plat.label}</p>
                      <p className="text-xs text-slate-400">{plat.desc}</p>
                    </div>
                  </button>;
  })}
            </div>}

          <div className="py-1">
            <p className="px-3 py-1.5 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
              TechCore Sayfaları ve İşlemler
            </p>
            {matchedNav.map((item) => {
    const Icon = item.icon;
    return <button
      key={item.id}
      type="button"
      onClick={() => {
        onSelectPlatform("techcore");
        onNavigate(item.id);
        onClose();
      }}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-slate-800/80"
    >
                  <Icon className="h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white">{item.label}</p>
                    <p className="text-xs text-slate-400">{item.desc}</p>
                  </div>
                </button>;
  })}
            <button
    type="button"
    onClick={() => {
      onOpenVerify();
      onClose();
    }}
    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-slate-800/80"
  >
              <Plus className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-white">Hesap Doğrula (E-Posta Onayı)</p>
                <p className="text-xs text-slate-400">Giriş Yap penceresinden 6 haneli doğrulama kodu gönder</p>
              </div>
            </button>
          </div>

          {matchedThreads.length > 0 && <div className="py-1">
              <p className="px-3 py-1.5 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                Forum Tartışmaları
              </p>
              {matchedThreads.map((thr) => <button
    key={thr.id}
    type="button"
    onClick={() => {
      onSelectPlatform("techcore");
      onNavigate("home");
      onSelectThread(thr);
      onClose();
    }}
    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-slate-800/80"
  >
                  <Terminal className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-200">{thr.title}</p>
                    <p className="text-xs text-slate-500">
                      {thr.category} · {thr.authorName}
                    </p>
                  </div>
                </button>)}
            </div>}

          {matchedFiles.length > 0 && <div className="py-1">
              <p className="px-3 py-1.5 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                Dosya Merkezi
              </p>
              {matchedFiles.map((file) => <button
    key={file.id}
    type="button"
    onClick={() => {
      onSelectPlatform("techcore");
      onNavigate("upload");
      onClose();
    }}
    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-slate-800/80"
  >
                  <FileCode2 className="h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-200">{file.fileName}</p>
                    <p className="text-xs text-slate-500">{file.uploaderName}</p>
                  </div>
                </button>)}
            </div>}
        </div>
      </div>
    </div>;
}
export {
  CommandPalette
};
