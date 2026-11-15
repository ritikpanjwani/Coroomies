"""Content-based validation for uploaded avatar images.

We never trust the client-supplied filename or MIME type. Instead we inspect
the raw bytes: each supported format has a strict signature plus a few
structural sanity checks that reject trivially malformed files and non-image
payloads renamed to look like images.
"""

import struct

MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB

# Client extensions we are willing to consider. The stored extension is always
# derived from the detected content, not from this value.
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


class InvalidImageError(ValueError):
    """Raised when uploaded bytes are not a supported, valid image."""


def _is_png(data: bytes) -> bool:
    if len(data) < 33 or not data.startswith(b"\x89PNG\r\n\x1a\n"):
        return False
    # First chunk must be IHDR and carry a non-zero width/height.
    if data[12:16] != b"IHDR":
        return False
    width, height = struct.unpack(">II", data[16:24])
    if width == 0 or height == 0:
        return False
    # A well-formed PNG terminates with the IEND chunk.
    if b"IEND" not in data[-32:]:
        return False
    return True


def _is_jpeg(data: bytes) -> bool:
    if len(data) < 4 or not data.startswith(b"\xff\xd8\xff"):
        return False
    # Valid JPEG streams end with the EOI marker.
    if not data.endswith(b"\xff\xd9"):
        return False
    return True


def _is_gif(data: bytes) -> bool:
    if len(data) < 14 or data[:6] not in (b"GIF87a", b"GIF89a"):
        return False
    width = data[6] | (data[7] << 8)
    height = data[8] | (data[9] << 8)
    if width == 0 or height == 0:
        return False
    # GIF streams end with the trailer byte.
    if data[-1] != 0x3B:
        return False
    return True


def _is_webp(data: bytes) -> bool:
    if len(data) < 16 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        return False
    riff_size = struct.unpack("<I", data[4:8])[0]
    if riff_size < 12 or riff_size + 8 > len(data):
        return False
    # First chunk must be a known WebP bitstream.
    if data[12:16] not in (b"VP8 ", b"VP8L", b"VP8X"):
        return False
    return True


def detect_image_extension(data: bytes) -> str:
    """Return the safe file extension for validated image *data*.

    Raises InvalidImageError for empty, oversized, unsupported, or malformed
    payloads.
    """
    if not data:
        raise InvalidImageError("The uploaded file is empty")

    if len(data) > MAX_IMAGE_SIZE:
        raise InvalidImageError("File must be under 5 MB")

    if _is_png(data):
        return ".png"
    if _is_jpeg(data):
        return ".jpg"
    if _is_gif(data):
        return ".gif"
    if _is_webp(data):
        return ".webp"

    raise InvalidImageError(
        "Unsupported or invalid image file. Please upload a JPG, PNG, GIF, or WebP image."
    )


def read_limited(file_obj, max_size: int = MAX_IMAGE_SIZE) -> bytes:
    """Read at most max_size + 1 bytes so oversized uploads never fill memory."""
    data = file_obj.read(max_size + 1)
    if len(data) > max_size:
        raise InvalidImageError("File must be under 5 MB")
    return data
