import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X, Download } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function PWABadge() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: any) {
      // Periodically check for updates
      if (r) {
        setInterval(() => {
          r.update();
        }, 60 * 60 * 1000);
      }
    },
    onRegisterError(error: any) {
      console.error('SW registration error', error);
    },
  });

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });
  }, []);

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    }
  };

  if (!needRefresh && !offlineReady && !deferredPrompt) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-white border border-slate-200 shadow-xl rounded-lg p-4 max-w-sm flex flex-col space-y-3">
      <div className="flex justify-between items-start">
        <h3 className="font-bold text-slate-800">
          {deferredPrompt
            ? 'App installieren'
            : offlineReady
              ? 'Offline bereit'
              : 'Update verfügbar'}
        </h3>
        <button onClick={() => deferredPrompt ? setDeferredPrompt(null) : close()} className="text-slate-400 hover:text-slate-600">
          <X size={18} />
        </button>
      </div>
      <p className="text-sm text-slate-600">
        {deferredPrompt
          ? 'Installiere die App für den besten Offline-Support direkt auf deinem Gerät.'
          : offlineReady
            ? 'Die App kann nun ohne Internetverbindung genutzt werden.'
            : 'Eine neue Version ist verfügbar. Bitte aktualisieren, um die neuesten Funktionen zu laden.'}
      </p>

      {deferredPrompt && (
        <button
          onClick={handleInstallClick}
          className="flex items-center justify-center space-x-2 w-full bg-blue-600 text-white rounded py-2 font-medium hover:bg-blue-700"
        >
          <Download size={16} />
          <span>App installieren</span>
        </button>
      )}

      {needRefresh && !deferredPrompt && (
        <button
          onClick={() => updateServiceWorker(true)}
          className="flex items-center justify-center space-x-2 w-full bg-blue-600 text-white rounded py-2 font-medium hover:bg-blue-700"
        >
          <RefreshCw size={16} />
          <span>Neu laden</span>
        </button>
      )}
    </div>
  );
}
