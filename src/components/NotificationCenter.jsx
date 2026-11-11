import { Bell, Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchMyNotifications, markNotificationRead } from '../lib/notifications.js';

export default function NotificationCenter({ userId }) {
  const location = useLocation();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  async function loadNotifications() {
    try {
      const result = await fetchMyNotifications();
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not load notifications.');
    }
  }

  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      setUnreadCount(0);
      return undefined;
    }

    loadNotifications();
    function refreshOnResume() {
      if (document.visibilityState === 'visible') loadNotifications();
    }
    document.addEventListener('visibilitychange', refreshOnResume);
    return () => document.removeEventListener('visibilitychange', refreshOnResume);
  }, [userId, location.key]);

  async function markAsRead(notification) {
    try {
      await markNotificationRead(notification.id);
      if (notification.read_at) return;
      setNotifications(current => current.map(item => (
        item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item
      )));
      setUnreadCount(count => Math.max(0, count - 1));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not mark notification as read.');
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={isOpen}
        onClick={() => {
          setIsOpen(open => !open);
          loadNotifications();
        }}
        className="relative inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <Bell className="h-4 w-4" />
        <span className="hidden sm:inline">Notifications</span>
        {unreadCount > 0 && (
          <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-xs font-black text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 max-h-[min(70vh,32rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-black text-slate-900 dark:text-white">Notifications</h2>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {unreadCount} unread
            </span>
          </div>
          {errorMessage && <p role="alert" className="mb-2 text-sm text-rose-700 dark:text-rose-300">{errorMessage}</p>}
          {notifications.length === 0 ? (
            <p className="py-5 text-center text-sm text-slate-500 dark:text-slate-400">No notifications yet.</p>
          ) : (
            <ul className="space-y-2">
              {notifications.map(notification => (
                <li
                  key={notification.id}
                  className={`rounded-lg border p-3 ${
                    notification.read_at
                      ? 'border-slate-200 dark:border-slate-700'
                      : 'border-indigo-200 bg-indigo-50 dark:border-indigo-500/30 dark:bg-indigo-500/10'
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{notification.message}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <time className="text-xs text-slate-500 dark:text-slate-400" dateTime={notification.created_at}>
                      {new Date(notification.created_at).toLocaleString()}
                    </time>
                    {!notification.read_at && (
                      <button
                        type="button"
                        onClick={() => markAsRead(notification)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 hover:underline dark:text-indigo-300"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Mark as read
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
