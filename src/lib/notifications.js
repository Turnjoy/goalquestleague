import { supabase } from './supabase.js';

export async function fetchMyNotifications() {
  const { data, error } = await supabase.rpc('get_my_notifications');
  if (error) throw error;

  return {
    notifications: data ?? [],
    unreadCount: data?.[0]?.unread_count ?? 0,
  };
}

export async function markNotificationRead(notificationId) {
  const { error } = await supabase.rpc('mark_notification_read', {
    notification_id_input: notificationId,
  });
  if (error) throw error;
}
