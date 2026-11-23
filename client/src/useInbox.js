// Unread notifications and active return-due loans shared via UserContext.

import { useRef, useState } from 'react';
import { api } from './api.js';

export function useInbox() {
  const [inbox, setInbox] = useState([]);
  const [dueLoans, setDueLoans] = useState([]);
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
      // Transient network hiccup or pending approval status: retry on next event/poll.
    }
  }

  async function markRead(ids) {
    version.current += 1;
    setInbox((messages) => messages.filter((message) => !ids.includes(message.id)));
    try {
      await api.post('/api/inbox/read', { ids });
    } catch {
      // Next refresh reconciles with server.
    }
  }

  async function markAllRead() {
    version.current += 1;
    setInbox([]);
    try {
      await api.post('/api/inbox/read-all');
    } catch {
      refreshInbox();
    }
  }

  function clearInbox() {
    version.current += 1;
    setInbox([]);
    setDueLoans([]);
  }

  return { inbox, dueLoans, refreshInbox, markRead, markAllRead, clearInbox };
}
