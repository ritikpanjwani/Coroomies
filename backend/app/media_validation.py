"""Content-based validation for chat photos and videos.

Never trusts user-supplied filenames or MIME types. Inspects raw magic bytes
and structural headers to detect exact media type, safe extension, and dimensions.
"""

import os
import struct
from typing import Optional, Tuple

MAX_CHAT_IMAGE_BYTES = int(os.getenv("MAX_CHAT_IMAGE_BYTES", str(10 * 1024 * 1024)))  # 10 MB default
MAX_CHAT_VIDEO_BYTES = int(os.getenv("MAX_CHAT_VIDEO_BYTES", str(50 * 1024 * 1024)))  # 50 MB default


class InvalidMediaError(ValueError):
    """Raised when uploaded file is empty, oversized, unsupported, or corrupted."""
    pass


def _is_png(data: bytes) -> Optional[Tuple[int, int]]:
    if len(data) < 33 or not data.startswith(b"\x89PNG\r\n\x1a\n"):
        return None
    if data[12:16] != b"IHDR":
        return None
    width, height = struct.unpack(">II", data[16:24])
    if width == 0 or height == 0:
        return None
    if b"IEND" not in data[-32:]:
        return None
    return width, height


def _is_jpeg(data: bytes) -> Optional[Tuple[int, int]]:
    if len(data) < 4 or not data.startswith(b"\xff\xd8\xff"):
        return None
    if not data.endswith(b"\xff\xd9"):
        return None

    # Parse SOF marker for width & height
    idx = 2
    width, height = None, None
    data_len = len(data)
    while idx < data_len - 8:
        if data[idx] != 0xFF:
            idx += 1
            continue
        marker = data[idx + 1]
        # Baseline (0xC0), Extended sequential (0xC1), Progressive (0xC2)
        if marker in (0xC0, 0xC1, 0xC2):
            sof_h, sof_w = struct.unpack(">HH", data[idx + 5 : idx + 9])
            if sof_w > 0 and sof_h > 0:
                width, height = sof_w, sof_h
                break
        length = struct.unpack(">H", data[idx + 2 : idx + 4])[0]
        idx += 2 + length
    return (width, height) if width and height else (1, 1)


def _is_gif(data: bytes) -> Optional[Tuple[int, int]]:
    if len(data) < 14 or data[:6] not in (b"GIF87a", b"GIF89a"):
        return None
    width = data[6] | (data[7] << 8)
    height = data[8] | (data[9] << 8)
    if width == 0 or height == 0:
        return None
    if data[-1] != 0x3B:
        return None
    return width, height


def _is_webp(data: bytes) -> Optional[Tuple[int, int]]:
    if len(data) < 16 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        return None
    riff_size = struct.unpack("<I", data[4:8])[0]
    if riff_size < 12 or riff_size + 8 > len(data):
        return None

    # Inspect VP8 chunk
    chunk = data[12:16]
    width, height = None, None
    if chunk == b"VP8 " and len(data) >= 30:
        if data[23:26] == b"\x9d\x01\x2a":
            width = struct.unpack("<H", data[26:28])[0] & 0x3FFF
            height = struct.unpack("<H", data[28:30])[0] & 0x3FFF
    elif chunk == b"VP8L" and len(data) >= 25:
        if data[20] == 0x2F:
            b1, b2, b3, b4 = data[21:25]
            width = 1 + (((b2 & 0x3F) << 8) | b1)
            height = 1 + (((b4 & 0xF) << 10) | (b3 << 2) | ((b2 & 0xC0) >> 6))
    elif chunk == b"VP8X" and len(data) >= 30:
        width = 1 + (data[24] | (data[25] << 8) | (data[26] << 16))
        height = 1 + (data[27] | (data[28] << 8) | (data[29] << 16))

    return (width, height) if width and height else (1, 1)


def _is_mp4(data: bytes) -> bool:
    if len(data) < 12:
        return False
    return data[4:8] == b"ftyp"


def _is_webm(data: bytes) -> bool:
    if len(data) < 16:
        return False
    # EBML header signature and "webm" doc type in the first 64 bytes
    return data.startswith(b"\x1a\x45\xdf\xa3") and b"webm" in data[:64]


def validate_chat_media(data: bytes, client_filename: str = "") -> dict:
    """Validate media bytes, determine media type, safe extension, and metadata.

    Returns dict with keys:
      media_type: "image" | "video"
      extension: ".jpg" | ".png" | ".webp" | ".gif" | ".mp4" | ".webm"
      mime_type: "image/jpeg" | "image/png" | ...
      width: Optional[int]
      height: Optional[int]
      file_size: int
    """
    if not data:
        raise InvalidMediaError("The uploaded file is empty.")

    data_len = len(data)

    # 1. Check Images
    png_dims = _is_png(data)
    if png_dims:
        if data_len > MAX_CHAT_IMAGE_BYTES:
            raise InvalidMediaError(f"Image exceeds maximum size of {MAX_CHAT_IMAGE_BYTES // (1024*1024)} MB.")
        return {
            "media_type": "image",
            "extension": ".png",
            "mime_type": "image/png",
            "width": png_dims[0],
            "height": png_dims[1],
            "file_size": data_len,
        }

    jpeg_dims = _is_jpeg(data)
    if jpeg_dims:
        if data_len > MAX_CHAT_IMAGE_BYTES:
            raise InvalidMediaError(f"Image exceeds maximum size of {MAX_CHAT_IMAGE_BYTES // (1024*1024)} MB.")
        return {
            "media_type": "image",
            "extension": ".jpg",
            "mime_type": "image/jpeg",
            "width": jpeg_dims[0],
            "height": jpeg_dims[1],
            "file_size": data_len,
        }

    webp_dims = _is_webp(data)
    if webp_dims:
        if data_len > MAX_CHAT_IMAGE_BYTES:
            raise InvalidMediaError(f"Image exceeds maximum size of {MAX_CHAT_IMAGE_BYTES // (1024*1024)} MB.")
        return {
            "media_type": "image",
            "extension": ".webp",
            "mime_type": "image/webp",
            "width": webp_dims[0],
            "height": webp_dims[1],
            "file_size": data_len,
        }

    gif_dims = _is_gif(data)
    if gif_dims:
        if data_len > MAX_CHAT_IMAGE_BYTES:
            raise InvalidMediaError(f"Image exceeds maximum size of {MAX_CHAT_IMAGE_BYTES // (1024*1024)} MB.")
        return {
            "media_type": "image",
            "extension": ".gif",
            "mime_type": "image/gif",
            "width": gif_dims[0],
            "height": gif_dims[1],
            "file_size": data_len,
        }

    # 2. Check Videos
    if _is_mp4(data):
        if data_len > MAX_CHAT_VIDEO_BYTES:
            raise InvalidMediaError(f"Video exceeds maximum size of {MAX_CHAT_VIDEO_BYTES // (1024*1024)} MB.")
        return {
            "media_type": "video",
            "extension": ".mp4",
            "mime_type": "video/mp4",
            "width": None,
            "height": None,
            "file_size": data_len,
        }

    if _is_webm(data):
        if data_len > MAX_CHAT_VIDEO_BYTES:
            raise InvalidMediaError(f"Video exceeds maximum size of {MAX_CHAT_VIDEO_BYTES // (1024*1024)} MB.")
        return {
            "media_type": "video",
            "extension": ".webm",
            "mime_type": "video/webm",
            "width": None,
            "height": None,
            "file_size": data_len,
        }

    raise InvalidMediaError(
        "Unsupported or invalid media format. Please upload JPG, PNG, WebP, GIF photos or MP4, WebM videos."
    )
