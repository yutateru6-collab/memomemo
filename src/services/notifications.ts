import { Note } from '../types';

// Track alerted items to avoid spamming the user
const alertedTasks = new Set<string>();

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
    const perm = await Notification.requestPermission();
    return perm;
  } catch {
    return 'denied';
  }
}

/**
 * 未完了タスクやメモ期限のリマインダーチェック
 */
export function checkReminders(notes: Note[], onReminderTriggered?: (title: string, body: string) => void) {
  const now = Date.now();

  notes.forEach((note) => {
    // 1. ノート自体の期限リマインダー
    if (note.reminderActive && note.dueDate) {
      const dueTime = new Date(note.dueDate).getTime();
      const noteAlertKey = `note-${note.id}-${note.dueDate}`;

      // 期限が現在から15分以内、または期限切れになってから30分以内でまだ通知していない場合
      if (!alertedTasks.has(noteAlertKey) && dueTime <= now + 15 * 60 * 1000 && dueTime >= now - 60 * 60 * 1000) {
        alertedTasks.add(noteAlertKey);
        const title = `⏰ メモのリマインダー: ${note.title || '無題'}`;
        const body = `期限: ${new Date(note.dueDate).toLocaleString('ja-JP')} のメモがあります。`;
        sendNotification(title, body);
        onReminderTriggered?.(title, body);
      }
    }

    // 2. 個別未完了タスクのリマインダー
    note.tasks.forEach((task) => {
      if (!task.completed && task.dueDate) {
        const dueTime = new Date(task.dueDate).getTime();
        const taskAlertKey = `task-${task.id}-${task.dueDate}`;

        if (!alertedTasks.has(taskAlertKey) && dueTime <= now + 15 * 60 * 1000 && dueTime >= now - 60 * 60 * 1000) {
          alertedTasks.add(taskAlertKey);
          const title = `📋 未完了タスク: ${task.text}`;
          const body = `メモ「${note.title || '無題'}」のタスク期限が近づいています (${new Date(task.dueDate).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })})`;
          sendNotification(title, body);
          onReminderTriggered?.(title, body);
        }
      }
    });
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
      // Ignore if background notification fails in iframe
    }
  }
}
