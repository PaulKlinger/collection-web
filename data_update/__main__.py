import json
import logging
import os
from typing import Any

import pygsheets
import pysftp

from data_update.utils import GooglePhotos
from data_update.utils import put_r_portable

SECRETS = {
    "GDRIVE_SECRET": "./secrets/gdocs_service.json",
    "GPHOTOS_SECRET": "./secrets/google_photos_credentials.json",
    "GPHOTOS_SECRET_STORAGE": "./secrets/photos_api_storage.json",
    "FTP_SECRET": "./secrets/ftp_secrets.json",
}
GPHOTOS_SECRET_STORAGE_ENV_VAR = "GPHOTOS_SECRET_STORAGE"
FTP_SECRET_SOTRAGE_ENV_VAR = "FTP_SECRET"


def write_secrets_to_file():
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

    df = collection_sheet.sheet1.get_as_df()

    df = df[df["include in web"] == "y"].copy()

    df["artist_id"] = df["artist"].str.replace(" ", "_").str.lower()

    artists = (
        df[
            [
                "artist_id",
                "artist",
                "artist gender",
                "artist residence",
                "artist origin",
                "artist_website",
                "artist_instagram",
            ]
        ]
        .drop_duplicates()
        .rename(
            columns={
                "artist": "name",
                "artist gender": "gender",
                "artist residence": "residence",
                "artist origin": "origin",
                "artist_website": "website",
                "artist_instagram": "instagram",
            }
        )
    )

    assert artists["artist_id"].is_unique

    works = df[
        ["id", "artist_id", "acquired", "artist", "title", "year", "bought where"]
    ]

    return {
        "artists": artists.set_index("artist_id", drop=False).to_dict(orient="index"),
        "works": works.set_index("id", drop=False).to_dict(orient="index"),
    }


def add_image_names_to_data(data: dict[str, Any]) -> None:
    gphotos = GooglePhotos(
        "./secrets/google_photos_credentials.json", "./secrets/photos_api_storage.json"
    )
    data["works"] = {k: v | {"imgs": []} for k, v in data["works"].items()}

    for photo in gphotos.get_album_contents(album_title="collection web"):
        work_id = int(photo["description"].removesuffix("*"))
        if photo["description"].endswith("*"):
            data["works"][work_id]["main_img"] = photo["filename"]
        else:
            data["works"][work_id]["imgs"].append(photo["filename"])
        print(".", end="")

    for photo in gphotos.get_album_contents(album_title="collection artists web"):
        artist_id = photo["description"]
        if artist_id not in data["artists"]:
            continue
        data["artists"][artist_id]["img"] = photo["filename"]
        print(".", end="")


def get_photos() -> set[str]:
    gphotos = GooglePhotos(
        "./secrets/google_photos_credentials.json", "./secrets/photos_api_storage.json"
    )

    # download work thumbnails and full images
    gphotos.download_album(
        "collection web",
        "./web/data/imgs/works/thumbnails/",
        200,
        200,
    )
    gphotos.download_album(
        "collection web",
        "./web/data/imgs/works/full_res/",
        1500,
        1500,
    )

    # download artist images
    gphotos.download_album(
        "collection artists web",
        "./web/data/imgs/artists/",
        500,
        500,
    )


def create_json_data(
    data: dict[str, Any],
    output_path: str,
) -> None:
    os.makedirs(os.path.split(output_path)[0], exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(data, f)


def upload_to_server():
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


def main():
    logging.info("writing secrets to files")
    write_secrets_to_file()

    logging.info("getting data from gsheets & preprocessing")
    data = get_tabular_data()

    logging.info("checking for new photos")
    get_photos()

    logging.info("Adding photo data")
    add_image_names_to_data(data)

    logging.info("creating json data")
    create_json_data(
        data,
        output_path="./web/data/data.json",
    )

    logging.info("uploading files")
    upload_to_server()


if __name__ == "__main__":
    logging.getLogger().setLevel("INFO")
    main()
