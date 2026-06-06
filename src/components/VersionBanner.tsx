import React, { useEffect, useRef, useState } from 'react';

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
        <div style={{
            position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
            zIndex: 9999, display: 'flex', alignItems: 'center', gap: '12px',
            background: '#fff', border: '1px solid #0073ea', borderRadius: '8px',
            padding: '10px 16px', boxShadow: '0 4px 20px rgba(0,115,234,0.15)',
            whiteSpace: 'nowrap', fontFamily: 'Figtree, Inter, sans-serif',
        }}>
            <span style={{ color: '#323338', fontSize: '13px' }}>A new version is available</span>
            <button onClick={() => window.location.reload()} style={{
                background: '#0073ea', color: '#fff', border: 'none', borderRadius: '6px',
                padding: '6px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
            }}>Refresh</button>
            <button onClick={() => setUpdateAvailable(false)} style={{
                background: 'none', border: 'none', color: '#676879', cursor: 'pointer',
                fontSize: '16px', lineHeight: 1, padding: '0 2px',
            }}>×</button>
        </div>
    );
};
