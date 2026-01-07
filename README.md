Code and github actions worflow for [paulklinger.com/ceramics](https://paulklinger.com/ceramics), a site that documents my collection of contemporary ceramic art.

The update_site workflow pulls data from a google sheet and images and videos from google drive, creates a json metadata file, and pushes everything to [PaulKlinger/paulklinger.com](https://github.com/PaulKlinger/paulklinger.com) which is deployed via Cloudflare workers.

### Notes

Create video thumbnails:

```Bash
ffmpeg -i .\vid_16_1.mp4 -filter:v fps=fps=15 -lossless 0 -compression_level 4 -quality 75 -loop 0 -s 200:200 vidthumb_16_1.webp
```

adjust quality (max 100) if artefacts are too noticable.
