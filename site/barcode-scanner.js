const OPEN_FOOD_FACTS_API = "https://world.openfoodfacts.org/api/v2/product";
const ZBAR_CDN = "https://cdn.jsdelivr.net/npm/zbar-wasm@2/dist/index.min.mjs";

let scannerModal = null;
let scannerVideo = null;
let scannerStatus = null;
let mediaStream = null;
let scanCanvas = null;
let scanContext = null;
let zbarReady = null;

export async function scanBarcode() {
  ensureModal();
  const code = await startScanning();
  cleanupScanner();

  if (code) {
    return lookupProduct(code);
  }
  return null;
}

function ensureModal() {
  if (scannerModal) return;
  scannerModal = document.createElement("dialog");
  scannerModal.className = "scanner-modal";
  scannerModal.innerHTML = `
    <div class="scanner-viewport">
      <video id="scanner-video" autoplay playsinline></video>
      <div class="scanner-status-bar">
        <span id="scanner-status">Point camera at a barcode</span>
        <button id="scanner-cancel" class="button secondary" type="button">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(scannerModal);
  scannerVideo = scannerModal.querySelector("#scanner-video");
  scannerStatus = scannerModal.querySelector("#scanner-status");
  scannerModal
    .querySelector("#scanner-cancel")
    .addEventListener("click", () => {
      cleanupScanner();
      scannerModal.close();
    });
  scanCanvas = document.createElement("canvas");
  scanCanvas.width = 640;
  scanCanvas.height = 480;
  scanContext = scanCanvas.getContext("2d");
}

async function ensureZbar() {
  if (zbarReady) return zbarReady;
  zbarReady = (async () => {
    const mod = await import(ZBAR_CDN);
    const scanner = new mod.Scanner();
    await scanner.init();
    return scanner;
  })();
  return zbarReady;
}

async function startScanning() {
  try {
    scannerModal.showModal();
    scannerStatus.textContent = "Requesting camera…";

    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
    });
    scannerVideo.srcObject = mediaStream;
    await scannerVideo.play();

    scannerStatus.textContent = "Loading barcode detector…";
    const scanner = await ensureZbar();

    scannerStatus.textContent = "Point camera at a barcode";

    const timeout = setTimeout(() => {
      cleanupScanner();
      scannerModal.close();
    }, 30000);

    while (mediaStream) {
      scanContext.drawImage(scannerVideo, 0, 0, 640, 480);
      const imageData = scanContext.getImageData(0, 0, 640, 480);
      const symbols = scanner.scanImageData(imageData);
      if (symbols.length > 0) {
        clearTimeout(timeout);
        return symbols[0].decode();
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    clearTimeout(timeout);
    return null;
  } catch (err) {
    if (err.name === "NotAllowedError") {
      scannerStatus.textContent = "Camera permission denied";
    } else if (err.name === "NotFoundError") {
      scannerStatus.textContent = "No camera found";
    } else {
      scannerStatus.textContent = `Scanner error: ${err.message}`;
    }
    await new Promise((r) => setTimeout(r, 1500));
    scannerModal.close();
    return null;
  }
}

function cleanupScanner() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  if (scannerVideo) {
    scannerVideo.srcObject = null;
  }
}

export async function lookupProduct(barcode) {
  try {
    const response = await fetch(`${OPEN_FOOD_FACTS_API}/${barcode}.json`);
    const data = await response.json();
    if (data.status === 1 && data.product) {
      const p = data.product;
      const name = p.product_name || p.product_name_en || "";
      const kcal = p.nutriments?.["energy-kcal_100g"];
      const protein = p.nutriments?.proteins_100g;
      const carbs = p.nutriments?.carbohydrates_100g;
      const fat = p.nutriments?.fat_100g;
      let detail = "";
      if (kcal != null) detail += `${Math.round(kcal)} kcal/100g`;
      if (protein != null) detail += ` · ${protein}g protein`;
      return {
        barcode,
        name,
        kcal_per_100g: kcal != null ? Math.round(kcal) : null,
        protein_per_100g: protein != null ? parseFloat(protein) : null,
        carbs_per_100g: carbs != null ? parseFloat(carbs) : null,
        fat_per_100g: fat != null ? parseFloat(fat) : null,
        detail,
      };
    }
    return { barcode, name: null, detail: null };
  } catch {
    return { barcode, name: null, detail: null };
  }
}
