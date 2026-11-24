import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useUser } from '../core/UserContext.ts';
import { t } from '../i18n/index.ts';
import { CloseIcon } from './Icons.tsx';

interface Props {
  title: string;
  icon?: ReactNode; // before the title
  onClose: () => void;
  children: ReactNode; // a .modal-body and a .modal-footer (in a form: with className="modal-form")
}

// A sheet from the bottom on phones, a centered dialog on wide screens. <dialog> is the browser's own dialog:
// it keeps the keyboard focus inside, and Escape closes it. (The page behind it can't scroll: dialog.css.)
export default function Modal({ title, icon, onClose, children }: Props) {
  const { lang } = useUser();
  const dialog = useRef<HTMLDialogElement>(null);
  const pressedBeside = useRef(false);
  const titleId = useId();

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="modal-backdrop"
      aria-labelledby={titleId}
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      // A tap beside the dialog. (Selecting text and letting go of it outside is not one.)
      onPointerDown={(event) => {
        pressedBeside.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (pressedBeside.current && event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-dialog">
        <div className="modal-header">
          <div className="inline-icon-text">
            {icon}
            <h2 id={titleId}>{title}</h2>
          </div>
          <button type="button" className="icon-close-btn" aria-label={t(lang, 'common.close')} onClick={onClose}>
            <CloseIcon className="icon-sm" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
