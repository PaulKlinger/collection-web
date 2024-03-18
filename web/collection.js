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
      const main_img_full_path = "./data/imgs/works/full_res/" + work.main_img
      work_thumbnails_html = ""
      for (img of work.imgs) {
        thumbnail_path = "./data/imgs/works/thumbnails/" + img;
        work_thumbnails_html += `
          <div class="work_thumbnail"><img src="${thumbnail_path}" /></div>
        `
      }

      const work_elem = parser.parseFromString(`
        <div class="work_thumb" id="work_${work_id}">
          <img src="${main_img_thumb_path}" class="work_img">
          <div class="work_thumbnails_bar" style="display: none;">
            ${work_thumbnails_html}
          </div>
        </div>
      `, "text/html").body.childNodes[0]
      work_elem.onclick = () => {
        work_elem.classList.remove("work_thumb");
        work_elem.classList.add("work_full");
        work_elem.querySelector(".work_img").setAttribute("src", main_img_full_path);
        work_elem.querySelector(".work_thumbnails_bar").style.display = "block";
      };
      works_elem.append(work_elem);
    }
  };
  