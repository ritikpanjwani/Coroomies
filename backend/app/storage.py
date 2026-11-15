import os
import shutil
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional

from app.config import IS_PRODUCTION

# Base directory for chat media storage.
# Kept in a dedicated protected location that is NOT mounted as a public static directory.
_DEFAULT_STORAGE_DIR = Path(__file__).resolve().parent.parent / "data" / "chat_media"
CHAT_MEDIA_STORAGE_DIR = Path(os.getenv("CHAT_MEDIA_STORAGE_DIR", str(_DEFAULT_STORAGE_DIR)))


class StorageBackend(ABC):
    """Abstract storage backend for message media."""

    @abstractmethod
    def save(self, filename: str, data: bytes) -> str:
        """Save media data and return its storage reference key."""
        pass

    @abstractmethod
    def get_path(self, storage_ref: str) -> Optional[Path]:
        """Return the local filesystem Path if available, or None."""
        pass

    @abstractmethod
    def delete(self, storage_ref: str) -> bool:
        """Delete media by storage reference key. Returns True if deleted."""
        pass

    @abstractmethod
    def exists(self, storage_ref: str) -> bool:
        """Check if media exists in storage."""
        pass


class LocalStorageBackend(StorageBackend):
    """Local filesystem storage implementation."""

    def __init__(self, base_dir: Path = CHAT_MEDIA_STORAGE_DIR):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def save(self, filename: str, data: bytes) -> str:
        # Guarantee no directory traversal by taking basename only
        safe_name = os.path.basename(filename)
        dest_path = self.base_dir / safe_name
        dest_path.write_bytes(data)
        return safe_name

    def get_path(self, storage_ref: str) -> Optional[Path]:
        safe_name = os.path.basename(storage_ref)
        path = self.base_dir / safe_name
        if path.is_file():
            return path
        return None

    def delete(self, storage_ref: str) -> bool:
        safe_name = os.path.basename(storage_ref)
        path = self.base_dir / safe_name
        if path.is_file():
            try:
                path.unlink()
                return True
            except OSError:
                return False
        return False

    def exists(self, storage_ref: str) -> bool:
        safe_name = os.path.basename(storage_ref)
        return (self.base_dir / safe_name).is_file()


# Default singleton instance
media_storage: StorageBackend = LocalStorageBackend()
