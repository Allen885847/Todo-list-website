(function initializeTaskFileScanner() {
  "use strict";

  const MAX_FILE_BYTES = 12 * 1024 * 1024;
  const MAX_PDF_PAGES = 24;
  const TEXT_TYPES = new Set([
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/json",
    "text/html",
  ]);

  let pdfModulePromise;
  let mammothPromise;
  let tesseractPromise;

  function loadScript(src, globalName) {
    if (window[globalName]) return Promise.resolve(window[globalName]);
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-file-scanner="${globalName}"]`);
      const script = existing || document.createElement("script");
      const onLoad = () => window[globalName]
        ? resolve(window[globalName])
        : reject(new Error(`${globalName} did not load correctly.`));
      script.addEventListener("load", onLoad, { once: true });
      script.addEventListener("error", () => reject(new Error(`Could not load ${globalName}.`)), { once: true });
      if (!existing) {
        script.src = src;
        script.dataset.fileScanner = globalName;
        document.head.append(script);
      }
    });
  }

  function loadPdf() {
    if (!pdfModulePromise) {
      pdfModulePromise = import("/vendor/pdf.min.mjs").then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
        return pdfjs;
      });
    }
    return pdfModulePromise;
  }

  function loadMammoth() {
    if (!mammothPromise) mammothPromise = loadScript("/vendor/mammoth.browser.min.js", "mammoth");
    return mammothPromise;
  }

  function loadTesseract() {
    if (!tesseractPromise) tesseractPromise = loadScript("/vendor/tesseract.min.js", "Tesseract");
    return tesseractPromise;
  }

  async function recognizeImage(image, onProgress) {
    const tesseract = await loadTesseract();
    const result = await tesseract.recognize(image, "eng+chi_sim", {
      workerPath: "/vendor/tesseract.worker.min.js",
      logger(message) {
        if (message.status === "recognizing text") {
          onProgress?.(`Scanning text… ${Math.round((message.progress || 0) * 100)}%`);
        } else if (message.status) {
          onProgress?.("Preparing image recognition…");
        }
      },
    });
    return result?.data?.text || "";
  }

  async function extractPdf(file, onProgress) {
    const pdfjs = await loadPdf();
    const pdfDocument = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    if (pdfDocument.numPages > MAX_PDF_PAGES) {
      throw new Error(`This PDF has ${pdfDocument.numPages} pages. Upload a file with ${MAX_PDF_PAGES} pages or fewer.`);
    }
    const pageTexts = [];
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      onProgress?.(`Reading PDF page ${pageNumber} of ${pdfDocument.numPages}…`);
      const page = await pdfDocument.getPage(pageNumber);
      const content = await page.getTextContent();
      let text = content.items.map((item) => item.str || "").join(" ").trim();
      if (text.length < 20) {
        const viewport = page.getViewport({ scale: 1.6 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        text = await recognizeImage(canvas, (message) => onProgress?.(`Page ${pageNumber}: ${message}`));
        canvas.width = 1;
        canvas.height = 1;
      }
      if (text.trim()) pageTexts.push(text.trim());
    }
    return pageTexts.join("\n\n");
  }

  async function extractDocx(file, onProgress) {
    onProgress?.("Reading Word document…");
    const mammoth = await loadMammoth();
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value || "";
  }

  async function extractText(file, onProgress) {
    if (!(file instanceof File)) throw new Error("Choose a valid file.");
    if (file.size === 0) throw new Error("The selected file is empty.");
    if (file.size > MAX_FILE_BYTES) throw new Error("Choose a file smaller than 12 MB.");

    const name = file.name.toLowerCase();
    if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(name)) {
      onProgress?.("Preparing image recognition…");
      return recognizeImage(file, onProgress);
    }
    if (file.type === "application/pdf" || name.endsWith(".pdf")) return extractPdf(file, onProgress);
    if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || name.endsWith(".docx")) {
      return extractDocx(file, onProgress);
    }
    if (TEXT_TYPES.has(file.type) || /\.(txt|md|csv|json|html?)$/i.test(name)) {
      onProgress?.("Reading document text…");
      return file.text();
    }
    if (name.endsWith(".doc")) throw new Error("Older .doc files are not supported. Save it as DOCX or PDF, then upload it again.");
    throw new Error("Unsupported file. Choose an image, PDF, DOCX, TXT, Markdown, CSV, JSON, or HTML file.");
  }

  window.TaskFileScanner = { extractText, MAX_FILE_BYTES };
})();
