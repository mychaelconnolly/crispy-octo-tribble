import { Flux as FluxGL } from "../flux-gl";
import { Flux } from "../flux";
import { Elm } from "./Main.elm";

let flux;

function loadImage(imageUrl) {
  return fetch(imageUrl)
    .then((response) => response.blob())
    .then((blob) => createImageBitmap(blob, { resizeWidth: 500, resizeHeight: 500 }));
}

function applyImageColorMode(settings) {
  if (settings.colorMode?.ImageFile) {
    return loadImage(settings.colorMode.ImageFile).then((bitmap) => flux.save_image(bitmap));
  }

  return Promise.resolve();
}

function setupFlux() {
  const ui = Elm.Main.init({
    node: document.getElementById("controls"),
  });

  ui.ports.initFlux.subscribe(async function(settings) {
    if (navigator.gpu) {
      console.log("Backend: WebGPU");
      flux = await new Flux(settings);
    } else {
      console.log("Backend: WebGL2");
      flux = new FluxGL(settings);
    }

    await applyImageColorMode(settings);

    function animate(timestamp) {
      flux.animate(timestamp);
      window.requestAnimationFrame(animate);
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      let { width, height } = entry.contentRect;
      flux.resize(width, height);
    });
    resizeObserver.observe(document.getElementById("canvas"));

    window.requestAnimationFrame(animate);
  });

  ui.ports.setSettings.subscribe(async function(newSettings) {
    await applyImageColorMode(newSettings);
    flux.settings = newSettings;
  });
}

setupFlux();
