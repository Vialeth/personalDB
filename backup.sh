#!/bin/bash

# Backup directory
BACKUP_DIR="./backups"
DB_DIR="./database"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="$BACKUP_DIR/exlibris_backup_$TIMESTAMP.tar.gz"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Create a compressed archive of the database folder
echo "📦 Backing up database..."
tar -czf "$BACKUP_FILE" "$DB_DIR"

# Optional: Also backup uploaded images
# tar -czf "$BACKUP_DIR/uploads_backup_$TIMESTAMP.tar.gz" "./public/uploads"

echo "✅ Backup created: $BACKUP_FILE"

# Retention Policy: Keep only the last 7 backups
echo "🧹 Cleaning up old backups (keeping last 7)..."
ls -t "$BACKUP_DIR"/exlibris_backup_*.tar.gz | tail -n +8 | xargs -r rm --

# Cloud Sync (Google Drive)
# Checks if 'gdrive' remote is configured in rclone
if command -v rclone &> /dev/null && rclone listremotes | grep -q "gdrive:"; then
    echo "☁️ Syncing to Google Drive..."
    rclone copy "$BACKUP_DIR" "gdrive:ExLibrisBackups"
    echo "✅ Cloud sync completed!"
else
    echo "⚠️ Rclone not configured or 'gdrive' remote missing. Skipping cloud sync."
fi

echo "✨ Done!"
