import { Note } from '../types';

// Track alerted note reminders to avoid spamming the user.
const alertedItems = new Set<string>();

/**
 * 通知の許可リクエスト
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    return 'denied';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/**
 * メモ全体に設定した期限だけをリマインドする。
 * ToDoタスクには期限・カレンダー・期限通知を持たせない。
 */
export function checkReminders(
  notes: Note[],
  onReminderTriggered?: (title: string, body: string) => void
) {
  const now = Date.now();

  notes.forEach((note) => {
    if (!note.reminderActive || !note.dueDate) return;

    const dueTime = new Date(note.dueDate).getTime();
    const noteAlertKey = `note-${note.id}-${note.dueDate}`;

    if (
      !alertedItems.has(noteAlertKey) &&
      dueTime <= now + 15 * 60 * 1000 &&
      dueTime >= now - 60 * 60 * 1000
    ) {
      alertedItems.add(noteAlertKey);
      const title = `⏰ メモのリマインダー: ${note.title || '無題'}`;
      const body = `期限: ${new Date(note.dueDate).toLocaleString('ja-JP')} のメモがあります。`;
      sendNotification(title, body);
      onReminderTriggered?.(title, body);
    }
  });
}

function sendNotification(title: string, body: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
      });
    } catch {
      // Ignore if background notification fails in iframe.
    }
  }
}
