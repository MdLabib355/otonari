// My unread messages. App.jsx keeps them once and shares them through useUser() with
//   - the banner      (components/Banner.jsx asks the server for them every 5 seconds)
//   - the Loans tab   (unread count)
//   - the loan page   (opening a loan marks its messages as read)

import { useRef, useState } from 'react';
import { api } from './api.js';

export function useInbox() {
  const [inbox, setInbox] = useState([]);
  // Counts up on every change, so a slow, outdated answer from the server can be ignored.
  // (Otherwise a message we just read could pop up in the banner again.)
  const version = useRef(0);

  async function refreshInbox() {
    version.current += 1;
    const myVersion = version.current;
    try {
      const messages = await api.get('/api/inbox');
      if (myVersion === version.current) setInbox(messages);
    } catch {
      // Server or Wi-Fi briefly away: the next poll tries again.
    }
  }

  async function markRead(ids) {
    version.current += 1;
    setInbox((messages) => messages.filter((message) => !ids.includes(message.id)));
    try {
      await api.post('/api/inbox/read', { ids });
    } catch {
      // Still unread on the server, so the next poll brings them back.
    }
  }

  // When another user logs in on this device, the old messages must not stay visible.
  function clearInbox() {
    version.current += 1;
    setInbox([]);
  }

  return { inbox, refreshInbox, markRead, clearInbox };
}
