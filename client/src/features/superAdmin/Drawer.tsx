import { useEffect, useRef, type ReactNode } from 'react';
import { CloseIcon } from '../../components/Icons.tsx';

// The menu on phones: it slides over the page from the left. Escape or a tap beside it closes it.
export default function Drawer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
    // On a wide screen the sidebar is there instead.
    const wide = window.matchMedia('(min-width: 860px)');
    wide.addEventListener('change', onClose);
    return () => wide.removeEventListener('change', onClose);
  }, []);

  return (
    <dialog
      ref={dialog}
      className="sa-drawer"
      aria-label="Super Admin Navigation"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="sa-drawer-panel">
        <button type="button" className="icon-close-btn sa-drawer-close" aria-label="Close the menu" onClick={onClose}>
          <CloseIcon className="icon-sm" />
        </button>
        {children}
      </div>
    </dialog>
  );
}
