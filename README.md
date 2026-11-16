# TechCore / TechWorkspace — Cloudflare Pages Dağıtım Rehberi

Bu proje **%100 saf JavaScript** (sıfır TypeScript) olarak yeniden düzenlendi ve **Cloudflare Pages** ile tam uyumlu hale getirildi.

## Cloudflare Pages'e Yükleme (2 Kolay Yol)

### 1. Yol: GitHub Bağlayarak Otomatik Yayınla (Önerilen)
1. Cloudflare Dashboard -> **Workers & Pages** -> **Create** -> **Pages** -> **Connect to Git** bölümüne girin.
2. GitHub deponuzu seçin ve şu ayarları girin:
   - **Framework preset:** `Vite`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
3. İsteğe bağlı olarak **Settings -> Environment variables** kısmına `GEMINI_API_KEY` ekleyebilirsiniz (Cloudflare Edge Fonksiyonları otomatik algılar).
4. **Save and Deploy** butonuna basın!

### 2. Yol: Sürükle-Bırak (Direct Upload)
1. Terminalde `npm run build` çalıştırın.
2. Cloudflare Dashboard -> **Workers & Pages** -> **Create** -> **Pages** -> **Direct Upload** seçin.
3. Oluşan `dist` klasörünü sürükleyip bırakın.

## Neler İyileştirildi?
- **Beyaz Ekran Koruması:** Koyu tema başlangıç CSS'i (`#090D16`), React `ErrorBoundary`, Cloudflare `_headers` önbellek kuralları ve otomatik eski Service Worker temizleyici eklendi.
- **Sıfır TS (Saf JavaScript):** Tüm `.ts` / `.tsx` dosyaları saf `.js` / `.jsx` dosyalarına çevrildi.
- **Cloudflare Pages Edge Fonksiyonları:** `functions/api/[[path]].js` ile canlı teknoloji haberleri, yapay zeka ve doğrulama akışları Cloudflare Edge'de çalışır.
