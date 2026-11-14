        let activeOcrImage = null;
        let ocrRawText = '';
        let ocrTextImage = null;
        let localOcrWorkerPromise = null;
        let ocrProgressHandler = null;
        let ocrCropStart = null;
        let ocrCropDraft = null;
        let ocrLineItems = [];

        // PHOTO-TO-TEXT RECEIPT SCANNER
        function clearOcrFields() {
            document.getElementById('ocrVendor').value = '';
            document.getElementById('ocrDate').value = '';
            document.getElementById('ocrAmount').value = '';
            document.getElementById('ocrSubCat').value = '';
            ocrRawText = '';
            ocrTextImage = null;
            document.getElementById('ocrCorrectedText').value = '';
            document.getElementById('ocrLineItemsList').innerHTML = '';
            ocrLineItems = [];
            document.getElementById('ocrPostBtn').disabled = true;
        }

        function addOcrLineItem(item = {}) {
            const row = document.createElement('div');
            row.className = 'grid grid-cols-2 md:grid-cols-12 gap-2 items-end rounded-lg border border-slate-800 bg-slate-950/60 p-2';
            const addInput = (labelText, name, value, type, step, span) => {
                const wrapper = document.createElement('label');
                wrapper.className = `text-[10px] font-semibold text-slate-500 ${span}`;
                wrapper.textContent = labelText;
                const input = document.createElement('input');
                input.type = type;
                input.dataset.lineItemField = name;
                input.value = value ?? '';
                input.className = 'mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200';
                if (step) input.step = step;
                if (type === 'number') input.min = name === 'quantity' ? '0.001' : '0';
                wrapper.appendChild(input);
                row.appendChild(wrapper);
            };
            addInput('Description', 'description', item.description, 'text', '', 'col-span-2 md:col-span-4');
            addInput('Quantity', 'quantity', item.quantity, 'number', '0.001', 'col-span-1 md:col-span-2');
            addInput('Unit', 'unit', item.unit, 'text', '', 'col-span-1 md:col-span-2');
            addInput('Unit price', 'unitPrice', item.unitPrice, 'number', '0.01', 'col-span-1 md:col-span-2');
            addInput('Line total', 'lineTotal', item.lineTotal, 'number', '0.01', 'col-span-1 md:col-span-2');
            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'col-span-2 justify-self-end rounded px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-950/50';
            removeButton.textContent = 'Remove item';
            removeButton.addEventListener('click', () => {
                row.remove();
                collectOcrLineItems();
            });
            row.appendChild(removeButton);
            document.getElementById('ocrLineItemsList').appendChild(row);
            collectOcrLineItems();
        }

        function collectOcrLineItems() {
            ocrLineItems = [...document.querySelectorAll('#ocrLineItemsList > div')].map(row => {
                const read = name => row.querySelector(`[data-line-item-field="${name}"]`).value.trim();
                const numberOrNull = value => value === '' ? null : Number(value);
                return {
                    description: read('description'),
                    quantity: numberOrNull(read('quantity')),
                    unit: read('unit'),
                    unitPrice: numberOrNull(read('unitPrice')),
                    lineTotal: numberOrNull(read('lineTotal'))
                };
            });
            return ocrLineItems;
        }

        function setOcrLineItems(items) {
            const container = document.getElementById('ocrLineItemsList');
            container.innerHTML = '';
            ocrLineItems = [];
            items.forEach(item => addOcrLineItem(item));
        }

        function setOcrStatus(message, color) {
            const badge = document.getElementById('ocrStatusBadge');
            badge.textContent = message;
            const colorClasses = {
                slate: 'bg-slate-800 text-slate-400',
                blue: 'bg-blue-500/20 text-blue-400',
                rose: 'bg-rose-500/20 text-rose-400',
                amber: 'bg-amber-500/20 text-amber-400',
                emerald: 'bg-emerald-500/20 text-emerald-400'
            };
            badge.className = `text-xs font-semibold px-2.5 py-0.5 rounded-full ${colorClasses[color] || colorClasses.slate}`;
        }

        function retakeOcrPhoto() {
            const cameraInput = document.getElementById('ocrCameraInput');
            cameraInput.value = '';
            cameraInput.click();
        }

        function clearOcrPhoto() {
            activeOcrImage = null;
            ocrCropStart = null;
            ocrCropDraft = null;
            pendingOcrAttachment = null;
            document.getElementById('ocrImgPreview').removeAttribute('src');
            document.getElementById('ocrPreviewContainer').classList.add('hidden');
            document.getElementById('ocrUploadPrompt').classList.remove('hidden');
            document.getElementById('ocrCropControls').classList.add('hidden');
            document.getElementById('ocrPreviewContainer').classList.remove('ocr-crop-mode');
            document.getElementById('ocrCropOverlay').classList.add('hidden');
            document.getElementById('ocrCropSelection').classList.add('hidden');
            document.getElementById('ocrCameraInput').value = '';
            document.getElementById('ocrFileInput').value = '';
            document.getElementById('ocrBoxOverlays').innerHTML = '';
            document.getElementById('scanLaser').classList.add('hidden');
            document.getElementById('ocrScanBtn').disabled = true;
            document.getElementById('ocrGeminiBtn').disabled = true;
            clearOcrFields();
            setOcrStatus('Awaiting Upload', 'slate');
        }

        function handleImageFile(e) {
            const input = e.target;
            const file = input.files[0];
            if(!file) return;
            clearOcrPhoto();

            if (!file.type.startsWith('image/')) {
                setOcrStatus('Please choose an image file', 'rose');
                return;
            }

            const reader = new FileReader();
            reader.onload = function(evt) {
                if(typeof evt.target.result !== 'string') {
                    setOcrStatus('Could not load image', 'rose');
                    return;
                }

                activeOcrImage = { imgSrc: evt.target.result };

                document.getElementById('ocrUploadPrompt').classList.add('hidden');
                document.getElementById('ocrPreviewContainer').classList.remove('hidden');
                document.getElementById('ocrImgPreview').src = evt.target.result;
                document.getElementById('ocrCropControls').classList.remove('hidden');
                updateOcrCropControls();
                clearOcrFields();
                setOcrStatus('Image Ready for Scan', 'blue');
                document.getElementById('ocrBoxOverlays').innerHTML = '';

                document.getElementById('ocrScanBtn').disabled = false;
                document.getElementById('ocrGeminiBtn').disabled = false;
                document.getElementById('ocrPostBtn').disabled = true;
            };
            reader.onerror = function() {
                activeOcrImage = null;
                setOcrStatus('Could not load image', 'rose');
                document.getElementById('ocrScanBtn').disabled = true;
                document.getElementById('ocrGeminiBtn').disabled = true;
                document.getElementById('ocrPostBtn').disabled = true;
            };
            reader.readAsDataURL(file);
        }

        function toggleOcrCropMode() {
            if (!activeOcrImage) return;
            const preview = document.getElementById('ocrPreviewContainer');
            preview.classList.toggle('ocr-crop-mode');
            const cropMode = preview.classList.contains('ocr-crop-mode');
            document.getElementById('ocrScanBtn').disabled = cropMode;
            document.getElementById('ocrGeminiBtn').disabled = cropMode;
            document.getElementById('ocrCropOverlay').classList.toggle('hidden', !cropMode && !activeOcrImage.crop);
            if (cropMode) {
                document.getElementById('ocrBoxOverlays').innerHTML = '';
                clearOcrFields();
            }
            ocrCropStart = null;
            ocrCropDraft = null;
            renderOcrCropSelection(activeOcrImage.crop);
            updateOcrCropControls();
            if (cropMode) {
                setOcrStatus('Drag around the printed receipt area', 'amber');
            } else {
                setOcrStatus(activeOcrImage.crop ? 'Receipt area selected — scan for clearer text' : 'Image Ready for Scan', 'blue');
            }
        }

        function useFullOcrPhoto() {
            if (!activeOcrImage) return;
            activeOcrImage.crop = null;
            ocrCropStart = null;
            ocrCropDraft = null;
            document.getElementById('ocrPreviewContainer').classList.remove('ocr-crop-mode');
            document.getElementById('ocrCropOverlay').classList.add('hidden');
            document.getElementById('ocrCropSelection').classList.add('hidden');
            document.getElementById('ocrBoxOverlays').innerHTML = '';
            clearOcrFields();
            document.getElementById('ocrScanBtn').disabled = false;
            document.getElementById('ocrGeminiBtn').disabled = false;
            setOcrStatus('Using full photo — scan and review the result', 'blue');
            updateOcrCropControls();
        }

        function updateOcrCropControls() {
            const cropMode = document.getElementById('ocrPreviewContainer').classList.contains('ocr-crop-mode');
            const cropButton = document.getElementById('ocrCropModeBtn');
            const hint = document.getElementById('ocrCropHint');
            cropButton.innerHTML = cropMode
                ? '<i class="fa-solid fa-crop-simple mr-1"></i> Drag around receipt'
                : activeOcrImage?.crop
                    ? '<i class="fa-solid fa-crop-simple mr-1"></i> Adjust receipt area'
                    : '<i class="fa-solid fa-crop-simple mr-1"></i> Select receipt area';
            hint.textContent = cropMode
                ? 'Drag from one corner of the printed receipt to the opposite corner.'
                : activeOcrImage?.crop
                    ? 'Scanning only the selected receipt area. Select again to adjust.'
                    : 'For small receipts, select the printed area to improve OCR accuracy.';
        }

        function ocrImagePoint(event) {
            const image = document.getElementById('ocrImgPreview');
            const bounds = image.getBoundingClientRect();
            if (!bounds.width || !bounds.height
                || event.clientX < bounds.left || event.clientX > bounds.right
                || event.clientY < bounds.top || event.clientY > bounds.bottom) {
                return null;
            }
            return {
                x: (event.clientX - bounds.left) * image.naturalWidth / bounds.width,
                y: (event.clientY - bounds.top) * image.naturalHeight / bounds.height
            };
        }

        function renderOcrCropSelection(rect) {
            const image = document.getElementById('ocrImgPreview');
            const overlay = document.getElementById('ocrCropOverlay');
            const selection = document.getElementById('ocrCropSelection');
            const bounds = image.getBoundingClientRect();
            const overlayBounds = overlay.getBoundingClientRect();
            if (!rect || !bounds.width || !bounds.height || !overlayBounds.width || !overlayBounds.height) {
                selection.classList.add('hidden');
                return;
            }

            const left = bounds.left - overlayBounds.left + rect.x * bounds.width / image.naturalWidth;
            const top = bounds.top - overlayBounds.top + rect.y * bounds.height / image.naturalHeight;
            selection.style.left = `${left}px`;
            selection.style.top = `${top}px`;
            selection.style.width = `${rect.width * bounds.width / image.naturalWidth}px`;
            selection.style.height = `${rect.height * bounds.height / image.naturalHeight}px`;
            selection.classList.remove('hidden');
        }

        function startOcrCrop(event) {
            if (!activeOcrImage || !document.getElementById('ocrPreviewContainer').classList.contains('ocr-crop-mode')) return;
            const point = ocrImagePoint(event);
            if (!point) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            ocrCropStart = point;
            ocrCropDraft = { x: point.x, y: point.y, width: 0, height: 0 };
            document.getElementById('ocrCropOverlay').classList.remove('hidden');
            renderOcrCropSelection(ocrCropDraft);
        }

        function moveOcrCrop(event) {
            if (!ocrCropStart) return;
            const point = ocrImagePoint(event);
            if (!point) return;
            ocrCropDraft = {
                x: Math.min(ocrCropStart.x, point.x),
                y: Math.min(ocrCropStart.y, point.y),
                width: Math.abs(point.x - ocrCropStart.x),
                height: Math.abs(point.y - ocrCropStart.y)
            };
            renderOcrCropSelection(ocrCropDraft);
        }

        function finishOcrCrop(event) {
            if (!ocrCropStart || !activeOcrImage) return;
            moveOcrCrop(event);
            ocrCropStart = null;
            if (!ocrCropDraft || ocrCropDraft.width < 40 || ocrCropDraft.height < 40) {
                ocrCropDraft = null;
                renderOcrCropSelection(activeOcrImage.crop);
                setOcrStatus('Crop too small — drag around the receipt text', 'rose');
                return;
            }

            activeOcrImage.crop = ocrCropDraft;
            ocrCropDraft = null;
            document.getElementById('ocrPreviewContainer').classList.remove('ocr-crop-mode');
            document.getElementById('ocrCropOverlay').classList.remove('hidden');
            clearOcrFields();
            document.getElementById('ocrScanBtn').disabled = false;
            document.getElementById('ocrGeminiBtn').disabled = false;
            renderOcrCropSelection(activeOcrImage.crop);
            setOcrStatus('Receipt area selected — scan for clearer text', 'blue');
            updateOcrCropControls();
        }

        function cancelOcrCrop(event) {
            if (!ocrCropStart) return;
            ocrCropStart = null;
            ocrCropDraft = null;
            renderOcrCropSelection(activeOcrImage?.crop);
        }

        function prepareImageForOcr(dataUrl, crop = null) {
            return new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => {
                    const source = crop || { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
                    const longestSide = Math.max(source.width, source.height);
                    const scale = Math.min(2, 2800 / longestSide);
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(source.width * scale));
                    canvas.height = Math.max(1, Math.round(source.height * scale));
                    const context = canvas.getContext('2d', { willReadFrequently: true });
                    if (!context) {
                        reject(new Error('Could not enhance the receipt image for scanning.'));
                        return;
                    }

                    context.fillStyle = '#ffffff';
                    context.fillRect(0, 0, canvas.width, canvas.height);
                    context.imageSmoothingQuality = 'high';
                    context.drawImage(
                        image,
                        source.x, source.y, source.width, source.height,
                        0, 0, canvas.width, canvas.height
                    );

                    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                    const pixels = imageData.data;
                    for (let index = 0; index < pixels.length; index += 4) {
                        const grayscale = pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
                        const enhanced = Math.max(0, Math.min(255, (grayscale - 128) * 1.25 + 128));
                        pixels[index] = enhanced;
                        pixels[index + 1] = enhanced;
                        pixels[index + 2] = enhanced;
                    }
                    context.putImageData(imageData, 0, 0);
                    resolve({
                        src: canvas.toDataURL('image/png'),
                        scaleX: canvas.width / source.width,
                        scaleY: canvas.height / source.height,
                        crop: source
                    });
                };
                image.onerror = () => reject(new Error('Could not enhance the receipt image for scanning.'));
                image.src = dataUrl;
            });
        }

        function renderOcrWordBoxes(words, preparedImage) {
            const image = document.getElementById('ocrImgPreview');
            const overlay = document.getElementById('ocrBoxOverlays');
            if (!image.naturalWidth || !image.naturalHeight) return;

            const imageRect = image.getBoundingClientRect();
            const overlayRect = overlay.getBoundingClientRect();
            if (!overlayRect.width || !overlayRect.height) return;
            words.filter(word => word.text.trim() && word.confidence >= 45 && word.bbox).forEach(word => {
                const box = document.createElement('div');
                box.className = 'ocr-box';
                const x = preparedImage.crop.x + word.bbox.x0 / preparedImage.scaleX;
                const y = preparedImage.crop.y + word.bbox.y0 / preparedImage.scaleY;
                const width = (word.bbox.x1 - word.bbox.x0) / preparedImage.scaleX;
                const height = (word.bbox.y1 - word.bbox.y0) / preparedImage.scaleY;
                box.style.left = `${((imageRect.left - overlayRect.left + x * imageRect.width / image.naturalWidth) / overlayRect.width) * 100}%`;
                box.style.top = `${((imageRect.top - overlayRect.top + y * imageRect.height / image.naturalHeight) / overlayRect.height) * 100}%`;
                box.style.width = `${(width * imageRect.width / image.naturalWidth / overlayRect.width) * 100}%`;
                box.style.height = `${(height * imageRect.height / image.naturalHeight / overlayRect.height) * 100}%`;
                overlay.appendChild(box);
            });
        }

        function parseOcrDate(text) {
            const isoDate = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
            if (isoDate) {
                return `${isoDate[1]}-${isoDate[2].padStart(2, '0')}-${isoDate[3].padStart(2, '0')}`;
            }

            const localDate = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})\b/);
            if (localDate) {
                const year = localDate[3].length === 2 ? `20${localDate[3]}` : localDate[3];
                return `${year}-${localDate[1].padStart(2, '0')}-${localDate[2].padStart(2, '0')}`;
            }

            const namedDate = text.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+20\d{2}\b/i)
                || text.match(/\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[,]?\s+20\d{2}\b/i);
            if (!namedDate) return '';

            const parsedDate = new Date(namedDate[0].replace(/(\d)(st|nd|rd|th)\b/i, '$1'));
            if (Number.isNaN(parsedDate.getTime())) return '';
            return `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}`;
        }

        function parseReceiptText(text) {
            const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
            const amountPattern = /(?:₱|PHP|USD|\$|\bP\s*)\s*-?\s*\d[\d,]*(?:\.\d{1,2})?|-?\d[\d,]*\.\d{2}/gi;
            const amountLines = lines.map(line => ({
                line,
                amounts: [...line.matchAll(amountPattern)].map(match => Number(match[0].replace(/[^\d.-]/g, '')))
                    .filter(amount => Number.isFinite(amount) && amount > 0)
            })).filter(entry => entry.amounts.length);
            const totalLine = amountLines.filter(entry => /\b(grand\s*total|total|amount\s*due|balance\s*due|net\s*amount)\b/i.test(entry.line) && !/\bsub\s*total\b/i.test(entry.line));
            const amount = (totalLine.length ? totalLine[totalLine.length - 1] : amountLines[amountLines.length - 1])?.amounts.slice(-1)[0] ?? '';

            const vendor = lines.map(line => line.replace(/\b(?:official\s+)?receipt\b|\binvoice\b/ig, '').trim())
                .find(line => /[a-z]/i.test(line)
                    && !/\b(tax|date|tel|phone|cashier|terminal|transaction|order|customer|payment|total|vat|tin)\b/i.test(line)
                    && !/\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(line)) || '';
            const receiptText = lines.join('\n');

            return {
                vendor,
                date: parseOcrDate(receiptText),
                amount,
                rawText: receiptText
            };
        }

        function prepareReceiptImage(dataUrl) {
            return new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => {
                    const maxDimension = 2000;
                    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
                    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
                    const context = canvas.getContext('2d');
                    if (!context) {
                        reject(new Error('Could not prepare the receipt image for storage.'));
                        return;
                    }

                    context.fillStyle = '#ffffff';
                    context.fillRect(0, 0, canvas.width, canvas.height);
                    context.drawImage(image, 0, 0, canvas.width, canvas.height);

                    const maxBytes = 3 * 1024 * 1024;
                    let quality = 0.84;
                    let compressedImage = canvas.toDataURL('image/jpeg', quality);
                    while (Math.ceil((compressedImage.length - compressedImage.indexOf(',') - 1) * 0.75) > maxBytes && quality > 0.5) {
                        quality = Math.max(0.5, quality - 0.08);
                        compressedImage = canvas.toDataURL('image/jpeg', quality);
                    }
                    if (Math.ceil((compressedImage.length - compressedImage.indexOf(',') - 1) * 0.75) > maxBytes) {
                        reject(new Error('This receipt image is too large to store. Choose a smaller image.'));
                        return;
                    }
                    resolve(compressedImage);
                };
                image.onerror = () => reject(new Error('Could not prepare the receipt image for storage.'));
                image.src = dataUrl;
            });
        }

        function prepareImageForAi(dataUrl, crop = null) {
            return new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => {
                    const source = crop || { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
                    const scale = Math.min(2, 1800 / Math.max(source.width, source.height));
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(source.width * scale));
                    canvas.height = Math.max(1, Math.round(source.height * scale));
                    const context = canvas.getContext('2d');
                    if (!context) {
                        reject(new Error('Could not prepare the receipt photo for Gemini.'));
                        return;
                    }

                    context.fillStyle = '#ffffff';
                    context.fillRect(0, 0, canvas.width, canvas.height);
                    context.imageSmoothingQuality = 'high';
                    context.drawImage(
                        image,
                        source.x, source.y, source.width, source.height,
                        0, 0, canvas.width, canvas.height
                    );

                    const maxBytes = 3 * 1024 * 1024;
                    let quality = 0.88;
                    let preparedImage = canvas.toDataURL('image/jpeg', quality);
                    while (Math.ceil((preparedImage.length - preparedImage.indexOf(',') - 1) * 0.75) > maxBytes && quality > 0.5) {
                        quality = Math.max(0.5, quality - 0.08);
                        preparedImage = canvas.toDataURL('image/jpeg', quality);
                    }
                    if (Math.ceil((preparedImage.length - preparedImage.indexOf(',') - 1) * 0.75) > maxBytes) {
                        reject(new Error('This receipt photo is too large to send for AI analysis. Select a smaller area or image.'));
                        return;
                    }
                    resolve(preparedImage);
                };
                image.onerror = () => reject(new Error('Could not prepare the receipt photo for Gemini.'));
                image.src = dataUrl;
            });
        }

        function getLocalOcrWorker() {
            if (!window.Tesseract) {
                throw new Error('The local OCR engine did not load. Check that the bundled OCR files are present.');
            }
            if (!localOcrWorkerPromise) {
                localOcrWorkerPromise = window.Tesseract.createWorker('eng', 1, {
                    workerPath: new URL('vendor/tesseract/worker.min.js', document.baseURI).href,
                    corePath: new URL('vendor/tesseract-core/', document.baseURI).href,
                    langPath: new URL('vendor/tessdata/', document.baseURI).href,
                    gzip: true,
                    logger: progress => {
                        if (typeof ocrProgressHandler === 'function') ocrProgressHandler(progress);
                    }
                }).catch(error => {
                    localOcrWorkerPromise = null;
                    throw error;
                });
            }
            return localOcrWorkerPromise;
        }

        async function recognizeReceiptLocally(imageToScan, badge) {
            const preparedImage = await prepareImageForOcr(imageToScan.imgSrc, imageToScan.crop);
            if (activeOcrImage !== imageToScan) return false;

            ocrProgressHandler = progress => {
                if (progress.status === 'recognizing text' && Number.isFinite(progress.progress)) {
                    setOcrStatus(`Reading receipt locally... ${Math.round(progress.progress * 100)}%`, 'amber');
                    badge.classList.add('animate-pulse');
                } else if (progress.status === 'loading language traineddata') {
                    setOcrStatus('Loading bundled English OCR data...', 'amber');
                }
            };
            try {
                const worker = await getLocalOcrWorker();
                if (activeOcrImage !== imageToScan) return false;
                const recognition = await worker.recognize(preparedImage.src);
                if (activeOcrImage !== imageToScan) return false;

                const result = parseReceiptText(recognition.data.text);
                renderOcrWordBoxes(recognition.data.words || [], preparedImage);
                document.getElementById('ocrVendor').value = result.vendor;
                document.getElementById('ocrDate').value = result.date;
                document.getElementById('ocrAmount').value = result.amount;
                document.getElementById('ocrSubCat').value = '';
                ocrRawText = result.rawText;
                document.getElementById('ocrCorrectedText').value = result.rawText;
                ocrTextImage = imageToScan;
                document.getElementById('ocrPostBtn').disabled = !ocrRawText;
                return Boolean(ocrRawText);
            } finally {
                ocrProgressHandler = null;
            }
        }

        function setOcrActionsDisabled(disabled) {
            const unavailable = !activeOcrImage
                || document.getElementById('ocrPreviewContainer').classList.contains('ocr-crop-mode');
            document.getElementById('ocrScanBtn').disabled = disabled || unavailable;
            document.getElementById('ocrGeminiBtn').disabled = disabled || unavailable;
        }

        async function runOcrScan() {
            const imageToScan = activeOcrImage;
            if (!imageToScan || document.getElementById('ocrPreviewContainer').classList.contains('ocr-crop-mode')) return;

            const badge = document.getElementById('ocrStatusBadge');
            document.getElementById('scanLaser').classList.remove('hidden');
            document.getElementById('ocrBoxOverlays').innerHTML = '';
            document.getElementById('ocrCropOverlay').classList.add('hidden');
            document.getElementById('ocrPostBtn').disabled = true;
            setOcrActionsDisabled(true);
            setOcrStatus('Preparing local receipt scan...', 'amber');
            badge.classList.add('animate-pulse');

            try {
                const foundText = await recognizeReceiptLocally(imageToScan, badge);
                if (activeOcrImage !== imageToScan) return;
                setOcrStatus(
                    foundText ? 'Local OCR ready — review fields and complete the subcategory' : 'No text found — try a clearer photo',
                    foundText ? 'emerald' : 'rose'
                );
            } catch (error) {
                if (activeOcrImage !== imageToScan) return;
                setOcrStatus('Local OCR could not start', 'rose');
                notifyUser(error.message);
            } finally {
                badge.classList.remove('animate-pulse');
                document.getElementById('scanLaser').classList.add('hidden');
                setOcrActionsDisabled(false);
            }
        }

        async function analyzeOcrWithGemini() {
            const imageToScan = activeOcrImage;
            if (!imageToScan || document.getElementById('ocrPreviewContainer').classList.contains('ocr-crop-mode')) return;

            const badge = document.getElementById('ocrStatusBadge');
            let localOcrError = '';
            document.getElementById('scanLaser').classList.remove('hidden');
            document.getElementById('ocrPostBtn').disabled = true;
            setOcrActionsDisabled(true);
            badge.classList.add('animate-pulse');

            try {
                if (ocrTextImage !== imageToScan) {
                    setOcrStatus('Reading receipt locally before online analysis...', 'amber');
                    try {
                        await recognizeReceiptLocally(imageToScan, badge);
                    } catch (error) {
                        localOcrError = error.message;
                    }
                }
                if (activeOcrImage !== imageToScan) return;
                setOcrStatus('Sending selected photo area to Gemini...', 'amber');
                const aiImage = await prepareImageForAi(imageToScan.imgSrc, imageToScan.crop);
                if (activeOcrImage !== imageToScan) return;
                const response = await apiRequest('receipt_ai', {
                    method: 'POST',
                    body: { image: aiImage }
                });
                if (activeOcrImage !== imageToScan) return;
                const analysis = response.analysis;
                if (analysis.vendor) document.getElementById('ocrVendor').value = analysis.vendor;
                if (analysis.date) document.getElementById('ocrDate').value = analysis.date;
                if (analysis.amount !== '' && Number(analysis.amount) > 0) {
                    document.getElementById('ocrAmount').value = analysis.amount;
                }
                document.getElementById('ocrSubCat').value = analysis.subCategory || '';
                document.getElementById('ocrCorrectedText').value = analysis.correctedText || '';
                setOcrLineItems(Array.isArray(analysis.lineItems) ? analysis.lineItems : []);
                const hasRequiredFields = document.getElementById('ocrVendor').value.trim()
                    && document.getElementById('ocrDate').value
                    && Number(document.getElementById('ocrAmount').value) > 0;
                document.getElementById('ocrPostBtn').disabled = !hasRequiredFields;
                setOcrStatus(
                    hasRequiredFields ? 'Gemini suggestions ready — review before posting' : 'Gemini analysis ready — complete missing fields',
                    'amber'
                );
            } catch (error) {
                if (activeOcrImage !== imageToScan) return;
                const hasLocalText = ocrRawText.trim();
                if (hasLocalText) {
                    document.getElementById('ocrPostBtn').disabled = false;
                    setOcrStatus('Gemini unavailable — local OCR is ready', 'amber');
                } else {
                    setOcrStatus('Gemini unavailable — try local OCR', 'rose');
                }
                notifyUser(`${error.message}${localOcrError ? ` Local OCR note: ${localOcrError}` : ''}`);
            } finally {
                badge.classList.remove('animate-pulse');
                document.getElementById('scanLaser').classList.add('hidden');
                setOcrActionsDisabled(false);
            }
        }

        async function postOcrToLedger() {
            const imageToPost = activeOcrImage;
            if(!imageToPost) return;

            const vendor = document.getElementById('ocrVendor').value.trim();
            const date = document.getElementById('ocrDate').value;
            const amount = Number(document.getElementById('ocrAmount').value);
            const subCategory = document.getElementById('ocrSubCat').value.trim();
            if (!vendor || !date || !Number.isFinite(amount) || amount <= 0) {
                notifyUser('Review the extracted fields and enter a vendor, date, and valid amount before posting.');
                return;
            }
            if (!subCategory || subCategory.length > 100) {
                notifyUser('Enter a subcategory of 100 characters or fewer before posting.');
                return;
            }
            const enteredItems = collectOcrLineItems();
            const invalidItem = enteredItems.some(item => {
                const hasValues = item.description || item.quantity !== null || item.unit || item.unitPrice !== null || item.lineTotal !== null;
                return hasValues && (!item.description || item.description.length > 200 || item.unit.length > 32
                    || (item.quantity !== null && (!Number.isFinite(item.quantity) || item.quantity <= 0))
                    || (item.unitPrice !== null && (!Number.isFinite(item.unitPrice) || item.unitPrice < 0))
                    || (item.lineTotal !== null && (!Number.isFinite(item.lineTotal) || item.lineTotal < 0)));
            });
            if (invalidItem) {
                notifyUser('Complete each item description and check its quantity and prices before posting.');
                return;
            }
            const lineItems = enteredItems.filter(item => item.description);

            const postButton = document.getElementById('ocrPostBtn');
            postButton.disabled = true;
            try {
                const receiptImage = await prepareReceiptImage(imageToPost.imgSrc);
                if (activeOcrImage !== imageToPost) return;
                pendingOcrAttachment = {
                    rawOcrText: ocrRawText,
                    correctedOcrText: document.getElementById('ocrCorrectedText').value,
                    lineItems,
                    receiptImage
                };
            } catch (error) {
                notifyUser(error.message);
                return;
            } finally {
                postButton.disabled = !activeOcrImage;
            }

            switchTab('ledgerTab');

            document.getElementById('entryDate').value = date;
            document.getElementById('entryCategory').value = 'Expense';
            document.getElementById('entrySubCategory').value = subCategory;
            document.getElementById('entryDescription').value = vendor;
            document.getElementById('entryAmount').value = amount;
            document.getElementById('entryMethod').value = "Cash / Bank Transfer";

            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

