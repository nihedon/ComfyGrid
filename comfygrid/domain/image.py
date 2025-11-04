import cv2
import orjson
import piexif
import piexif.helper
from PIL import Image, UnidentifiedImageError

WEBP = ".webp"
JXL = ".jxl"
PNG = ".png"


def resize_with_crop(img, target_w=240, target_h=320):
    h, w = img.shape[:2]
    target_ratio = target_w / target_h
    src_ratio = w / h

    if src_ratio > target_ratio:
        new_h = target_h
        new_w = int(target_h * src_ratio)
    else:
        new_w = target_w
        new_h = int(target_w / src_ratio)

    resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)

    h_resized, w_resized = resized.shape[:2]
    x_start = (w_resized - target_w) // 2
    y_start = (h_resized - target_h) // 2
    cropped = resized[y_start:y_start + target_h, x_start:x_start + target_w]

    return cropped


def resize_with_aspect_ratio(img, size=80):
    if img is None:
        raise ValueError("Fail to read image")

    h, w = img.shape[:2]
    if w > h:
        new_w = size
        new_h = int(h * (size / w))
    else:
        new_h = size
        new_w = int(w * (size / h))

    return cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)


def get_metadata(file) -> dict | None:
    try:
        with Image.open(file.file) as image:
            img_info = image.info
    except (FileNotFoundError, UnidentifiedImageError) as e:
        print(f"Error opening image {file.filename}: {e}")
        return None

    if not img_info:
        return None

    metadata = {}
    ext = "." + file.filename.split(".")[-1].lower()
    if ext == PNG:
        metadata = img_info
    else:
        if "exif" not in img_info:
            return None

        try:
            exif_base = piexif.load(img_info["exif"])
            if "0th" in exif_base:
                zeroth = exif_base["0th"]

                header = "Prompt: "
                prompt = zeroth.get(piexif.ImageIFD.Make, bytes()).decode('utf-8', errors='ignore').strip('\x00')
                if prompt.startswith(header):
                    metadata["prompt"] = prompt[len(header):]

                header = "Workflow: "
                workflow = zeroth.get(piexif.ImageIFD.ImageDescription, bytes()).decode('utf-8', errors='ignore').strip('\x00')
                if workflow.startswith(header):
                    metadata["workflow"] = workflow[len(header):]

            if not metadata and "Exif" in exif_base:
                exif = exif_base["Exif"]

                user_comment = exif.get(piexif.ExifIFD.UserComment, None)
                if user_comment:
                    metadata = piexif.helper.UserComment.load(user_comment)

        except Exception as e:
            print(f"Error reading EXIF data from {file.filename}: {e}")
            return None

        if not metadata:
            return None

    try:
        if isinstance(img_info, dict) and "parameters" in img_info:
            metadata = img_info["parameters"]
        if isinstance(metadata, str):
            metadata = orjson.loads(metadata)
    except orjson.JSONDecodeError:
        print(f"Not ComfyUI generated image: {file.filename}")
        metadata = {"metadata": metadata}

    return metadata if metadata else None
