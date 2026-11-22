import os
import shutil
import json
import urllib.request
import urllib.error
import urllib.parse
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

    @abstractmethod
    def read_bytes(self, storage_ref: str) -> Optional[bytes]:
        """Read object bytes if available."""
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

    def read_bytes(self, storage_ref: str) -> Optional[bytes]:
        path = self.get_path(storage_ref)
        if path is None:
            return None
        try:
            return path.read_bytes()
        except OSError:
            return None


class SupabaseStorageBackend(StorageBackend):
    """Private Supabase Storage backend using the server service-role key."""

    def __init__(self, supabase_url: str, service_role_key: str, bucket: str):
        self.supabase_url = supabase_url.rstrip("/")
        self.service_role_key = service_role_key
        self.bucket = bucket

    def _headers(self, content_type: Optional[str] = None) -> dict:
        headers = {
            "Authorization": f"Bearer {self.service_role_key}",
            "apikey": self.service_role_key,
        }
        if content_type:
            headers["Content-Type"] = content_type
        return headers

    def save(self, filename: str, data: bytes) -> str:
        safe_name = os.path.basename(filename)
        url = f"{self.supabase_url}/storage/v1/object/{urllib.parse.quote(self.bucket, safe='')}/{urllib.parse.quote(safe_name, safe='')}"
        request = urllib.request.Request(
            url,
            data=data,
            method="POST",
            headers=self._headers("application/octet-stream"),
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read(2048).decode("utf-8", "replace")
            raise RuntimeError(f"Supabase Storage upload failed ({exc.code}): {detail}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError("Supabase Storage is unreachable") from exc
        return safe_name

    def get_path(self, storage_ref: str) -> Optional[Path]:
        return None

    def read_bytes(self, storage_ref: str) -> Optional[bytes]:
        safe_name = os.path.basename(storage_ref)
        url = f"{self.supabase_url}/storage/v1/object/{urllib.parse.quote(self.bucket, safe='')}/{urllib.parse.quote(safe_name, safe='')}"
        request = urllib.request.Request(url, headers=self._headers())
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.read()
        except (urllib.error.HTTPError, urllib.error.URLError):
            return None

    def delete(self, storage_ref: str) -> bool:
        safe_name = os.path.basename(storage_ref)
        url = f"{self.supabase_url}/storage/v1/object/{urllib.parse.quote(self.bucket, safe='')}"
        payload = json.dumps({"prefixes": [safe_name]}).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=payload,
            method="DELETE",
            headers=self._headers("application/json"),
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                response.read()
            return True
        except (urllib.error.HTTPError, urllib.error.URLError):
            return False

    def exists(self, storage_ref: str) -> bool:
        return self.read_bytes(storage_ref) is not None


# Default singleton instance
supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

if supabase_url and supabase_key:
    media_storage: StorageBackend = SupabaseStorageBackend(
        supabase_url,
        supabase_key,
        os.getenv("SUPABASE_CHAT_BUCKET", "chat-media"),
    )
    avatar_storage: StorageBackend = SupabaseStorageBackend(
        supabase_url,
        supabase_key,
        os.getenv("SUPABASE_AVATAR_BUCKET", "profile-avatars"),
    )
    group_avatar_storage: StorageBackend = SupabaseStorageBackend(
        supabase_url,
        supabase_key,
        os.getenv("SUPABASE_GROUP_AVATAR_BUCKET", "group-avatars"),
    )
else:
    media_storage = LocalStorageBackend()
    avatar_storage = LocalStorageBackend(
        Path(__file__).resolve().parent / "uploads" / "avatars"
    )
    group_avatar_storage = LocalStorageBackend(
        Path(__file__).resolve().parent / "uploads" / "groups"
    )
