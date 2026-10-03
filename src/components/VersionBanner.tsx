import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './ui/Icon';

const BUILT_SHA = import.meta.env.VITE_BUILD_SHA ?? '';
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const VERSION_URL = '/taskwise/version.json';

export const VersionBanner: React.FC = () => {
    const lastCheck = useRef(0);
    const [updateAvailable, setUpdateAvailable] = useState(false);

    const check = async () => {
        const now = Date.now();
        if (now - lastCheck.current < CHECK_INTERVAL_MS) return;
        lastCheck.current = now;
        try {
            const res = await fetch(VERSION_URL + '?t=' + now, { cache: 'no-store' });
            if (!res.ok) return;
            const { sha } = await res.json();
            if (sha && BUILT_SHA && sha !== BUILT_SHA) setUpdateAvailable(true);
        } catch { /* silently ignore */ }
    };

    useEffect(() => {
        check();
        const onVisibility = () => { if (document.visibilityState === 'visible') check(); };
        const onFocus = () => check();
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('focus', onFocus);
        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('focus', onFocus);
        };
    }, []);

    if (!updateAvailable) return null;

    return (
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 whitespace-nowrap
            bg-tw-surface/95 backdrop-blur-xl border border-tw-primary/40 rounded-2xl pl-4 pr-2 py-2 shadow-panel animate-pop-in">
            <Icon name="sparkles" className="w-4 h-4 text-tw-primary-text" />
            <span className="text-tw-text text-[13px] font-medium">A new version is available</span>
            <button onClick={() => window.location.reload()} className="btn-primary btn-sm">Refresh</button>
            <button onClick={() => setUpdateAvailable(false)} className="icon-btn w-7 h-7" aria-label="Dismiss">
                <Icon name="x" className="w-3.5 h-3.5" />
            </button>
        </div>
    );
};
