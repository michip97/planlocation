import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X, Download } from 'lucide-react';
import { useState, useEffect } from 'react';

// Extend Window interface for the beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export default function PWABadge() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      // Prevent Chrome 67 and earlier from automatically showing the prompt
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    // Show the install prompt
    deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the A2HS prompt');
    } else {
      console.log('User dismissed the A2HS prompt');
    }
    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
  };

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

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  if (!needRefresh && !offlineReady && !deferredPrompt) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-white border border-slate-200 shadow-xl rounded-lg p-4 max-w-sm flex flex-col space-y-3">
      {deferredPrompt && !needRefresh && !offlineReady && (
        <>
          <div className="flex justify-between items-start">
            <h3 className="font-bold text-slate-800">App installieren</h3>
            <button onClick={() => setDeferredPrompt(null)} className="text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>
          <p className="text-sm text-slate-600">
            Installiere PlanSync als App für einen schnelleren Zugriff und Offline-Nutzung.
          </p>
          <button
            onClick={handleInstallClick}
            className="flex items-center justify-center space-x-2 w-full bg-blue-600 text-white rounded py-2 font-medium hover:bg-blue-700"
          >
            <Download size={16} />
            <span>Installieren</span>
          </button>
        </>
      )}

      {(needRefresh || offlineReady) && (
        <>
          <div className="flex justify-between items-start">
            <h3 className="font-bold text-slate-800">
              {offlineReady ? 'Offline bereit' : 'Update verfügbar'}
            </h3>
            <button onClick={close} className="text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>
          <p className="text-sm text-slate-600">
            {offlineReady
              ? 'Die App kann nun ohne Internetverbindung genutzt werden.'
              : 'Eine neue Version ist verfügbar. Bitte aktualisieren, um die neuesten Funktionen zu laden.'}
          </p>

          {needRefresh && (
            <button
              onClick={() => updateServiceWorker(true)}
              className="flex items-center justify-center space-x-2 w-full bg-blue-600 text-white rounded py-2 font-medium hover:bg-blue-700"
            >
              <RefreshCw size={16} />
              <span>Neu laden</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
