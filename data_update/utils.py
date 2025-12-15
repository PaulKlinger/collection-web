import datetime as dt
import os
from collections.abc import Callable
from collections.abc import Iterator
from typing import Any

import pysftp
from googleapiclient import discovery
from httplib2 import Http
from oauth2client import client
from oauth2client import file as oauth_file
from oauth2client import tools


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
        files = self.drive.files()
        query = f"'{folder_id}' in parents and trashed = false"
        response = files.list(
            q=query, fields="files(modifiedTime,name,id),nextPageToken"
        ).execute()
        yield from response["files"]
        while "nextPageToken" in response:
            response = files.list(
                q=query, pageToken=response["nextPageToken"]
            ).execute()
            yield from response["files"]

    def download_all_files_in_folder(
        self, folder_id: str, target_dir: str, newer_than: dt.datetime
    ) -> None:
        os.makedirs(target_dir, exist_ok=True)
        for file in self.get_folder_contents(folder_id):
            if dt.datetime.fromisoformat(file["modifiedTime"][:-1]) <= newer_than:
                continue

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
