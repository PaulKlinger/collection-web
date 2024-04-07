let data;

window.onload = () => {
  fetch("./data/data.json")
    .then((response) => response.json())
    .then((data_in) => {
      data = data_in;
      setup_buttons();
      setup_page_from_url();
    });
};

setup_page_from_url = () => {
  const params = new URLSearchParams(window.location.search);
  setup_page(params.get("page"), params.get("work"), params.get("artist"));
};

setup_page = (page, work, artist) => {
  if (page === "artists") {
    populate_artists();
  } else {
    populate_works();
  }
  if (artist !== null) {
    const elem = document.getElementById(`artist_${artist}`);
    elem.querySelector(".entry_main_img").onclick();
    elem.scrollIntoView({
      behavior: "smooth",
      block: "start",
      inline: "center",
    });
  }
  if (work !== null) {
    const elem = document.getElementById(`work_${work}`);
    elem.querySelector(".entry_main_img").onclick();
    elem.scrollIntoView({
      behavior: "smooth",
      block: "start",
      inline: "center",
    });
  }
};

elem_from_string = (s) => {
  const parser = new DOMParser();
  return parser.parseFromString(s, "text/html").body.childNodes[0];
};

set_params = (page, work, artist) => {
  const baseurl = window.location.href.split("?")[0];
  const params = new URLSearchParams(window.location.search);
  if (page === "works") {
    params.delete("page");
  } else if (page !== null) {
    params.set("page", page);
  }
  if (work === null) {
    params.delete("work");
  } else {
    params.set("work", work);
  }
  if (artist === null) {
    if (page === "artists" || params.get("page") !== "artists") {
      params.delete("artist");
    }
  } else {
    params.set("artist", artist);
  }
  if (params.size === 0) {
    history.replaceState(null, "", baseurl);
  } else {
    history.replaceState(null, "", `${baseurl}?${params.toString()}`);
  }
};

setup_buttons = () => {
  document.querySelector("#works_select").onclick = () => {
    populate_works();
    set_params("works", null, null);
  };

  document.querySelector("#artists_select").onclick = () => {
    populate_artists();
    set_params("artists", null, null);
  };
};

setup_360_vid = (vid_elem) => {
  // clone node to remove any potentially still active event listeners
  const vid = vid_elem.cloneNode(true);
  vid_elem.replaceWith(vid);

  vid.last_updated = Date.now();
  vid.addEventListener(
    "pointerdown",
    (e) => {
      if (e.buttons & (1 === 1)) {
        vid.pause();
        vid.start_x = e.offsetX;
        vid.start_cur_time = vid.currentTime;
      }
      e.preventDefault();
      vid.parentElement.querySelector(".swipe_hint").classList.add("hide");
    },
    true,
  );
  vid.addEventListener(
    "pointermove",
    (e) => {
      // seek to new position if mouse/touch is pressed and
      // it's been at least 20ms since the last seek
      if (e.buttons & (1 === 1) && Date.now() - vid.last_updated > 20) {
        if (vid.start_cur_time === undefined) {
          // pointer down happened outside of video element
          vid.pause();
          vid.start_cur_time = vid.currentTime;
          vid.start_x = e.offsetX;
          vid.parentElement.querySelector(".swipe_hint").classList.add("hide");
          return;
        }
        if (!(vid.duration > 0)) {
          return;
        }
        // fraction of video element width that the pointer has moved since start of motion
        const fraction_moved = (e.offsetX - vid.start_x) / vid.offsetWidth;
        const new_time =
          (vid.start_cur_time + vid.duration * fraction_moved + vid.duration) %
          vid.duration;
        vid.currentTime = new_time;
        vid.last_updated = Date.now();
        e.preventDefault();
      }
    },
    true,
  );
};

create_work_elem = (work, artist) => {
  let work_thumbnails_html = "";

  // create thumbnail imgs
  for (const [i, img] of work.media.entries()) {
    work_thumbnails_html += `
      <div id="work_${work.work_id}_thumb_bar_img_${i}" class="entry_thumb_bar_entry">
        <img src="${img.thumb_path}" />
      </div>
    `;
  }

  // create main element
  const work_elem = elem_from_string(
    `
    <div class="entry_thumb work" id="work_${work.id}">
      <div class="close hide only_full">×</div>
      <div class="entry_info hide only_full">
        <div class="work_artist">
          <img src="${artist.img}"/>
        </div>
        <div class="work_details">
          <p class="work_head">
            <span class="work_title">“${work.title}”</span>
            <span class="work_year">(${work.year})</span>
          </p>
          <p class="work_artist_name">${artist.name}</p>
          <p class="work_other">
            <span class="work_other_fieldname">acquired:</span>
            ${work.acquired}
            <br />
            <span class="work_other_fieldname">from:</span>
            ${work["bought where"]}
          </p>
        </div>
      </div>
      <span class="loader only_full hide"></span>
      <img src="${work.media[0].thumb_path}" class="entry_main_img entry_main">
      <div class="video_container entry_main hide">
          <video src="" loop autoplay muted></video>
          <span class="swipe_hint hide"></span>
      </div>
      <div class="entry_thumbnails_bar hide only_full">
        ${work_thumbnails_html}
      </div>
    </div>
  `,
  );

  // add click handler for artist (switch to artist page and expand matching)
  open_artist = () => {
    set_params("artists", null, artist.artist_id);
    setup_page("artists", null, artist.artist_id);
  };
  work_elem.querySelector(".work_artist").onclick = open_artist;
  work_elem.querySelector(".work_artist_name").onclick = open_artist;

  // add click handler for thumbnail images
  for (const [i, img] of work.media.entries()) {
    work_elem.querySelector(
      `#work_${work.work_id}_thumb_bar_img_${i}`,
    ).onclick = () => {
      work_elem.querySelector(".swipe_hint").classList.add("hide");
      if (img.type === "vid") {
        work_elem.querySelector(".video_container").classList.remove("hide");
        work_elem.querySelector(".entry_main_img").classList.add("hide");
        setup_360_vid(work_elem.querySelector("video"));
        // need to do querySelector again, because setup_360_vid replaces the element
        const vid = work_elem.querySelector("video");
        vid.src = img.full_path;
        vid.play().then(() => {
          work_elem.querySelector(".swipe_hint").classList.remove("hide");
        });
      } else {
        work_elem.querySelector(".entry_main_img").classList.remove("hide");
        work_elem.querySelector(".video_container").classList.add("hide");
        work_elem
          .querySelector(".entry_main_img")
          .setAttribute("src", img.full_path);
      }
    };
  }

  // add click handler for close button
  work_elem.querySelector(".close").onclick = () => {
    set_params(null, null, null);
    work_elem.querySelector(".entry_main_img").classList.remove("hide");
    work_elem.querySelector(".video_container").classList.add("hide");
    work_elem.classList.replace("entry_full", "entry_thumb");
    work_elem
      .querySelectorAll(".only_full")
      .forEach((n) => n.classList.add("hide"));
    work_elem
      .querySelector(".entry_main_img")
      .setAttribute("src", work.media[0].thumb_path);
  };

  // add click handler for opening work
  work_elem.querySelector(".entry_main_img").onclick = () => {
    set_params(null, work.id, null);
    if (work_elem.classList.contains("entry_thumb")) {
      work_elem.classList.replace("entry_thumb", "entry_full");
      work_elem
        .querySelector(".entry_main_img")
        .setAttribute("src", work.media[0].full_path);
      work_elem
        .querySelectorAll(".only_full")
        .forEach((n) => n.classList.remove("hide"));
    }
  };
  return work_elem;
};

populate_works = () => {
  const works_elem = document.getElementById("main_list");
  works_elem.innerHTML = "";
  for (const work of Object.values(data.works)) {
    works_elem.append(create_work_elem(work, data.artists[work.artist_id]));
  }
};

create_artist_elem = (artist, works) => {
  // create country string, depending on whether artist lives in
  // their country of birth
  let artist_country_str;
  if (artist.residence !== artist.origin) {
    artist_country_str = `${artist.origin} | ${artist.residence}`;
  } else {
    artist_country_str = artist.origin;
  }

  // create links
  artist_links = "";
  if (artist.website !== "") {
    artist_links += `<p class="artist_link"><a href="${artist.website}">website</a></p>`;
  }
  if (artist.instagram !== "") {
    const instagram_link = `https://www.instagram.com/${artist.instagram.slice(
      1,
    )}/`;
    artist_links += `<p class="artist_link"><a href="${instagram_link}">instagram</a></p>`;
  }

  // create main element
  const artist_elem = elem_from_string(`
    <div class="entry_thumb artist" id="artist_${artist.artist_id}">
      <div class="artist_non_work">
        <div class="close hide only_full">×</div>
        <img src="${artist.img}" class="entry_main_img entry_main" />
        <div class="artist_details hide only_full">
          <p class="artist_name">${artist.name}</p>
          <p class="artist_country">${artist_country_str}</p>
          ${artist_links}
        </div>
      </div>
      <div class="artist_works_list hide only_full">
      </div>
    </div>
  `);

  // add works
  for (const work of works) {
    artist_elem
      .querySelector(".artist_works_list")
      .append(create_work_elem(work, artist));
  }

  // add click handler for close button
  artist_elem.querySelector(".close").onclick = () => {
    set_params("artists", null, null);
    artist_elem.classList.replace("entry_full", "entry_thumb");
    artist_elem
      .querySelectorAll(".only_full")
      .forEach((n) => n.classList.add("hide"));
    for (const work_close_button of artist_elem.querySelectorAll(
      ".artist_works_list .close",
    )) {
      work_close_button.onclick();
    }
  };

  // add click handler for opening artist
  artist_elem.querySelector(".entry_main_img").onclick = () => {
    set_params("artists", null, artist.artist_id);
    if (artist_elem.classList.contains("entry_thumb")) {
      artist_elem.classList.replace("entry_thumb", "entry_full");
      artist_elem.querySelectorAll(".only_full").forEach((n) =>
        // don't expand works
        n.matches(".work .only_full") ? null : n.classList.remove("hide"),
      );
    }
  };
  return artist_elem;
};

populate_artists = () => {
  const artists_elem = document.getElementById("main_list");
  artists_elem.innerHTML = "";
  for (const [artist_id, artist] of Object.entries(data.artists)) {
    artists_elem.append(
      create_artist_elem(
        artist,
        Object.values(data.works).filter((w) => w.artist_id === artist_id),
      ),
    );
  }
};
