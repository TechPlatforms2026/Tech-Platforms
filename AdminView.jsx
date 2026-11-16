import { useCallback, useEffect, useState } from "react";
import { Check, ShieldCheck, UserCheck, X } from "lucide-react";
import { apiRequest } from "../lib/apiClient";
function AdminView({ adminUser, onRefreshBootstrap }) {
  const [applications, setApplications] = useState([]);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const loadAdminOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`/api/admin/overview?userId=${encodeURIComponent(adminUser.id)}`);
      if (res.ok && !res.isStaticFallback) {
        setApplications(res.data.applications ?? []);
        setUsers(res.data.users ?? []);
        setStats(res.data.stats ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [adminUser.id]);
  useEffect(() => {
    loadAdminOverview();
  }, [loadAdminOverview]);
  const handleDecision = async (appId, approved) => {
    setStatusMessage("");
    const res = await apiRequest(`/api/admin/applications/${appId}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminUserId: adminUser.id, approved })
    });
    if (res.ok && !res.isStaticFallback) {
      setStatusMessage(
        approved ? "Başvuru onaylandı ve kullanıcıya dosya yükleme yetkisi verildi." : "Başvuru reddedildi."
      );
      await Promise.all([loadAdminOverview(), onRefreshBootstrap()]);
    }
  };
  const handleToggleUpload = async (targetId) => {
    const res = await apiRequest(`/api/admin/users/${targetId}/toggle-upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminUserId: adminUser.id })
    });
    if (res.ok && !res.isStaticFallback) {
      await loadAdminOverview();
    }
  };
  const handleUnban = async (targetId) => {
    const res = await apiRequest(`/api/admin/users/${targetId}/unban`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminUserId: adminUser.id })
    });
    if (res.ok && !res.isStaticFallback) {
      await loadAdminOverview();
    }
  };
  const pendingApps = applications.filter((a) => a.status === "pending");
  return <section aria-labelledby="admin-heading" className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 id="admin-heading" className="font-display text-2xl font-bold text-white sm:text-3xl">
            Sistem Kontrol Merkezi
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Yönetici: <span className="font-mono text-slate-200">{adminUser.email}</span>
          </p>
        </div>
        {stats && <div className="flex items-center gap-6 text-xs text-slate-400 tabular-nums">
            <span>
              Bekleyen Başvuru: <strong className="text-white">{pendingApps.length}</strong>
            </span>
            <span>
              Kayıtlı Kullanıcı: <strong className="text-white">{users.length}</strong>
            </span>
            <span>
              Doğrulanmış E-Posta: <strong className="text-white">{stats.verifiedEmails}</strong>
            </span>
          </div>}
      </div>

      {statusMessage && <div role="status" className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3.5 text-sm text-sky-200">
          {statusMessage}
        </div>}

      {loading ? <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="h-64 animate-pulse rounded-xl border border-slate-800 bg-[#0F1623]" />
          <div className="h-64 animate-pulse rounded-xl border border-slate-800 bg-[#0F1623]" />
        </div> : <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {
    /* Pending Applications */
  }
          <div className="rounded-xl border border-slate-800 bg-[#0F1623] p-6">
            <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="font-display text-base font-semibold text-white">
                Bekleyen Yükleme Başvuruları
              </h2>
              <span className="font-mono text-xs text-amber-400 tabular-nums">
                {pendingApps.length} bekliyor
              </span>
            </div>

            {pendingApps.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">
                Şu anda onay bekleyen başvuru bulunmuyor.
              </p> : <div className="divide-y divide-slate-800/80">
                {pendingApps.map((app) => <div key={app.id} className="space-y-3 py-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {app.name} {app.surname}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {app.accountType.toUpperCase()} · {app.accountEmail} ·{" "}
                          <span className="font-mono tabular-nums">{app.phone}</span>
                        </p>
                      </div>
                      <span
    className={`text-xs font-medium ${app.emailVerified ? "text-emerald-400" : "text-amber-400"}`}
  >
                        {app.emailVerified ? "E-Posta Doğrulandı" : "Doğrulanmadı"}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
    type="button"
    onClick={() => handleDecision(app.id, true)}
    className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500"
  >
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        Kabul Et
                      </button>
                      <button
    type="button"
    onClick={() => handleDecision(app.id, false)}
    className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 text-xs font-semibold text-rose-300 hover:bg-rose-500/20"
  >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                        Reddet
                      </button>
                    </div>
                  </div>)}
              </div>}
          </div>

          {
    /* Registered & Active Users */
  }
          <div className="rounded-xl border border-slate-800 bg-[#0F1623] p-6">
            <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="font-display text-base font-semibold text-white">
                Kullanıcı Yetkileri
              </h2>
              <UserCheck className="h-4 w-4 text-sky-400" aria-hidden="true" />
            </div>

            <div className="custom-scroll max-h-96 divide-y divide-slate-800/80 overflow-y-auto">
              {users.map((u) => {
    const isBanned = u.bannedUntil > Date.now();
    return <div key={u.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">
                        {u.displayName}
                        {u.isAdmin && <span className="ml-2 text-xs font-normal text-sky-400">(Admin)</span>}
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {u.email || "Misafir oturumu"} ·{" "}
                        {u.canUpload ? <span className="text-emerald-400">Yükleyebilir</span> : <span>Kısıtlı</span>}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {isBanned && <button
      type="button"
      onClick={() => handleUnban(u.id)}
      className="h-8 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20"
    >
                          Engeli Kaldır
                        </button>}
                      {!u.isAdmin && <button
      type="button"
      onClick={() => handleToggleUpload(u.id)}
      className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-700 bg-[#090D16] px-2.5 text-xs font-medium text-slate-300 hover:border-slate-500 hover:text-white"
    >
                          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          {u.canUpload ? "Yetkiyi Al" : "Yetki Ver"}
                        </button>}
                    </div>
                  </div>;
  })}
            </div>
          </div>
        </div>}
    </section>;
}
export {
  AdminView
};
