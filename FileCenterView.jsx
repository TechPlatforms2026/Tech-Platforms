import { useRef, useState } from "react";
import {
  CheckCircle2,
  Code2,
  Download,
  FileCode2,
  Lock,
  MailCheck,
  Search,
  ShieldCheck,
  UploadCloud
} from "lucide-react";
import { apiRequest, getEdgeFileDownloadUrl } from "../lib/apiClient";
import { formatFileSize } from "../lib/moderation";
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Dosya okunamadı."));
    reader.readAsDataURL(file);
  });
}
function FileCenterView({
  user,
  files,
  compactView = false,
  onRefreshBootstrap,
  onOpenVerifyAuth,
  onUserBanned
}) {
  const canUpload = Boolean(user?.canUpload || user?.isAdmin || user?.emailVerified);
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [accType, setAccType] = useState("gmail");
  const [accEmail, setAccEmail] = useState(user?.email ?? "");
  const [appSubmitted, setAppSubmitted] = useState(false);
  const [submittingApp, setSubmittingApp] = useState(false);
  const [appError, setAppError] = useState("");
  const fileInputRef = useRef(null);
  const [uploadMode, setUploadMode] = useState("disk");
  const [dragActive, setDragActive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");
  const [previewFile, setPreviewFile] = useState(null);
  const [customFileName, setCustomFileName] = useState("");
  const [customFileContent, setCustomFileContent] = useState("");
  const [fileFilter, setFileFilter] = useState("Tümü");
  const [fileSearch, setFileSearch] = useState("");
  const emailPlaceholder = accType === "gmail" ? "ornek@gmail.com" : accType === "apple" ? "ornek@icloud.com" : "ornek@outlook.com";
  const handleApplicationSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    setAppError("");
    setSubmittingApp(true);
    try {
      const res = await apiRequest("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          name,
          surname,
          phone,
          accountType: accType,
          accountEmail: accEmail
        })
      });
      if (!res.ok) {
        setAppError(res.data.error || "Başvuru gönderilemedi.");
        return;
      }
      setAppSubmitted(true);
      await onRefreshBootstrap();
    } catch {
      setAppError("Başvuru iletilirken hata oluştu.");
    } finally {
      setSubmittingApp(false);
    }
  };
  const processSelectedFile = async (file) => {
    if (!user) return;
    setUploadError("");
    setUploadSuccess("");
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError("Dosya boyutu 15 MB sınırını aşıyor.");
      return;
    }
    setScanning(true);
    setScanProgress(20);
    setScanStatus("Gerçek dosya verisi okunuyor...");
    try {
      let previewText = "";
      if (file.type.startsWith("text/") || /\.(json|md|ts|tsx|js|jsx|csv|txt|html|css|log|yaml|yml|xml|svg)$/i.test(file.name)) {
        previewText = (await file.text()).slice(0, 2e3);
      }
      const fileBase64 = await readFileAsBase64(file);
      setScanProgress(65);
      setScanStatus("Sunucuya yükleniyor, SHA-256 hesaplanıyor ve Gemini AI ile taranıyor...");
      const res = await apiRequest("/api/files/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || "application/octet-stream",
          previewText,
          fileBase64
        })
      });
      if (res.data.banned && res.data.bannedUntil) {
        setScanning(false);
        onUserBanned(res.data.bannedUntil, res.data.error || "Güvenlik ihlali");
        return;
      }
      if (!res.ok) {
        setUploadError(res.data.error || "Dosya taramadan geçemedi.");
        setScanning(false);
        return;
      }
      setScanProgress(100);
      setScanStatus("Tarama tamamlandı: Dosya doğrulandı ve kaydedildi.");
      setUploadSuccess(`${file.name} sunucuya yüklendi, tarandı ve Dosya Merkezi ağına eklendi.`);
      await onRefreshBootstrap();
    } catch {
      setUploadError("Dosya yüklenirken hata oluştu.");
    } finally {
      setScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      void processSelectedFile(file);
    }
  };
  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file && canUpload) {
      void processSelectedFile(file);
    }
  };
  const handleCreateCustomFile = async (e) => {
    e.preventDefault();
    if (!user) return;
    const cleanName = customFileName.trim();
    const cleanContent = customFileContent;
    if (!cleanName || !cleanContent.trim()) {
      setUploadError("Lütfen dosya adı ve içeriğini doldurun.");
      return;
    }
    const blob = new Blob([cleanContent], { type: "text/plain;charset=utf-8" });
    const virtualFile = new File([blob], cleanName, { type: "text/plain" });
    await processSelectedFile(virtualFile);
    setCustomFileName("");
    setCustomFileContent("");
  };
  const canPreviewFile = (file) => Boolean(file.previewText || file.mimeType.startsWith("image/"));
  const filteredFiles = files.filter((f) => {
    const q = fileSearch.trim().toLowerCase();
    const matchesSearch = !q || f.fileName.toLowerCase().includes(q) || f.uploaderName.toLowerCase().includes(q);
    if (!matchesSearch) return false;
    if (fileFilter === "Görsel") return f.mimeType.startsWith("image/");
    if (fileFilter === "Kod & Config") {
      return /\.(json|ts|tsx|js|jsx|sh|yaml|yml|css|html|xml|sql)$/i.test(f.fileName);
    }
    if (fileFilter === "Doküman") {
      return /\.(txt|md|pdf|csv|doc|docx|log)$/i.test(f.fileName);
    }
    return true;
  });
  const getDownloadHref = (file) => getEdgeFileDownloadUrl(file) || `/api/files/${encodeURIComponent(file.id)}/download`;
  return <div className="mx-auto max-w-6xl space-y-8">
      <div className="border-b border-slate-800/80 pb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Dosya Merkezi ve Gemini 4 Hydrogen Telif Kalkanı
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          Kendi ürettiğiniz kod, config veya metin dosyalarını sürükleyip bırakın ya da doğrudan editörden
          oluşturun. Her dosya SHA-256 ve Gemini 4 Hydrogen telif/güvenlik taramasından geçer.
        </p>
      </div>

      {
    /* Upload or Application Card */
  }
      {!canUpload ? <section
    aria-labelledby="apply-heading"
    className="rounded-xl border border-slate-800 bg-[#0F1623] p-6 sm:p-8"
  >
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-400">
                <Lock className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <h2 id="apply-heading" className="font-display text-xl font-semibold text-white">
                  Dosya Yükleme Yetkisi Gerekli
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Anında dosya yüklemek için Giriş Yap menüsünden hesabınızı doğrulayın veya yönetici onayı için
                  başvuru gönderin.
                </p>
              </div>
            </div>

            <button
    type="button"
    onClick={() => onOpenVerifyAuth(accEmail)}
    className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-sky-500 px-4 text-xs font-semibold text-slate-950 transition-colors hover:bg-sky-400"
  >
              <MailCheck className="h-4 w-4" aria-hidden="true" />
              Hesap Doğrula
            </button>
          </div>

          {appSubmitted ? <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-5 text-sm text-sky-200">
              <p className="font-semibold text-white">Başvurunuz Yönetici Onayına İletildi</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">
                Talebiniz TechCore yönetici paneline düştü. Onaylandığında veya e-postanızı doğruladığınızda yükleme paneli otomatik açılır.
              </p>
            </div> : <form onSubmit={handleApplicationSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="app-name" className="mb-1.5 block text-xs font-semibold text-slate-300">
                    Adınız
                  </label>
                  <input
    id="app-name"
    type="text"
    required
    value={name}
    onChange={(e) => setName(e.target.value)}
    className="h-11 w-full rounded-lg border border-slate-700/80 bg-[#090D16] px-3.5 text-sm text-white focus:border-sky-500 focus:outline-none"
  />
                </div>
                <div>
                  <label htmlFor="app-surname" className="mb-1.5 block text-xs font-semibold text-slate-300">
                    Soyadınız
                  </label>
                  <input
    id="app-surname"
    type="text"
    required
    value={surname}
    onChange={(e) => setSurname(e.target.value)}
    className="h-11 w-full rounded-lg border border-slate-700/80 bg-[#090D16] px-3.5 text-sm text-white focus:border-sky-500 focus:outline-none"
  />
                </div>
              </div>

              <div>
                <label htmlFor="app-phone" className="mb-1.5 block text-xs font-semibold text-slate-300">
                  Telefon Numaranız
                </label>
                <input
    id="app-phone"
    type="tel"
    required
    value={phone}
    onChange={(e) => setPhone(e.target.value)}
    placeholder="05XX XXX XX XX"
    className="h-11 w-full rounded-lg border border-slate-700/80 bg-[#090D16] px-3.5 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
  />
              </div>

              <div className="grid grid-cols-1 gap-4 border-t border-slate-800 pt-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="app-acc-type" className="mb-1.5 block text-xs font-semibold text-sky-400">
                    Hesap Türü Seçin
                  </label>
                  <select
    id="app-acc-type"
    value={accType}
    onChange={(e) => setAccType(e.target.value)}
    className="h-11 w-full rounded-lg border border-slate-700/80 bg-[#090D16] px-3.5 text-sm text-white focus:border-sky-500 focus:outline-none"
  >
                    <option value="gmail">Gmail Hesabı</option>
                    <option value="apple">Apple Posta (iCloud)</option>
                    <option value="microsoft">Microsoft Posta (Outlook/Hotmail)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="app-acc-email" className="mb-1.5 block text-xs font-semibold text-slate-300">
                    E-Posta Adresiniz
                  </label>
                  <div className="flex gap-2">
                    <input
    id="app-acc-email"
    type="email"
    required
    value={accEmail}
    onChange={(e) => setAccEmail(e.target.value)}
    placeholder={emailPlaceholder}
    className="h-11 flex-1 rounded-lg border border-slate-700/80 bg-[#090D16] px-3.5 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
  />
                    <button
    type="button"
    onClick={() => onOpenVerifyAuth(accEmail)}
    className="inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-700 bg-[#090D16] px-3 text-xs font-medium text-sky-400 hover:border-sky-500/60"
  >
                      <MailCheck className="h-4 w-4" aria-hidden="true" />
                      Doğrula
                    </button>
                  </div>
                </div>
              </div>

              {appError && <p className="text-xs text-rose-400">{appError}</p>}

              <button
    type="submit"
    disabled={submittingApp}
    className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-slate-800 px-5 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
  >
                {submittingApp ? "Gönderiliyor..." : "Yöneticiye Başvuru Gönder"}
              </button>
            </form>}
        </section> : <section
    aria-labelledby="upload-panel-heading"
    className="rounded-xl border border-slate-800 bg-[#0F1623] p-6 sm:p-8"
  >
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="upload-panel-heading" className="font-display text-xl font-semibold text-white">
                AI Destekli Gerçek Dosya Yükleme
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Yükleme yetkiniz aktif. Seçilen dosyalar sunucuya yüklenir ve Gemini AI güvenlik taramasından geçer.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex rounded-lg bg-[#090D16] p-1">
                <button
    type="button"
    onClick={() => setUploadMode("disk")}
    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${uploadMode === "disk" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"}`}
  >
                  Dosya Yükle
                </button>
                <button
    type="button"
    onClick={() => setUploadMode("editor")}
    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${uploadMode === "editor" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"}`}
  >
                  Doğrudan Oluştur
                </button>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Yetkili
              </span>
            </div>
          </div>

          {uploadMode === "disk" ? <div
    onDragOver={(e) => {
      e.preventDefault();
      setDragActive(true);
    }}
    onDragLeave={() => setDragActive(false)}
    onDrop={handleDrop}
    className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${dragActive ? "border-sky-400 bg-sky-500/10" : "border-slate-700 bg-[#090D16]/70 hover:border-sky-500/60"}`}
  >
              <UploadCloud className="mx-auto mb-3 h-10 w-10 text-sky-400" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-200">
                Dosyayı buraya sürükleyip bırakın veya bilgisayarınızdan seçin
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Maksimum 15 MB · Görsel, PDF, kod, JSON, metin ve arşiv dosyaları desteklenir
              </p>
              <input
    ref={fileInputRef}
    id="file-upload-input"
    type="file"
    onChange={handleFileChange}
    className="sr-only"
  />
              <button
    type="button"
    disabled={scanning}
    onClick={() => fileInputRef.current?.click()}
    className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-sky-500 px-5 text-xs font-semibold text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-50"
  >
                {scanning ? "Yükleniyor ve Taranıyor..." : "Bilgisayardan Dosya Seç"}
              </button>
            </div> : <form onSubmit={handleCreateCustomFile} className="space-y-3 rounded-xl border border-slate-800 bg-[#090D16] p-5">
              <div>
                <label htmlFor="custom-file-name" className="mb-1 block text-xs font-semibold text-slate-300">
                  Dosya Adı (uzantısıyla)
                </label>
                <input
    id="custom-file-name"
    type="text"
    required
    value={customFileName}
    onChange={(e) => setCustomFileName(e.target.value)}
    placeholder="örnek: firewall-rules.conf veya benchmark.json"
    className="h-10 w-full rounded-lg border border-slate-700 bg-[#0F1623] px-3 text-sm font-mono text-white focus:border-sky-500 focus:outline-none"
  />
              </div>
              <div>
                <label htmlFor="custom-file-content" className="mb-1 block text-xs font-semibold text-slate-300">
                  Dosya İçeriği
                </label>
                <textarea
    id="custom-file-content"
    rows={5}
    required
    value={customFileContent}
    onChange={(e) => setCustomFileContent(e.target.value)}
    placeholder="Kod, JSON veya yapılandırma içeriğinizi buraya yapıştırın..."
    className="w-full rounded-lg border border-slate-700 bg-[#0F1623] p-3 font-mono text-xs text-white focus:border-sky-500 focus:outline-none"
  />
              </div>
              <button
    type="submit"
    disabled={scanning}
    className="inline-flex h-10 items-center gap-2 rounded-lg bg-sky-500 px-5 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50"
  >
                <Code2 className="h-4 w-4" aria-hidden="true" />
                {scanning ? "Taranıyor..." : "Dosyayı Oluştur, Tara ve Paylaş"}
              </button>
            </form>}

          {(scanning || scanProgress > 0) && <div className="mt-4 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-sky-400">{scanStatus}</span>
                <span className="font-mono tabular-nums text-slate-400">{scanProgress}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
    className="h-full bg-sky-500 transition-all duration-200"
    style={{ width: `${scanProgress}%` }}
  />
              </div>
            </div>}

          {uploadError && <p className="mt-3 text-xs text-rose-400">{uploadError}</p>}
          {uploadSuccess && <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{uploadSuccess}</span>
            </div>}

          <p className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs leading-relaxed text-rose-200/90">
            <strong className="text-white">Telif & Genel Dosya Koruması (Otomatik 3 Gün Ban):</strong> Windows 10/11 ISO, ticari program/oyun kurulumları (.exe, .msi, .apk, .iso), crack/repack arşivleri veya telif korumalı genel medya yüklemeleri Gemini 4 Hydrogen tarafından anında engellenir ve hesabınıza <strong className="text-rose-300">3 günlük ban</strong> uygulanır.
          </p>
        </section>}

      {
    /* Shared Verified Files Table */
  }
      <section aria-labelledby="files-table-heading" className="rounded-xl border border-slate-800 bg-[#0F1623]">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-800 px-6 py-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <h2 id="files-table-heading" className="font-display text-lg font-semibold text-white">
              Doğrulanmış Sunucu Dosyaları
            </h2>
            <span className="font-mono text-xs text-slate-400 tabular-nums">{filteredFiles.length} dosya</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg bg-[#090D16] p-1">
              {["Tümü", "Kod & Config", "Görsel", "Doküman"].map((tab) => <button
    key={tab}
    type="button"
    onClick={() => setFileFilter(tab)}
    className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${fileFilter === tab ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"}`}
  >
                  {tab}
                </button>)}
            </div>
            <div className="relative">
              <Search
    className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
    aria-hidden="true"
  />
              <label htmlFor="files-search-input" className="sr-only">
                Dosya ara
              </label>
              <input
    id="files-search-input"
    type="search"
    value={fileSearch}
    onChange={(e) => setFileSearch(e.target.value)}
    placeholder="Dosya ara..."
    className="h-8 w-40 rounded-md border border-slate-800 bg-[#090D16] pl-8 pr-2 text-xs text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
  />
            </div>
          </div>
        </div>

        {filteredFiles.length === 0 ? <div className="p-10 text-center text-sm text-slate-400">
            Bu filtreye uygun dosya bulunamadı.
          </div> : <div className="divide-y divide-slate-800/80">
            {filteredFiles.map((file) => <div
    key={file.id}
    className={`flex flex-col justify-between gap-4 px-6 sm:flex-row sm:items-center ${compactView ? "py-2.5" : "py-4"}`}
  >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2.5">
                    <FileCode2 className="h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
                    <span className="truncate text-sm font-semibold text-white">{file.fileName}</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    {file.uploaderName} · <span className="font-mono tabular-nums">{formatFileSize(file.fileSize)}</span>
                    {file.sha256 && <>
                        {" · "}
                        <span className="font-mono text-slate-500" title={`SHA-256: ${file.sha256}`}>
                          SHA256:{file.sha256.slice(0, 10)}
                        </span>
                      </>}
                    {" · "}
                    <span className="text-emerald-400">{file.aiVerdict}</span>
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {canPreviewFile(file) && <button
    type="button"
    onClick={() => setPreviewFile(previewFile?.id === file.id ? null : file)}
    className="h-9 rounded-lg border border-slate-700 px-3 text-xs font-medium text-slate-300 hover:border-slate-500 hover:text-white"
  >
                      {previewFile?.id === file.id ? "Önizlemeyi Kapat" : "İncele"}
                    </button>}
                  <a
    href={getDownloadHref(file)}
    download={file.fileName}
    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-800 px-3.5 text-xs font-medium text-white hover:bg-slate-700"
  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    İndir
                  </a>
                </div>
              </div>)}
          </div>}

        {previewFile && canPreviewFile(previewFile) && <div className="border-t border-slate-800 bg-[#090D16] p-5">
            <p className="mb-2 text-xs font-semibold text-sky-400">{previewFile.fileName} — İçerik Önizlemesi</p>
            {previewFile.mimeType.startsWith("image/") ? <div className="overflow-hidden rounded-lg border border-slate-800 bg-[#0F1623] p-3">
                <img
    src={getEdgeFileDownloadUrl(previewFile) || `/api/files/${encodeURIComponent(previewFile.id)}/raw`}
    alt={previewFile.fileName}
    className="max-h-72 rounded object-contain"
  />
              </div> : <pre className="custom-scroll max-h-60 overflow-auto rounded-lg border border-slate-800 bg-[#0F1623] p-4 font-mono text-xs text-slate-300">
                {previewFile.previewText}
              </pre>}
          </div>}
      </section>
    </div>;
}
export {
  FileCenterView
};
