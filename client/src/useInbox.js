// My unread messages and active return-due loans. App.jsx keeps them once and shares them via useUser():
//   - Banner.jsx   polls every 5 seconds while visible, shows unread messages + sticky return-due bar
//   - BottomNav    shows unread count badge on the Loans tab
//   - LoanPage     marks that loan's messages read and refreshes due loans on return

import { useRef, useState } from 'react';
import { api } from './api.js';

export function useInbox() {
  const [inbox, setInbox] = useState([]);
  const [dueLoans, setDueLoans] = useState([]);
  // Monotonic counter discards stale responses so a message just read never re-appears.
  const version = useRef(0);

  async function refreshInbox() {
    version.current += 1;
    const myVersion = version.current;
    try {
      const [messages, due] = await Promise.all([api.get('/api/inbox'), api.get('/api/due-loans')]);
      if (myVersion === version.current) {
        setInbox(messages);
        setDueLoans(due);
      }
    } catch {
      // Transient network hiccup: next poll retries.
    }
  }

  async function markRead(ids) {
    version.current += 1;
    setInbox((messages) => messages.filter((message) => !ids.includes(message.id)));
    try {
      await api.post('/api/inbox/read', { ids });
    } catch {
      // Still unread on server: next poll reconciles.
    }
  }

  function clearInbox() {
    version.current += 1;
    setInbox([]);
    setDueLoans([]);
  }

  return { inbox, dueLoans, refreshInbox, markRead, clearInbox };
}
