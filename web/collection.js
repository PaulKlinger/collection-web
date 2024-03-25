let data;

window.onload = () => {
  fetch("./data/data.json")
    .then((response) => response.json())
    .then((data_in) => {
      data = data_in;
      setup_buttons();
      populate_works();
    });
};

elem_from_string = (s) => {
  const parser = new DOMParser();
  return parser.parseFromString(s, "text/html").body.childNodes[0];
};

setup_buttons = () => {
  document.querySelector("#works_select").onclick = () => {
    populate_works();
  };

  document.querySelector("#artists_select").onclick = () => {
    populate_artists();
  };
};

create_work_elem = (work, artist) => {
  const main_img_thumb_path = "./data/imgs/works/thumbnails/" + work.main_img;
  const main_img_full_path = "./data/imgs/works/full_res/" + work.main_img;
  const artist_img_path = "./data/imgs/artists/" + artist.img;
  let work_thumbnails_html = "";
  const all_imgs = [work.main_img].concat(work.imgs);

  // create thumbnail imgs
  for (const [i, img] of all_imgs.entries()) {
    thumbnail_path = "./data/imgs/works/thumbnails/" + img;
    work_thumbnails_html += `
      <div id="work_${work.work_id}_thumb_bar_img_${i}" class="entry_thumb_bar_entry">
        <img src="${thumbnail_path}" />
      </div>
    `;
  }

  // create main element
  const work_elem = elem_from_string(
    `
    <div class="entry_thumb work" id="work_${work.work_id}">
      <div class="close hide only_full">×</div>
      <div class="entry_info hide only_full">
        <div class="work_artist">
          <img src="${artist_img_path}"/>
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
      <img src="${main_img_thumb_path}" class="entry_main_img">
      <div class="entry_thumbnails_bar hide only_full">
        ${work_thumbnails_html}
      </div>
    </div>
  `
  );

  // add click handler for artist (switch to artist page and expand matching)
  open_artist = () => {
    populate_artists();
    document
      .querySelector(`#artist_${artist.artist_id} .entry_main_img`)
      .onclick();
  };
  work_elem.querySelector(".work_artist").onclick = open_artist;
  work_elem.querySelector(".work_artist_name").onclick = open_artist;

  // add click handler for thumbnail images
  for (const [i, img] of all_imgs.entries()) {
    work_elem.querySelector(
      `#work_${work.work_id}_thumb_bar_img_${i}`
    ).onclick = () => {
      work_elem
        .querySelector(".entry_main_img")
        .setAttribute("src", "./data/imgs/works/full_res/" + img);
    };
  }

  // add click handler for close button
  work_elem.querySelector(".close").onclick = () => {
    work_elem.classList.replace("entry_full", "entry_thumb");
    work_elem
      .querySelectorAll(".only_full")
      .forEach((n) => n.classList.add("hide"));
    work_elem
      .querySelector(".entry_main_img")
      .setAttribute("src", main_img_thumb_path);
  };

  // add click handler for opening work
  work_elem.querySelector(".entry_main_img").onclick = () => {
    if (work_elem.classList.contains("entry_thumb")) {
      work_elem.classList.replace("entry_thumb", "entry_full");
      work_elem
        .querySelector(".entry_main_img")
        .setAttribute("src", main_img_full_path);
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
  const img_path = "./data/imgs/artists/" + artist.img;

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
      1
    )}/`;
    artist_links += `<p class="artist_link"><a href="${instagram_link}">instagram</a></p>`;
  }

  // create main element
  const artist_elem = elem_from_string(`
    <div class="entry_thumb artist" id="artist_${artist.artist_id}">
      <div class="artist_non_work">
        <div class="close hide only_full">×</div>
        <img src="${img_path}" class="entry_main_img" />
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
    artist_elem.classList.replace("entry_full", "entry_thumb");
    artist_elem
      .querySelectorAll(".only_full")
      .forEach((n) => n.classList.add("hide"));
    for (const work_close_button of artist_elem.querySelectorAll(
      ".artist_works_list .close"
    )) {
      work_close_button.onclick();
    }
  };

  // add click handler for opening artist
  artist_elem.querySelector(".entry_main_img").onclick = () => {
    if (artist_elem.classList.contains("entry_thumb")) {
      artist_elem.classList.replace("entry_thumb", "entry_full");
      artist_elem.querySelectorAll(".only_full").forEach((n) =>
        // don't expand works
        n.matches(".work .only_full") ? null : n.classList.remove("hide")
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
        Object.values(data.works).filter((w) => w.artist_id === artist_id)
      )
    );
  }
};
