import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

type DialogRequest = { message: string; title?: string; input?: boolean; placeholder?: string; resolve?: (value: string | null) => void };

export const showAppAlert = (message: string, title = 'Notice') => {
  window.dispatchEvent(new CustomEvent<DialogRequest>('turfyslot:dialog', { detail: { message, title } }));
};

export const showAppPrompt = (message: string, placeholder = ''): Promise<string | null> => new Promise((resolve) => {
  window.dispatchEvent(new CustomEvent<DialogRequest>('turfyslot:dialog', { detail: { message, title: 'Enter details', input: true, placeholder, resolve } }));
});

export const AppDialogHost: React.FC = () => {
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    const handleDialog = (event: Event) => {
      const request = (event as CustomEvent<DialogRequest>).detail;
      setValue('');
      setDialog(request);
    };
    window.addEventListener('turfyslot:dialog', handleDialog);
    return () => window.removeEventListener('turfyslot:dialog', handleDialog);
  }, []);

  const close = (result: string | null) => {
    dialog?.resolve?.(result);
    setDialog(null);
  };

  if (!dialog) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(null); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0b1710] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#C8FF5E]" /><div><h2 id="app-dialog-title" className="text-base font-bold text-white">{dialog.title || 'Notice'}</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/70">{dialog.message}</p></div></div>
          <button type="button" onClick={() => close(null)} aria-label="Close dialog" className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"><X size={18} /></button>
        </div>
        {dialog.input && <input autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder={dialog.placeholder} className="mt-4 w-full rounded-xl border border-white/15 bg-black/20 p-3 text-sm text-white outline-none focus:border-[#C8FF5E]" />}
        <div className="mt-5 flex justify-end"><button type="button" autoFocus={!dialog.input} onClick={() => close(dialog.input ? value : '')} className="rounded-lg bg-[#C8FF5E] px-4 py-2 text-sm font-bold text-[#102014]">OK</button></div>
      </section>
    </div>
  );
};
