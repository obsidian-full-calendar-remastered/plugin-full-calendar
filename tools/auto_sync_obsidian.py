__docs__ = """
                  auto_sync_obsidian.py
This module provides a file system event handler for automatically syncing changed plugin files
from a local directory to an Android device using ADB. The PluginChangeHandler class listens for
modification events on files, filters out excluded files, and pushes updated files to the
corresponding path on the Android device. This is useful for rapid development and testing of
Obsidian plugins on Android.

Usage:
    - Make sure to set the correct paths for ADB, local plugin directory, and Android target directory.
    - Run the script to start watching for changes in the local plugin directory.

Classes:
    PluginChangeHandler: Handles file modification events and syncs changed files to Android.
Dependencies:
    - os
    - subprocess
    - watchdog.events.FileSystemEventHandler
Constants (expected to be defined elsewhere in the module):
    - EXCLUDE_FILES: List of filenames to exclude from syncing.
    - LOCAL_PLUGIN_PATH: Path to the local plugin directory.
    - ANDROID_PLUGIN_PATH: Target path on the Android device.
    - ADB_PATH: Path to the adb executable.
"""

import os
import time
import subprocess
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# === CONFIG ===
ADB_PATH = r"D:\ProgramFiles\platform-tools\adb"
LOCAL_PLUGIN_PATH = r"D:\Codes\plugin-full-calendar\obsidian-dev-vault\.obsidian\plugins\full-calendar-remastered"
ANDROID_PLUGIN_PATH = "/sdcard/Documents/Obsidian Vault dev/.obsidian/plugins/full-calendar-remastered"

EXCLUDE_FILES = ['.hotreload', '.DS_Store', 'Thumbs.db']

def sync_plugin():
    print("🔄 Syncing plugin to Android...")
    try:
        # Push files one by one, skipping excluded files
        for root, dirs, files in os.walk(LOCAL_PLUGIN_PATH):
            for file in files:
                if file in EXCLUDE_FILES:
                    continue
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, LOCAL_PLUGIN_PATH)
                android_path = ANDROID_PLUGIN_PATH + '/' + rel_path.replace("\\", "/")
                
                subprocess.run([
                    ADB_PATH, 'push', full_path, android_path
                ], check=True)
        print("✅ Sync complete.")
    except subprocess.CalledProcessError as e:
        print("❌ ADB Push Failed:", e)

class PluginChangeHandler(FileSystemEventHandler):
    def on_modified(self, event):
        if event.is_directory:
            return

        # Get the filename to check for exclusions
        filename = os.path.basename(str(event.src_path))
        if filename in EXCLUDE_FILES:
            return

        # Ensure both paths are strings
        relative_path = os.path.relpath(str(event.src_path), str(LOCAL_PLUGIN_PATH))
        android_target_path = ANDROID_PLUGIN_PATH + '/' + relative_path.replace("\\", "/")

        try:
            print(f"🔄 Syncing changed file: {relative_path}")
            subprocess.run([
                ADB_PATH, 'push', str(event.src_path), android_target_path
            ], check=True)
            print("✅ File synced.")
        except subprocess.CalledProcessError as e:
            print("❌ File sync failed:", e)

def main():
    print("👀 Watching for plugin changes in:", LOCAL_PLUGIN_PATH)
    event_handler = PluginChangeHandler()
    observer = Observer()
    observer.schedule(event_handler, LOCAL_PLUGIN_PATH, recursive=True)
    observer.start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
        print("\n🛑 Stopped.")
    observer.join()

if __name__ == "__main__":
    main()
