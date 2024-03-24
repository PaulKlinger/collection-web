window.onload = () => {
    fetch("./data/data.json")
      .then((response) => response.json())
      .then((data) => {
        populate_works(data);
      });
  };

  
  populate_works = (data) => {
    const works_elem = document.getElementById("main_list");
    const parser = new DOMParser();
    for (const [work_id, work] of Object.entries(data.works)) {
      const main_img_thumb_path = "./data/imgs/works/thumbnails/" + work.main_img;
      const main_img_full_path = "./data/imgs/works/full_res/" + work.main_img;
      const artist = data.artists[work.artist_id];
      const artist_img_path = "./data/imgs/artists/" + artist.img;
      var work_thumbnails_html = "";
      const all_imgs = [work.main_img].concat(work.imgs);
      for (const [i, img] of all_imgs.entries()) {
        thumbnail_path = "./data/imgs/works/thumbnails/" + img;
        work_thumbnails_html += `
          <div id="work_${work.work_id}_thumb_bar_img_${i}" class="work_thumb_bar_entry">
            <img src="${thumbnail_path}" />
          </div>
        `
      }

      const work_elem = parser.parseFromString(`
        <div class="work_thumb" id="work_${work_id}">
          <div class="close_work hide only_full">🞭</div>
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
              <p class="work_other">acquired: ${work.acquired}<br />from: ${work['bought where']}</p>
            </div>
          </div>
          <img src="${main_img_thumb_path}" class="work_img">
          <div class="work_thumbnails_bar hide only_full">
            ${work_thumbnails_html}
          </div>
        </div>
      `, "text/html").body.childNodes[0]

      for (const [i, img] of all_imgs.entries()) {
        work_elem.querySelector(`#work_${work.work_id}_thumb_bar_img_${i}`).onclick = () => {
          work_elem.querySelector(".work_img").setAttribute("src", "./data/imgs/works/full_res/" + img);
        }
      }

      close_work = work_elem.querySelector(".close_work")
      close_work.onclick = () => {
        work_elem.className  = "work_thumb"
        work_elem.querySelectorAll(".only_full").forEach((n) => n.classList.add("hide"));
        work_elem.querySelector(".work_img").setAttribute("src", main_img_thumb_path);
      }
      work_elem.querySelector(".work_img").onclick = () => {
        if (work_elem.className  === "work_thumb") {
          work_elem.className  = "work_full"
          work_elem.querySelector(".work_img").setAttribute("src", main_img_full_path);
          work_elem.querySelectorAll(".only_full").forEach((n) => n.classList.remove("hide"));
        }
      };
      works_elem.append(work_elem);
    }
  };
  