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

setup_buttons = () => {
  document.querySelector("#works_select").onclick = () => {
    populate_works();
  };

  document.querySelector("#artists_select").onclick = () => {
    populate_artists();
  };
};

create_work_elem = (work, artist) => {
  const parser = new DOMParser();
  const main_img_thumb_path = "./data/imgs/works/thumbnails/" + work.main_img;
  const main_img_full_path = "./data/imgs/works/full_res/" + work.main_img;
  const artist_img_path = "./data/imgs/artists/" + artist.img;
  let work_thumbnails_html = "";
  const all_imgs = [work.main_img].concat(work.imgs);
  for (const [i, img] of all_imgs.entries()) {
    thumbnail_path = "./data/imgs/works/thumbnails/" + img;
    work_thumbnails_html += `
      <div id="work_${work.work_id}_thumb_bar_img_${i}" class="work_thumb_bar_entry">
        <img src="${thumbnail_path}" />
      </div>
    `;
  }

  const work_elem = parser.parseFromString(
    `
    <div class="work_thumb" id="work_${work.work_id}">
      <div class="close hide only_full">×</div>
      <div class="work_info hide only_full">
        <div class="work_artist">
          <img src="${artist_img_path}"/>
        </div>
        <div class="work_details">
          <p class="work_head">
            <span class="work_title">“${work.title}”</span>
            <span class="work_year">(${work.year})</span>
          </p>
          <p class="work_artist_name">${artist.name}</p>
          <p class="work_other">acquired: ${work.acquired}<br />from: ${work["bought where"]}</p>
        </div>
      </div>
      <img src="${main_img_thumb_path}" class="work_img">
      <div class="work_thumbnails_bar hide only_full">
        ${work_thumbnails_html}
      </div>
    </div>
  `,
    "text/html"
  ).body.childNodes[0];

  for (const [i, img] of all_imgs.entries()) {
    work_elem.querySelector(
      `#work_${work.work_id}_thumb_bar_img_${i}`
    ).onclick = () => {
      work_elem
        .querySelector(".work_img")
        .setAttribute("src", "./data/imgs/works/full_res/" + img);
    };
  }

  work_elem.querySelector(".close").onclick = () => {
    work_elem.className = "work_thumb";
    work_elem
      .querySelectorAll(".only_full")
      .forEach((n) => n.classList.add("hide"));
    work_elem
      .querySelector(".work_img")
      .setAttribute("src", main_img_thumb_path);
  };
  work_elem.querySelector(".work_img").onclick = () => {
    if (work_elem.className === "work_thumb") {
      work_elem.className = "work_full";
      work_elem
        .querySelector(".work_img")
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
  const parser = new DOMParser();
  const img_path = "./data/imgs/artists/" + artist.img;

  const artist_elem = parser.parseFromString(
    `
    <div class="work_thumb" id="artist_${artist.id}">
      <div class="close hide only_full">×</div>
      <div class="hide only_full">
          <p class="artist_name">${artist.name}</p>
      </div>
      <img src="${img_path}" class="work_img" />
    </div>
  `,
    "text/html"
  ).body.childNodes[0];

  close_button = artist_elem.querySelector(".close");
  close_button.onclick = () => {
    artist_elem.className = "work_thumb";
    artist_elem
      .querySelectorAll(".only_full")
      .forEach((n) => n.classList.add("hide"));
    artist_elem
      .querySelector(".work_img")
      .setAttribute("src", main_img_thumb_path);
  };
  artist_elem.querySelector(".work_img").onclick = () => {
    if (artist_elem.className === "work_thumb") {
      artist_elem.className = "work_full";
      artist_elem
        .querySelectorAll(".only_full")
        .forEach((n) => n.classList.remove("hide"));
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
