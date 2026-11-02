"""Безопасное хранение вложений.

* Белый список расширений; MIME определяется сервером по расширению,
  а не берётся из заголовка клиента.
* Потоковая асинхронная запись кусками с ограничением размера —
  без чтения всего файла в память и без блокировки event loop.
* Отдача всегда с `Content-Disposition: attachment` и `nosniff`,
  чтобы загруженный HTML/SVG не исполнился в браузере.
"""

from pathlib import Path
from uuid import uuid4

import anyio
from fastapi import HTTPException, UploadFile

from app.config import get_settings

CHUNK_SIZE = 1024 * 1024

ALLOWED_TYPES: dict[str, str] = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".gif": "image/gif",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".zip": "application/zip",
}


def upload_root() -> Path:
    return Path(get_settings().upload_dir).resolve()


def safe_original_name(filename: str | None) -> str:
    name = Path(filename or "file").name.replace("\x00", "").strip()
    return (name or "file")[:255]


def resolve_storage_path(storage_name: str) -> Path:
    root = upload_root()
    path = (root / storage_name).resolve()
    if path.parent != root:
        raise HTTPException(status_code=404, detail="Файл не найден")
    return path


async def store_upload(file: UploadFile) -> tuple[str, str, str, int]:
    """Сохраняет файл. Возвращает (original_name, storage_name, content_type, size)."""
    settings = get_settings()
    max_size = settings.max_upload_mb * 1024 * 1024
    original_name = safe_original_name(file.filename)
    suffix = Path(original_name).suffix.lower()
    content_type = ALLOWED_TYPES.get(suffix)
    if content_type is None:
        allowed = ", ".join(sorted(ALLOWED_TYPES))
        raise HTTPException(status_code=415, detail=f"Тип файла не поддерживается. Разрешены: {allowed}")

    root = upload_root()
    await anyio.Path(root).mkdir(parents=True, exist_ok=True)
    storage_name = f"{uuid4().hex}{suffix}"
    path = root / storage_name
    size = 0
    try:
        async with await anyio.open_file(path, "wb") as target:
            while chunk := await file.read(CHUNK_SIZE):
                size += len(chunk)
                if size > max_size:
                    raise HTTPException(
                        status_code=413,
                        detail=f"Максимальный размер файла {settings.max_upload_mb} МБ",
                    )
                await target.write(chunk)
    except BaseException:
        await anyio.Path(path).unlink(missing_ok=True)
        raise
    if size == 0:
        await anyio.Path(path).unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail="Файл пустой")
    return original_name, storage_name, content_type, size
