window.onload = () => {
    fetch("./data/data.json")
      .then((response) => response.json())
      .then((data) => {
        populate_works(data);
      });
  };

  
  populate_works = (data) => {
    const thumbnails_elem = document.getElementById("thumbnails");
    for (var [work_id, work] of Object.entries(data.works)) {
      const thumb_elem = document.createElement("div");
      thumb_elem.classList.add("thumbnail");
      const img_elem = document.createElement("img");
      img_elem.setAttribute("src", "./data/imgs/works/thumbnails/" + work.main_img);
      img_elem.classList.add("thumbnail_img");
      thumb_elem.append(img_elem);
      thumb_elem.work = work;
      thumb_elem.onclick = () => {
        thumb_elem.classList.remove("thumbnail");
        thumb_elem.classList.add("main_image");
        img_elem.setAttribute("src", "./data/imgs/works/full_res/" + this.work.main_img);
      };
      thumbnails_elem.append(thumb_elem);
      work.thumbnail_elem = thumb_elem;
    }
  };
  