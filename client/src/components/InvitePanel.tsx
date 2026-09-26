import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../net/api';
import { useUi } from '../store/ui';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The origin other devices should use. When this device opened the game via localhost,
 * that address is useless to a phone, so ask the server for its LAN address instead.
 */
function useShareOrigin(): { origin: string; lan: boolean } {
  const [state, setState] = useState({ origin: window.location.origin, lan: false });
  useEffect(() => {
    if (!LOCAL_HOSTS.has(window.location.hostname)) return;
    api
      .network()
      .then(({ urls }) => {
        if (urls[0]) setState({ origin: urls[0], lan: true });
      })
      .catch(() => undefined);
  }, []);
  return state;
}

/** Room invite: big code for typing, QR code for scanning with the other phone, and a copyable link. */
export function InvitePanel({ code }: { code: string }) {
  const { origin } = useShareOrigin();
  const url = `${origin}/room/${code}`;
  const [qr, setQr] = useState('');
  const toast = useUi((s) => s.toast);

  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#140a2b', light: '#fff8e7' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ kind: 'info', code: 'copied', message: 'Invite link copied!' }, 2500);
    } catch {
      // Clipboard needs HTTPS on most phones; show the link instead.
      toast({ kind: 'info', code: 'copied', message: url }, 10000);
    }
  };

  return (
    <section className="paper flex flex-col items-center gap-2 p-4 text-center" aria-label="Invite a friend">
      <h2 className="font-display text-xl">Invite players</h2>
      <p className="text-sm font-bold">Scan with the other phone's camera, or type the code on their Home screen.</p>
      {qr && <img src={qr} alt={`QR code for ${url}`} className="h-48 w-48 rounded-xl border-3 border-ink" />}
      <div className="font-display text-4xl tracking-[0.3em]" aria-label={`Room code ${code.split('').join(' ')}`}>
        {code}
      </div>
      <button type="button" onClick={() => void copy()} className="break-all text-xs font-extrabold underline">
        {url}
      </button>
    </section>
  );
}
