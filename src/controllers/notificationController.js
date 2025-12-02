import { query } from '../config/database.js';

/**
 * Available notification sounds
 */
export const NOTIFICATION_SOUNDS = [
  { id: 'default', name: 'Default', file: 'default.mp3' },
  { id: 'chime', name: 'Chime', file: 'chime.mp3' },
  { id: 'bell', name: 'Bell', file: 'bell.mp3' },
  { id: 'ping', name: 'Ping', file: 'ping.mp3' },
  { id: 'pop', name: 'Pop', file: 'pop.mp3' },
  { id: 'ding', name: 'Ding', file: 'ding.mp3' },
  { id: 'alert', name: 'Alert', file: 'alert.mp3' },
  { id: 'gentle', name: 'Gentle', file: 'gentle.mp3' },
  { id: 'none', name: 'None (Silent)', file: null },
];

/**
 * Get all notifications for current user
 */
export const getNotifications = async (req, res) => {
  try {
    const { unread_only, limit = 50, offset = 0 } = req.query;

    let whereClause = 'WHERE n.id_usuario = $1';
    const params = [req.user.id];
    let paramIndex = 2;

    if (unread_only === 'true') {
      whereClause += ' AND n.leido = FALSE';
    }

    const result = await query(
      `SELECT n.*,
              e.titulo as evento_titulo,
              t.titulo as tarea_titulo
       FROM notifications n
       LEFT JOIN eventos_calendario e ON n.id_evento = e.id_evento
       LEFT JOIN tareas t ON n.id_tarea = t.id_tarea
       ${whereClause}
       ORDER BY n.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    // Get unread count
    const countResult = await query(
      'SELECT COUNT(*) as count FROM notifications WHERE id_usuario = $1 AND leido = FALSE',
      [req.user.id]
    );

    res.json({
      notifications: result.rows.map(n => ({
        id: n.id_notification,
        titulo: n.titulo,
        mensaje: n.mensaje,
        tipo: n.tipo,
        leido: n.leido,
        fechaLeido: n.fecha_leido,
        createdAt: n.created_at,
        evento: n.id_evento ? { id: n.id_evento, titulo: n.evento_titulo } : null,
        tarea: n.id_tarea ? { id: n.id_tarea, titulo: n.tarea_titulo } : null,
      })),
      unreadCount: parseInt(countResult.rows[0].count),
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to get notifications.' });
  }
};

/**
 * Get unread notification count
 */
export const getUnreadCount = async (req, res) => {
  try {
    const result = await query(
      'SELECT COUNT(*) as count FROM notifications WHERE id_usuario = $1 AND leido = FALSE',
      [req.user.id]
    );

    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Failed to get unread count.' });
  }
};

/**
 * Mark notification as read
 */
export const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const result = await query(
      `UPDATE notifications
       SET leido = TRUE, fecha_leido = CURRENT_TIMESTAMP
       WHERE id_notification = $1 AND id_usuario = $2
       RETURNING *`,
      [notificationId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found.' });
    }

    res.json({ message: 'Notification marked as read.' });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read.' });
  }
};

/**
 * Mark all notifications as read
 */
export const markAllAsRead = async (req, res) => {
  try {
    await query(
      `UPDATE notifications
       SET leido = TRUE, fecha_leido = CURRENT_TIMESTAMP
       WHERE id_usuario = $1 AND leido = FALSE`,
      [req.user.id]
    );

    res.json({ message: 'All notifications marked as read.' });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read.' });
  }
};

/**
 * Delete a notification
 */
export const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const result = await query(
      'DELETE FROM notifications WHERE id_notification = $1 AND id_usuario = $2 RETURNING id_notification',
      [notificationId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found.' });
    }

    res.json({ message: 'Notification deleted.' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Failed to delete notification.' });
  }
};

/**
 * Clear all notifications
 */
export const clearAllNotifications = async (req, res) => {
  try {
    await query(
      'DELETE FROM notifications WHERE id_usuario = $1',
      [req.user.id]
    );

    res.json({ message: 'All notifications cleared.' });
  } catch (error) {
    console.error('Clear all notifications error:', error);
    res.status(500).json({ error: 'Failed to clear notifications.' });
  }
};

/**
 * Create a notification (internal use or admin)
 */
export const createNotification = async (userId, data) => {
  try {
    const { titulo, mensaje, tipo = 'info', id_evento = null, id_recordatorio = null, id_tarea = null } = data;

    const result = await query(
      `INSERT INTO notifications (id_usuario, titulo, mensaje, tipo, id_evento, id_recordatorio, id_tarea)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, titulo, mensaje, tipo, id_evento, id_recordatorio, id_tarea]
    );

    return result.rows[0];
  } catch (error) {
    console.error('Create notification error:', error);
    throw error;
  }
};

/**
 * Get user preferences
 */
export const getUserPreferences = async (req, res) => {
  try {
    let result = await query(
      'SELECT * FROM user_preferences WHERE id_usuario = $1',
      [req.user.id]
    );

    // If no preferences exist, create default ones
    if (result.rows.length === 0) {
      result = await query(
        `INSERT INTO user_preferences (id_usuario) VALUES ($1) RETURNING *`,
        [req.user.id]
      );
    }

    const prefs = result.rows[0];

    res.json({
      preferences: {
        notificationsEnabled: prefs.notifications_enabled,
        notificationSound: prefs.notification_sound,
        notificationVolume: prefs.notification_volume,
        quietHoursEnabled: prefs.quiet_hours_enabled,
        quietHoursStart: prefs.quiet_hours_start,
        quietHoursEnd: prefs.quiet_hours_end,
        emailNotifications: prefs.email_notifications,
        browserNotifications: prefs.browser_notifications,
        timezone: prefs.timezone,
      },
      availableSounds: NOTIFICATION_SOUNDS,
    });
  } catch (error) {
    console.error('Get user preferences error:', error);
    res.status(500).json({ error: 'Failed to get preferences.' });
  }
};

/**
 * Update user preferences
 */
export const updateUserPreferences = async (req, res) => {
  try {
    const {
      notificationsEnabled,
      notificationSound,
      notificationVolume,
      quietHoursEnabled,
      quietHoursStart,
      quietHoursEnd,
      emailNotifications,
      browserNotifications,
      timezone,
    } = req.body;

    // Validate notification sound
    if (notificationSound && !NOTIFICATION_SOUNDS.find(s => s.id === notificationSound)) {
      return res.status(400).json({ error: 'Invalid notification sound.' });
    }

    // Validate volume
    if (notificationVolume !== undefined && (notificationVolume < 0 || notificationVolume > 100)) {
      return res.status(400).json({ error: 'Volume must be between 0 and 100.' });
    }

    // Check if preferences exist
    const existing = await query(
      'SELECT id FROM user_preferences WHERE id_usuario = $1',
      [req.user.id]
    );

    let result;
    if (existing.rows.length === 0) {
      // Create new preferences
      result = await query(
        `INSERT INTO user_preferences (
          id_usuario, notifications_enabled, notification_sound, notification_volume,
          quiet_hours_enabled, quiet_hours_start, quiet_hours_end,
          email_notifications, browser_notifications, timezone
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          req.user.id,
          notificationsEnabled ?? true,
          notificationSound ?? 'default',
          notificationVolume ?? 80,
          quietHoursEnabled ?? false,
          quietHoursStart ?? '22:00',
          quietHoursEnd ?? '08:00',
          emailNotifications ?? true,
          browserNotifications ?? true,
          timezone ?? 'UTC',
        ]
      );
    } else {
      // Update existing preferences
      result = await query(
        `UPDATE user_preferences SET
          notifications_enabled = COALESCE($1, notifications_enabled),
          notification_sound = COALESCE($2, notification_sound),
          notification_volume = COALESCE($3, notification_volume),
          quiet_hours_enabled = COALESCE($4, quiet_hours_enabled),
          quiet_hours_start = COALESCE($5, quiet_hours_start),
          quiet_hours_end = COALESCE($6, quiet_hours_end),
          email_notifications = COALESCE($7, email_notifications),
          browser_notifications = COALESCE($8, browser_notifications),
          timezone = COALESCE($9, timezone),
          updated_at = CURRENT_TIMESTAMP
        WHERE id_usuario = $10
        RETURNING *`,
        [
          notificationsEnabled,
          notificationSound,
          notificationVolume,
          quietHoursEnabled,
          quietHoursStart,
          quietHoursEnd,
          emailNotifications,
          browserNotifications,
          timezone,
          req.user.id,
        ]
      );
    }

    const prefs = result.rows[0];

    res.json({
      message: 'Preferences updated successfully.',
      preferences: {
        notificationsEnabled: prefs.notifications_enabled,
        notificationSound: prefs.notification_sound,
        notificationVolume: prefs.notification_volume,
        quietHoursEnabled: prefs.quiet_hours_enabled,
        quietHoursStart: prefs.quiet_hours_start,
        quietHoursEnd: prefs.quiet_hours_end,
        emailNotifications: prefs.email_notifications,
        browserNotifications: prefs.browser_notifications,
        timezone: prefs.timezone,
      },
    });
  } catch (error) {
    console.error('Update user preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences.' });
  }
};

/**
 * Get available notification sounds
 */
export const getAvailableSounds = async (req, res) => {
  res.json({ sounds: NOTIFICATION_SOUNDS });
};

/**
 * Process pending reminders and create notifications
 * This should be called by a scheduler/cron job
 */
export const processPendingReminders = async (req, res) => {
  try {
    // Get reminders that should be sent
    const result = await query(
      `SELECT r.*, e.titulo as evento_titulo, e.id_usuario, e.monto, e.tipo as evento_tipo
       FROM recordatorios r
       JOIN eventos_calendario e ON r.id_evento = e.id_evento
       WHERE r.activo = TRUE
         AND r.enviado = FALSE
         AND r.canal = 'notificacion_app'
         AND (e.fecha_hora_inicio - (r.minutos_antes * INTERVAL '1 minute')) <= CURRENT_TIMESTAMP
         AND e.fecha_hora_inicio >= CURRENT_TIMESTAMP`
    );

    const notifications = [];

    for (const reminder of result.rows) {
      // Create notification
      const notification = await createNotification(reminder.id_usuario, {
        titulo: `Reminder: ${reminder.evento_titulo}`,
        mensaje: reminder.mensaje || `Your event "${reminder.evento_titulo}" is coming up in ${reminder.minutos_antes} minutes.`,
        tipo: 'reminder',
        id_evento: reminder.id_evento,
        id_recordatorio: reminder.id_recordatorio,
      });

      // Mark reminder as sent
      await query(
        `UPDATE recordatorios SET enviado = TRUE, fecha_envio = CURRENT_TIMESTAMP WHERE id_recordatorio = $1`,
        [reminder.id_recordatorio]
      );

      notifications.push(notification);
    }

    res.json({
      message: `Processed ${notifications.length} reminders.`,
      count: notifications.length,
    });
  } catch (error) {
    console.error('Process pending reminders error:', error);
    res.status(500).json({ error: 'Failed to process reminders.' });
  }
};
