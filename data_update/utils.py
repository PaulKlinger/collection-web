import os
import shutil
from typing import Any
from typing import Callable
from typing import Iterator

import pysftp
import requests
from googleapiclient import discovery
from httplib2 import Http
from oauth2client import client
from oauth2client import file as oauth_file
from oauth2client import tools


class GooglePhotos:
    def __init__(self, secret: str, secret_store: str):
        self.SCOPE = "https://www.googleapis.com/auth/photoslibrary"
        self.store = oauth_file.Storage(secret_store)
        self.credentials = self.store.get()
        if not self.credentials or self.credentials.invalid:
            self.flow = client.flow_from_clientsecrets(secret, self.SCOPE)
            self.credentials = tools.run_flow(
                self.flow,
                self.store,
                flags=tools.argparser.parse_args([]),  # type: ignore
            )
        self.photos = discovery.build(
            "photoslibrary",
            "v1",
            http=self.credentials.authorize(Http()),
            static_discovery=False,
        )

    def get_album_id(self, album_title: str) -> str:
        albums = self.photos.albums()
        albums_meta = albums.list().execute()["albums"]
        return next(a for a in albums_meta if a["title"] == album_title)["id"]

    def get_album_contents(
        self, album_id: str | None = None, album_title: str | None = None
    ) -> Iterator[dict[str, Any]]:
        if album_id is None:
            assert album_title is not None
            album_id = self.get_album_id(album_title)

        response = self.photos.mediaItems().search(body={"albumId": album_id}).execute()
        yield from response["mediaItems"]
        while "nextPageToken" in response:
            response = (
                self.photos.mediaItems()
                .search(
                    body={"albumId": album_id, "pageToken": response["nextPageToken"]}
                )
                .execute()
            )
            yield from response["mediaItems"]

    @staticmethod
    def download_item(
        base_url: str, target_width: int, target_height: int, output_path: str
    ) -> None:
        url = f"{base_url}=w{target_width}-h{target_height}"
        response = requests.get(url, stream=True)

        with open(output_path, "wb") as out_file:
            shutil.copyfileobj(response.raw, out_file)

    def download_album(
        self,
        album_title: str,
        output_folder: str,
        target_width: int,
        target_height: int,
        exclude: set[str] | None = None,
    ) -> None:
        os.makedirs(output_folder, exist_ok=True)
        for item in self.get_album_contents(album_title=album_title):
            if exclude is not None and item["filename"] in exclude:
                continue
            print(".", end="")
            output_path = os.path.join(output_folder, item["filename"])
            self.download_item(
                item["baseUrl"], target_width, target_height, output_path
            )


class GoogleDrive:
    def __init__(self, secret: str, secret_store: str):
        self.SCOPE = "https://www.googleapis.com/auth/drive.readonly"
        self.store = oauth_file.Storage(secret_store)
        self.credentials = self.store.get()
        if not self.credentials or self.credentials.invalid:
            self.flow = client.flow_from_clientsecrets(secret, self.SCOPE)
            self.credentials = tools.run_flow(
                self.flow,
                self.store,
                flags=tools.argparser.parse_args([]),  # type: ignore
            )
        self.drive = discovery.build(
            "drive",
            "v3",
            http=self.credentials.authorize(Http()),
            static_discovery=False,
        )

    def get_folder_contents(self, folder_id: str) -> Iterator[dict[str, Any]]:
        response = self.drive.files().list(q=f"'{folder_id}' in parents").execute()
        yield from response["files"]
        while "nextPageToken" in response:
            response = (
                self.drive.files().list(pageToken=response["nextPageToken"]).execute()
            )
            yield from response["mediaItems"]

    def download_all_files_in_folder(self, folder_id: str, target_dir: str) -> None:
        os.makedirs(target_dir, exist_ok=True)
        for file in self.get_folder_contents(folder_id):
            print(".", end="")
            with open(os.path.join(target_dir, file["name"]), "wb") as f:
                f.write(self.drive.files().get_media(fileId=file["id"]).execute())


def put_r_portable(
    sftp: pysftp.Connection,
    localdir: str,
    remotedir: str,
    preserve_mtime: bool = False,
    skip_if_exists: Callable[[str], bool] = lambda p: False,
) -> None:
    # https://stackoverflow.com/a/58466685/7089433
    for entry in os.listdir(localdir):
        remotepath = remotedir + "/" + entry
        localpath = os.path.join(localdir, entry)
        if not os.path.isfile(localpath):
            try:
                sftp.mkdir(remotepath)
            except OSError:
                pass
            put_r_portable(sftp, localpath, remotepath, preserve_mtime, skip_if_exists)
        else:
            if skip_if_exists(localpath) and sftp.exists(remotepath):
                continue
            print(f"{localpath} -> {remotepath}")
            sftp.put(localpath, remotepath, preserve_mtime=preserve_mtime)
