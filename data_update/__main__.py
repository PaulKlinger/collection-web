import json
import logging
import os
from typing import Any

import pygsheets
import pysftp

from .utils import GoogleDrive
from .utils import GooglePhotos
from .utils import put_r_portable

SECRETS = {
    "GDRIVE_SECRET": "./secrets/gdocs_service.json",
    "GPHOTOS_SECRET": "./secrets/google_photos_credentials.json",
    "GPHOTOS_SECRET_STORAGE": "./secrets/photos_api_storage.json",
    "GDRIVE_VIDEOS_SECRET": "./secrets/drive_api_storage.json",
    "FTP_SECRET": "./secrets/ftp_secrets.json",
}


WEB_BASE_PATH = "./web/"

WORK_IMGS_PATH = "data/media/works/full_res/"
WORK_THUMBNAILS_PATH = "data/media/works/thumbnails/"
ARTIST_IMG_PATH = "data/media/artists/"
WORK_VID_PATH = "data/media/works/vids/"
WORK_VID_THUMB_PATH = "data/media/works/vidthumbs/"

GDRIVE_360_VID_FOLDER = "1dkYiFVlsWoRUVoacKhSUs7mDn7F2-gpf"
GDRIVE_360_VID_THUMB_FOLDER = "1lmPF0VXHsV_UKPV1tchHIGyJI3lL_kui"


def write_secrets_to_file() -> None:
    for secret_env, secret_path in SECRETS.items():
        os.makedirs(os.path.dirname(secret_path), exist_ok=True)
        if secret_env in os.environ:
            with open(secret_path, "w") as f:
                f.write(os.environ[secret_env])


def get_tabular_data() -> dict[str, Any]:
    # authorization
    gc = pygsheets.authorize(service_file="./secrets/gdocs_service.json")
    collection_sheet = gc.open_by_url(
        "https://docs.google.com/spreadsheets/d/"
        "1Vmr4Eqm3lLJK9b4B1KGpfWJXNCfodEkRtT9pdRNCGgA/edit?usp=drive_link"
    )

    works = collection_sheet.worksheet_by_title("works").get_as_df()
    artists = collection_sheet.worksheet_by_title("artists").get_as_df()

    works = works[works["include in web"] == "y"].copy()

    artists = artists[
        [
            "artist_id",
            "name",
            "gender",
            "residence",
            "origin",
            "website",
            "instagram",
        ]
    ]

    artists = artists[artists["artist_id"].isin(works["artist_id"])]

    works = works[["id", "artist_id", "acquired", "title", "year", "bought where"]]

    return {
        "artists": artists.set_index("artist_id", drop=False).to_dict(orient="index"),
        "works": works.set_index("id", drop=False).to_dict(orient="index"),
    }


def add_media_info_to_data(data: dict[str, Any]) -> None:
    gphotos = GooglePhotos(
        "./secrets/google_photos_credentials.json", "./secrets/photos_api_storage.json"
    )
    data["works"] = {k: v | {"media": []} for k, v in data["works"].items()}

    for photo in gphotos.get_album_contents(album_title="collection web"):
        media_type, work_id, media_index = photo["description"].split("_")
        assert media_type == "img"
        data["works"][int(work_id)]["media"].append(
            {
                "type": media_type,
                "full_path": os.path.join(WORK_IMGS_PATH, photo["filename"]),
                "thumb_path": os.path.join(WORK_THUMBNAILS_PATH, photo["filename"]),
                "media_index": int(media_index),
            }
        )
        print(".", end="")

    for photo in gphotos.get_album_contents(album_title="collection artists web"):
        artist_id = photo["description"]
        if artist_id not in data["artists"]:
            continue
        data["artists"][artist_id]["img"] = os.path.join(
            ARTIST_IMG_PATH, photo["filename"]
        )
        print(".", end="")

    gdrive = GoogleDrive(
        "./secrets/google_photos_credentials.json", "./secrets/drive_api_storage.json"
    )

    for file in gdrive.get_folder_contents(GDRIVE_360_VID_FOLDER):
        name, ext = os.path.splitext(file["name"])
        media_type, work_id, media_index = name.split("_")
        assert media_type == "vid"
        thumbnail_name = file["name"].replace("vid", "vidthumb").replace("mp4", "webp")
        data["works"][int(work_id)]["media"].append(
            {
                "type": media_type,
                "full_path": os.path.join(WORK_VID_PATH, file["name"]),
                "thumb_path": os.path.join(WORK_VID_THUMB_PATH, thumbnail_name),
                "media_index": int(media_index),
            }
        )

    for work in data["works"].values():
        work["media"].sort(key=lambda x: x["media_index"])


def download_media() -> None:
    gphotos = GooglePhotos(
        "./secrets/google_photos_credentials.json", "./secrets/photos_api_storage.json"
    )

    # download work thumbnails and full images
    gphotos.download_album(
        "collection web",
        os.path.join(WEB_BASE_PATH, WORK_THUMBNAILS_PATH),
        200,
        200,
    )
    gphotos.download_album(
        "collection web",
        os.path.join(WEB_BASE_PATH, WORK_IMGS_PATH),
        1500,
        1500,
    )

    # download artist images
    gphotos.download_album(
        "collection artists web",
        os.path.join(WEB_BASE_PATH, ARTIST_IMG_PATH),
        500,
        500,
    )

    gdrive = GoogleDrive(
        "./secrets/google_photos_credentials.json", "./secrets/drive_api_storage.json"
    )
    # download videos
    gdrive.download_all_files_in_folder(
        GDRIVE_360_VID_FOLDER, os.path.join(WEB_BASE_PATH, WORK_VID_PATH)
    )
    # download video thumbnails
    gdrive.download_all_files_in_folder(
        GDRIVE_360_VID_THUMB_FOLDER, os.path.join(WEB_BASE_PATH, WORK_VID_THUMB_PATH)
    )


def create_json_data(
    data: dict[str, Any],
    output_path: str,
) -> None:
    os.makedirs(os.path.split(output_path)[0], exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(data, f)


def upload_to_server() -> None:
    with open("./secrets/ftp_secrets.json") as f:
        ftp_secrets = json.load(f)

    cnopts = pysftp.CnOpts()
    cnopts.hostkeys = None  # type: ignore

    with pysftp.Connection(
        ftp_secrets["NAMECHEAP_SERVER"],
        username=ftp_secrets["NAMECHEAP_USERNAME"],
        password=ftp_secrets["NAMECHEAP_PASSWORD"],
        port=ftp_secrets["NAMECHEAP_PORT"],
        cnopts=cnopts,
    ) as sftp:
        with sftp.cd("public_html"):
            put_r_portable(sftp, "web", "ceramics")


def main() -> None:
    logging.info("writing secrets to files")
    write_secrets_to_file()

    logging.info("getting data from gsheets & preprocessing")
    data = get_tabular_data()

    logging.info("Adding photo data")
    add_media_info_to_data(data)

    logging.info("Creating json data")
    create_json_data(
        data,
        output_path="./web/data/data.json",
    )

    logging.info("Downloading media")
    download_media()

    logging.info("Uploading files")
    upload_to_server()


if __name__ == "__main__":
    logging.getLogger().setLevel("INFO")
    main()
