import { query } from '../config/database.js';
import fs from 'fs';
import path from 'path';

/**
 * Built-in notification sounds (generated via Web Audio API on frontend)
 */
export const BUILT_IN_SOUNDS = [
  { id: 'default', name: 'Default', type: 'builtin' },
  { id: 'chime', name: 'Chime', type: 'builtin' },
  { id: 'bell', name: 'Bell', type: 'builtin' },
  { id: 'ping', name: 'Ping', type: 'builtin' },
  { id: 'pop', name: 'Pop', type: 'builtin' },
  { id: 'ding', name: 'Ding', type: 'builtin' },
  { id: 'alert', name: 'Alert', type: 'builtin' },
  { id: 'gentle', name: 'Gentle', type: 'builtin' },
  { id: 'none', name: 'None (Silent)', type: 'builtin' },
];

// For backward compatibility
export const NOTIFICATION_SOUNDS = BUILT_IN_SOUNDS;

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

    // Validate notification sound (built-in or custom)
    if (notificationSound) {
      const isBuiltIn = BUILT_IN_SOUNDS.find(s => s.id === notificationSound);
      const isCustom = notificationSound.startsWith('custom_');

      if (!isBuiltIn && !isCustom) {
        return res.status(400).json({ error: 'Invalid notification sound.' });
      }

      // If custom, verify it belongs to user
      if (isCustom) {
        const customId = notificationSound.replace('custom_', '');
        const customResult = await query(
          `SELECT id FROM custom_notification_sounds WHERE id = $1 AND id_usuario = $2`,
          [customId, req.user.id]
        );
        if (customResult.rows.length === 0) {
          return res.status(400).json({ error: 'Custom sound not found.' });
        }
      }
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
 * Get available notification sounds (built-in + user's custom sounds)
 */
export const getAvailableSounds = async (req, res) => {
  try {
    // Get user's custom sounds
    const result = await query(
      `SELECT * FROM custom_notification_sounds WHERE id_usuario = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );

    const customSounds = result.rows.map(s => ({
      id: `custom_${s.id}`,
      name: s.name,
      type: 'custom',
      url: `/uploads/sounds/${s.filename}`,
      filename: s.filename,
    }));

    res.json({
      sounds: [...BUILT_IN_SOUNDS, ...customSounds],
      builtIn: BUILT_IN_SOUNDS,
      custom: customSounds,
    });
  } catch (error) {
    console.error('Get available sounds error:', error);
    res.status(500).json({ error: 'Failed to get sounds.' });
  }
};

/**
 * Upload custom notification sound
 */
export const uploadCustomSound = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded.' });
    }

    const { originalname, filename, path: filePath, size } = req.file;
    const name = req.body.name || path.basename(originalname, path.extname(originalname));

    // Check if user already has 10 custom sounds (limit)
    const countResult = await query(
      `SELECT COUNT(*) as count FROM custom_notification_sounds WHERE id_usuario = $1`,
      [req.user.id]
    );

    if (parseInt(countResult.rows[0].count) >= 10) {
      // Delete the uploaded file
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'Maximum 10 custom sounds allowed. Please delete some to upload more.' });
    }

    // Save to database
    const result = await query(
      `INSERT INTO custom_notification_sounds (id_usuario, name, filename, original_name, file_size)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user.id, name, filename, originalname, size]
    );

    const sound = result.rows[0];

    res.json({
      message: 'Sound uploaded successfully.',
      sound: {
        id: `custom_${sound.id}`,
        name: sound.name,
        type: 'custom',
        url: `/uploads/sounds/${sound.filename}`,
        filename: sound.filename,
      },
    });
  } catch (error) {
    console.error('Upload custom sound error:', error);
    // Clean up file if upload failed
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    res.status(500).json({ error: 'Failed to upload sound.' });
  }
};

/**
 * Delete custom notification sound
 */
export const deleteCustomSound = async (req, res) => {
  try {
    const { soundId } = req.params;

    // Get sound info
    const result = await query(
      `SELECT * FROM custom_notification_sounds WHERE id = $1 AND id_usuario = $2`,
      [soundId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sound not found.' });
    }

    const sound = result.rows[0];

    // Delete file from disk
    const uploadDir = process.env.UPLOAD_DIR || 'uploads';
    const filePath = path.join(uploadDir, 'sounds', sound.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from database
    await query(
      `DELETE FROM custom_notification_sounds WHERE id = $1`,
      [soundId]
    );

    // If user was using this sound, reset to default
    await query(
      `UPDATE user_preferences
       SET notification_sound = 'default'
       WHERE id_usuario = $1 AND notification_sound = $2`,
      [req.user.id, `custom_${soundId}`]
    );

    res.json({ message: 'Sound deleted successfully.' });
  } catch (error) {
    console.error('Delete custom sound error:', error);
    res.status(500).json({ error: 'Failed to delete sound.' });
  }
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
