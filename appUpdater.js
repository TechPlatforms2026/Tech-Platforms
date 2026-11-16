const LOCAL_MANIFEST_KEY = "techcore_installed_manifest_v1";
async function sha256Hex(buffer) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function fetchLiveFileManifest() {
  const bust = Date.now();
  for (const candidateUrl of [
    `/app-files-manifest.json?_t=${bust}`,
    `/api/app/files-manifest?_t=${bust}`
  ]) {
    try {
      const res = await fetch(candidateUrl, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache, no-store" }
      });
      if (!res.ok) continue;
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) continue;
      const parsed = await res.json();
      if (parsed && parsed.rootFingerprint && parsed.files) {
        return parsed;
      }
    } catch {
    }
  }
  return null;
}
async function fetchDirectLiveHtmlHash() {
  try {
    const res = await fetch(`/index.html?_t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache, no-store" }
    });
    if (!res.ok) return null;
    const text = await res.text();
    const encoded = new TextEncoder().encode(text);
    const htmlHash = await sha256Hex(encoded.buffer);
    const matches = Array.from(text.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css|tsx))["']/gi));
    const assetPaths = matches.map((m) => m[1]);
    return { htmlHash, assetPaths };
  } catch {
    return null;
  }
}
function getDomLoadedAssetPaths() {
  if (typeof document === "undefined") return [];
  const scripts = Array.from(document.querySelectorAll("script[src]")).map(
    (el) => el.getAttribute("src") || ""
  );
  const links = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]')).map(
    (el) => el.getAttribute("href") || ""
  );
  return [...scripts, ...links].filter((p) => p.startsWith("/"));
}
function loadLocalInstalledManifest() {
  try {
    const raw = localStorage.getItem(LOCAL_MANIFEST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveLocalInstalledManifest(manifest) {
  try {
    localStorage.setItem(LOCAL_MANIFEST_KEY, JSON.stringify(manifest));
  } catch {
  }
}
async function ensureBaselineManifestRecorded() {
  if (loadLocalInstalledManifest()) return;
  const manifest = await fetchLiveFileManifest();
  if (manifest) {
    saveLocalInstalledManifest(manifest);
  }
}
async function checkForRealWebUpdates() {
  const checkedAt = Date.now();
  const remoteManifest = await fetchLiveFileManifest();
  const liveHtml = await fetchDirectLiveHtmlHash();
  let waitingServiceWorker = false;
  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();
        waitingServiceWorker = Boolean(reg.waiting);
      }
    } catch {
    }
  }
  let localManifest = loadLocalInstalledManifest();
  if (!localManifest && remoteManifest) {
    saveLocalInstalledManifest(remoteManifest);
    localManifest = remoteManifest;
  }
  const fileChecks = [];
  if (remoteManifest && localManifest) {
    const allPaths = Array.from(
      /* @__PURE__ */ new Set([...Object.keys(localManifest.files), ...Object.keys(remoteManifest.files)])
    ).sort();
    for (const filePath of allPaths) {
      const localEntry = localManifest.files[filePath];
      const remoteEntry = remoteManifest.files[filePath];
      if (!localEntry && remoteEntry) {
        fileChecks.push({
          path: filePath,
          status: "added",
          remoteHash: remoteEntry.sha256,
          size: remoteEntry.size
        });
      } else if (localEntry && !remoteEntry) {
        fileChecks.push({
          path: filePath,
          status: "removed",
          localHash: localEntry.sha256,
          size: localEntry.size
        });
      } else if (localEntry && remoteEntry) {
        fileChecks.push({
          path: filePath,
          status: localEntry.sha256 === remoteEntry.sha256 ? "same" : "modified",
          localHash: localEntry.sha256,
          remoteHash: remoteEntry.sha256,
          size: remoteEntry.size
        });
      }
    }
  } else if (liveHtml) {
    const domAssets = getDomLoadedAssetPaths();
    const domJoined = domAssets.slice().sort().join("|");
    const liveJoined = liveHtml.assetPaths.slice().sort().join("|");
    const isSame = domJoined === liveJoined;
    fileChecks.push({
      path: "/index.html",
      status: isSame ? "same" : "modified",
      localHash: domJoined || "mevcut-oturum",
      remoteHash: liveHtml.htmlHash
    });
  }
  const changedFiles = fileChecks.filter((f) => f.status !== "same");
  const hasUpdate = changedFiles.length > 0 || waitingServiceWorker;
  return {
    checkedAt,
    hasUpdate,
    totalScanned: fileChecks.length,
    changedCount: changedFiles.length,
    waitingServiceWorker,
    localFingerprint: localManifest?.rootFingerprint ?? "yerel-oturum",
    remoteFingerprint: remoteManifest?.rootFingerprint ?? liveHtml?.htmlHash ?? "bilinmiyor",
    sourceLabel: remoteManifest?.source === "dist-bundle" ? "Canlı Netlify/Web Üretim Paketi" : "Canlı Sunucu Dosya Taraması",
    fileChecks,
    summary: hasUpdate ? `${changedFiles.length} dosyada gerçek sürüm farkı tespit edildi${waitingServiceWorker ? " ve yeni Service Worker paketi hazır" : ""}.` : "Web sunucusundaki tüm dosyalar tarandı. Mevcut kurulu sürümle birebir aynı (güncel)."
  };
}
async function installRealWebUpdate(onProgress) {
  onProgress?.("Eski önbellek ve kurulu uygulama dosyaları siliniyor...");
  if ("caches" in window) {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((key) => caches.delete(key)));
  }
  onProgress?.("Mevcut Service Worker kayıtları temizleniyor...");
  if ("serviceWorker" in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((reg) => reg.unregister()));
  }
  onProgress?.("İnternetten yeni web dosyaları doğrulanıp indiriliyor...");
  const freshManifest = await fetchLiveFileManifest();
  if (freshManifest) {
    const pathsToWarm = ["/index.html", ...Object.keys(freshManifest.files).slice(0, 12)];
    await Promise.all(
      pathsToWarm.map(
        (p) => fetch(`${p}?_reinstall=${Date.now()}`, { cache: "no-store" }).catch(() => null)
      )
    );
    saveLocalInstalledManifest(freshManifest);
  }
  onProgress?.("Yeni Service Worker yeniden kuruluyor...");
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
    } catch {
    }
  }
  onProgress?.("Uygulama güncel dosyalarla yeniden başlatılıyor...");
  window.location.reload();
}
export {
  checkForRealWebUpdates,
  ensureBaselineManifestRecorded,
  installRealWebUpdate,
  loadLocalInstalledManifest,
  saveLocalInstalledManifest
};
