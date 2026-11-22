import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

/** Promise based replacements for window.prompt/confirm, styled like the rest of the app. */

interface PromptOptions {
  title: string;
  label?: string;
  defaultValue?: string;
  confirmLabel?: string;
  /** Renders a select instead of a text input. */
  options?: Array<{ value: string; label: string }>;
}

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
}

interface Dialogs {
  prompt: (options: PromptOptions) => Promise<string | null>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const DialogContext = createContext<Dialogs | null>(null);

export function useDialogs(): Dialogs {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialogs must be used inside DialogProvider');
  return ctx;
}

type Pending =
  | { kind: 'prompt'; options: PromptOptions; resolve: (v: string | null) => void }
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (v: boolean) => void };

export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const prompt = useCallback((options: PromptOptions) => new Promise<string | null>((resolve) => setPending({ kind: 'prompt', options, resolve })), []);
  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ kind: 'confirm', options, resolve })), []);

  const close = (value: string | boolean | null) => {
    if (!pending) return;
    if (pending.kind === 'prompt') pending.resolve(typeof value === 'string' ? value : null);
    else pending.resolve(value === true);
    setPending(null);
  };

  return (
    <DialogContext.Provider value={{ prompt, confirm }}>
      {children}
      {pending && <DialogView pending={pending} onClose={close} />}
    </DialogContext.Provider>
  );
}

function DialogView({ pending, onClose }: { pending: Pending; onClose: (v: string | boolean | null) => void }) {
  const { t } = useTranslation();
  const isPrompt = pending.kind === 'prompt';
  const promptOptions = isPrompt ? pending.options : null;
  const [value, setValue] = useState(promptOptions?.defaultValue ?? promptOptions?.options?.[0]?.value ?? '');
  const inputRef = useRef<HTMLInputElement & HTMLSelectElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement) inputRef.current.select();
    } else {
      confirmRef.current?.focus();
    }
  }, []);

  const submit = () => onClose(isPrompt ? (promptOptions?.options ? value : value.trim() || null) : true);
  const danger = pending.kind === 'confirm' && pending.options.danger;

  return (
    <Modal title={pending.options.title} onClose={() => onClose(null)} size="small">
      {pending.kind === 'confirm' && pending.options.message && <p className="dialog-message">{pending.options.message}</p>}
      {promptOptions && (
        <label>
          {promptOptions.label}
          {promptOptions.options ? (
            <select ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)}>
              {promptOptions.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
          )}
        </label>
      )}
      <div className="actions">
        <button className="btn ghost" onClick={() => onClose(null)}>
          {t('cancel')}
        </button>
        <button ref={confirmRef} className={`btn ${danger ? 'danger' : 'primary'}`} onClick={submit}>
          {pending.options.confirmLabel ?? t('accept')}
        </button>
      </div>
    </Modal>
  );
}

/** Open modals, newest last: only the top one reacts to Escape. */
const modalStack: object[] = [];

/** True while any modal is open (keyboard shortcuts of the library are paused). */
export function isModalOpen(): boolean {
  return modalStack.length > 0;
}

/** Accessible modal: Escape and the backdrop close it. */
export function Modal({
  title,
  onClose,
  children,
  size = 'medium',
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  size?: 'small' | 'medium' | 'large';
}) {
  const { t } = useTranslation();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const token = {};
    modalStack.push(token);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalStack[modalStack.length - 1] === token) {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      modalStack.splice(modalStack.indexOf(token), 1);
    };
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={`modal ${size}`} role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} title={t('close')} aria-label={t('close')}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
