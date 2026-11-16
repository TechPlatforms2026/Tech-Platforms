import { Component } from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Beklenmeyen bir hata oluştu.',
    };
  }

  handleHardReset = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      sessionStorage.clear();
    } catch {
      // Ignore cleanup errors
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#090D16] px-4 text-center text-slate-100">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-800 bg-[#0F1623] p-6 shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <ShieldAlert className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="font-display text-xl font-bold text-white">
              Görünüm Güvenli Şekilde Kurtarıldı
            </h1>
            <p className="text-xs leading-relaxed text-slate-400">
              Sayfa yüklenirken geçici bir tarayıcı önbellek uyuşmazlığı oluştu. Tek tıkla temizleyip
              devam edebilirsiniz.
            </p>
            <button
              type="button"
              onClick={this.handleHardReset}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-400"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Önbelleği Temizle ve Yenile
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
