import { useState } from "react";
import { BookOpen, Bot, Check, Cloud, Copy, Gamepad2, Server, ShieldAlert } from "lucide-react";
import heroTechDocsImg from "../assets/images/hero_tech_docs_studio_1794730975874.jpg";

const DOC_SECTIONS = [
  {
    id: "overview",
    title: "Tech Platforms Ekosistemi",
    subtitle: "TechCore, Tech Games ve Tech Documentations birleşik platform mimarisi.",
    items: [
      {
        heading: "01. TechCore Sunucusu",
        body: "Canlı Tesla, Türkçe haber, DEV Community, Hacker News ve GitHub akışları; çok kanallı WebSocket sohbeti; SHA-256 doğrulamalı ve Gemini 4 Hydrogen telif korumalı Dosya Merkezi ile ana teknoloji merkezidir.",
      },
      {
        heading: "02. Tech Games (v1)",
        body: "Oyuncuların hazır HTML5 mini oyunları oynayıp indirebildiği, Gemini 4 Hydrogen ile özgün oyunlar tasarlayıp toplulukla paylaşabildiği bağımsız oyun sunucusudur. Dosya/Doküman Merkezi barındırmaz.",
      },
      {
        heading: "03. Tech Documentations",
        body: "Tüm platform kuralları, yapay zeka güvenlik politikaları, 3 günlük otomatik ban koşulları ve Cloudflare Pages dağıtım rehberlerinin yer aldığı resmi referans merkezidir.",
      },
    ],
  },
  {
    id: "cloudflare",
    title: "Cloudflare Pages Dağıtım Rehberi",
    subtitle: "Saf JavaScript yapısı, sıfır beyaz ekran koruması ve Edge fonksiyonları.",
    items: [
      {
        heading: "Cloudflare Pages Ayarları",
        body: "Cloudflare Dashboard üzerinden GitHub deponuzu bağladığınızda Framework preset olarak Vite, derleme komutu olarak npm run build ve çıktı klasörü olarak dist seçmeniz yeterlidir.",
        code: "npm run build",
      },
      {
        heading: "Wrangler ile Tek Komutta Yayın",
        body: "Bilgisayarınızdan doğrudan yayınlamak isterseniz dist klasörünü Wrangler CLI ile saniyeler içinde Cloudflare Pages'e yükleyebilirsiniz.",
        code: "npx wrangler pages deploy dist",
      },
      {
        heading: "Beyaz Ekran ve Önbellek Koruması",
        body: "Sistemdeki koyu başlangıç splash ekranı, React ErrorBoundary, _redirects ve _headers kuralları sayesinde eski tarayıcı önbellekleri otomatik temizlenir ve sayfa asla boş beyaz kalmaz.",
      },
    ],
  },
  {
    id: "copyright",
    title: "Dosya Merkezi Telif ve Genel Dosya Kalkanı",
    subtitle: "Gemini 4 Hydrogen ile otomatik telif tespiti ve 3 günlük hesap engelleme kuralları.",
    items: [
      {
        heading: "Yasaklı Genel ve Ticari Dosyalar",
        body: "Windows 10/11 ISO imajları, ticari kurulum paketleri (.exe, .msi, .apk, .iso, .dmg, .torrent), crack/keygen/repack arşivleri, telifli film/müzik dosyaları ve başkasına ait lisanslı yazılımlar kesinlikle yasaktır.",
      },
      {
        heading: "Otomatik 3 Günlük Ban",
        body: 'Dosya Merkezine genel veya telif korumalı dosya yüklemeye çalışan hesaplar Gemini 4 Hydrogen tarafından anında engellenir ve "Üç günlüğüne ban yediniz" uyarısıyla 72 saatlik geri sayım başlatılır.',
      },
      {
        heading: "İzin Verilen Dosya Türleri",
        body: "Kullanıcıların kendi yazdığı özgün kaynak kodlar (.js, .jsx, .py), yapılandırma dosyaları (.json, .conf, .yaml), düz metin/belge notları (.md, .txt) ve özgün görseller SHA-256 imzalanarak paylaşılabilir.",
      },
    ],
  },
  {
    id: "techgames",
    title: "Tech Games & Gemini 4 Hydrogen Rehberi",
    subtitle: "Özgün oyun üretimi, topluluk yayını ve gerçek oyun telif filtresi.",
    items: [
      {
        heading: "Gemini 4 Hydrogen Oyun Üretimi",
        body: 'Oyun Stüdyosu sekmesinde oyununuzun mekaniğini Türkçe anlatın. Gemini 4 Hydrogen tarayıcı içinde sandbox="allow-scripts" güvenliğiyle hemen çalışan ve .html olarak indirilebilen kod üretir.',
      },
      {
        heading: "Gerçek ve Ticari Oyun Yasağı",
        body: "GTA, Minecraft, FIFA, Valorant, Fortnite, Call of Duty, Mario gibi bilinen gerçek/ticari oyunların üretilmesi ve yayınlanması telif ihlali nedeniyle 403 engeliyle reddedilir.",
      },
      {
        heading: "Topluluk İndirme ve Paylaşım",
        body: "Yayınlanan özgün HTML5 oyunları tüm kullanıcılar tarafından doğrudan tarayıcıda oynanabilir veya tek dosyalık .html paketi olarak indirilebilir.",
      },
    ],
  },
  {
    id: "moderation",
    title: "Canlı Sohbet & 3 Gün Ban Politikası",
    subtitle: "TechCore ve Tech Games kanallarında kesintisiz AI moderasyonu.",
    items: [
      {
        heading: "Sohbette Küfür Tespiti",
        body: "Hem TechCore hem de Tech Games canlı sohbet kanallarında küfür, ağır hakaret veya zararlı bağlantı paylaşımı tespit edildiğinde mesaj engellenir ve kullanıcı 3 günlüğüne banlanır.",
      },
      {
        heading: "Yönetici İncelemesi",
        body: "Yetkili yönetici, TechCore Yönetim Merkezi üzerinden aktif engelleri ve dosya yükleme başvurularını inceleyebilir.",
      },
    ],
  },
];

export function TechDocsView({ onSwitchPlatform }) {
  const [activeDoc, setActiveDoc] = useState("overview");
  const [copiedCode, setCopiedCode] = useState("");
  const current = DOC_SECTIONS.find((s) => s.id === activeDoc) || DOC_SECTIONS[0];

  const handleCopyCode = async (snippet) => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopiedCode(snippet);
      window.setTimeout(() => setCopiedCode(""), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-sky-500/25 bg-[#0F1623]">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0F1623] via-[#0B1220] to-[#090D16]" />
        <img
          src={heroTechDocsImg}
          alt="Tech Documentations teknik rehber ve kural merkezi"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#090D16]/95 via-[#090D16]/85 to-[#090D16]/50" />

        <div className="relative z-10 flex flex-col justify-between gap-6 p-7 sm:p-10 lg:flex-row lg:items-end">
          <div className="max-w-2xl space-y-3">
            <p className="text-xs font-semibold tracking-wider text-sky-400 uppercase">
              Tech Platforms · Tech Documentations
            </p>
            <h1 className="font-display text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Tech Platforms Dokümantasyon ve Kurallar Merkezi
            </h1>
            <p className="text-sm leading-relaxed text-slate-300 sm:text-base">
              TechCore, Tech Games, Cloudflare Pages dağıtım adımları ve Gemini 4 Hydrogen güvenlik
              sistemlerinin çalışma ilkeleri.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={() => onSwitchPlatform("techcore")}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-sky-500 px-4 text-xs font-semibold text-slate-950 hover:bg-sky-400"
              >
                <Server className="h-4 w-4" aria-hidden="true" />
                TechCore&apos;a Geç
              </button>
              <button
                type="button"
                onClick={() => onSwitchPlatform("techgames")}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20"
              >
                <Gamepad2 className="h-4 w-4" aria-hidden="true" />
                Tech Games&apos;i Aç
              </button>
              <button
                type="button"
                onClick={() => setActiveDoc("cloudflare")}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 text-xs font-semibold text-sky-300 hover:bg-sky-500/20"
              >
                <Cloud className="h-4 w-4" aria-hidden="true" />
                Cloudflare Pages Rehberi
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Docs Layout */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <aside className="space-y-2 lg:col-span-4">
          {DOC_SECTIONS.map((sec) => {
            const active = sec.id === activeDoc;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => setActiveDoc(sec.id)}
                className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                  active
                    ? "border-sky-500/50 bg-sky-500/10 text-white"
                    : "border-slate-800 bg-[#0F1623] text-slate-300 hover:border-slate-700 hover:text-white"
                }`}
              >
                <BookOpen
                  className={`mt-0.5 h-4 w-4 shrink-0 ${active ? "text-sky-400" : "text-slate-500"}`}
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-semibold">{sec.title}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{sec.subtitle}</p>
                </div>
              </button>
            );
          })}
        </aside>

        <section
          aria-labelledby="doc-section-title"
          className="space-y-6 rounded-2xl border border-slate-800 bg-[#0F1623] p-6 sm:p-8 lg:col-span-8"
        >
          <div className="border-b border-slate-800 pb-4">
            <h2 id="doc-section-title" className="font-display text-2xl font-bold text-white">
              {current.title}
            </h2>
            <p className="mt-1 text-sm text-slate-400">{current.subtitle}</p>
          </div>

          <div className="space-y-5">
            {current.items.map((item) => (
              <div key={item.heading} className="rounded-xl border border-slate-800/80 bg-[#090D16] p-5">
                <h3 className="font-display text-base font-semibold text-sky-400">{item.heading}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{item.body}</p>
                {item.code && (
                  <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#0F1623] px-3.5 py-2.5">
                    <code className="font-mono text-xs text-sky-300">{item.code}</code>
                    <button
                      type="button"
                      onClick={() => handleCopyCode(item.code)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-700 bg-[#090D16] px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:border-sky-500/50 hover:text-white"
                    >
                      {copiedCode === item.code ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                          <span>Kopyalandı</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Kopyala</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-slate-800 pt-5 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-xs text-rose-200">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
              <div>
                <p className="font-semibold text-white">3 Günlük Otomatik Ban</p>
                <p className="mt-1 text-rose-200/80">
                  Genel/telifli dosya yükleme ve sohbet küfür ihlalleri 72 saatlik engel tetikler.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs text-emerald-200">
              <Bot className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
              <div>
                <p className="font-semibold text-white">Gemini 4 Hydrogen Aktif</p>
                <p className="mt-1 text-emerald-200/80">
                  Oyun üretimi, telif denetimi ve güvenlik taramaları çalışır.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
