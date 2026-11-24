/**

 * Pure Minimalist Comp-Off Tracker

 * Target: Exactly 10:00:00 extra hours = 1 day of Compensatory Off.

 * Tabular Log Layout | Office Hours with Seconds & Inline Save | Full/Half Day OD & Leave

 */



(function () {

  'use strict';



  const STORAGE_KEY = 'compoff_pure_minimal_v1';

  const TARGET_EXTRA_SECONDS = 10 * 3600; // Strictly 10:00:00 (36,000 seconds)



  const DEFAULT_HOLIDAYS = [

    { date: '2026-12-25', name: 'Christmas' }

  ];



  // Empty records to start afresh

  const DEMO_RECORDS = [];



  // ==========================================================================

  // TIME UTILITIES

  // ==========================================================================

  const TimeEngine = {

    timeStrToSec(str) {

      if (!str) return null;

      const parts = str.trim().split(':').map(Number);

      if (parts.some(isNaN)) return null;

      return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);

    },



    secToTimeStr(totalSec, includeSeconds = true) {

      if (totalSec === null || isNaN(totalSec)) return '--:--:--';

      const abs = Math.abs(Math.round(totalSec));

      const h = Math.floor(abs / 3600);

      const m = Math.floor((abs % 3600) / 60);

      const s = abs % 60;

      const pad = (n) => String(n).padStart(2, '0');

      return includeSeconds ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}`;

    },



    getAnchorDate() {

      return new Date();

    },



    formatDateISO(d) {

      const y = d.getFullYear();

      const m = String(d.getMonth() + 1).padStart(2, '0');

      const day = String(d.getDate()).padStart(2, '0');

      return `${y}-${m}-${day}`;

    },



    isSecondSaturday(y, m, d) {

      const dt = new Date(y, m, d);

      if (dt.getDay() !== 6) return false;

      return d >= 8 && d <= 14;

    },



    isSunday(y, m, d) {

      return new Date(y, m, d).getDay() === 0;

    },



    // Identify Forenoon (FN) or Afternoon (AN) based on punch times

    identifySession(inTime, outTime) {

      const inSec = this.timeStrToSec(inTime);

      if (inSec === null) return 'FN';

      // If punch in is 12:30 PM (45,000s) or later, it is Afternoon session

      if (inSec >= 45000) {

        return 'AN';

      }

      return 'FN';

    },



    calculateRecord(record, shiftStart = '10:15:00', shiftEnd = '17:15:00') {

      const stdDurationSec = 7 * 3600; // 7h standard shift



      // 1. Full Day On Duty (OD)

      if (record.status === 'OD' && (!record.inTime || !record.outTime || record.inTime === '--' || record.outTime === '--')) {

        return { workedSec: stdDurationSec, totalDaySec: stdDurationSec, netExtraSec: 0, netExtraStr: '+00:00:00' };

      }



      // 2. Full Day Leave (CL) or Holiday with no punch

      if (['PH', 'CL'].includes(record.status) && (!record.inTime || !record.outTime || record.inTime === '--' || record.outTime === '--')) {

        return { workedSec: 0, totalDaySec: 0, netExtraSec: 0, netExtraStr: '00:00:00' };

      }



      // 3. Punch Entries: Require BOTH inTime and outTime to calculate extra time

      // If only one punch (in or out) is recorded, it is excluded from extra time calculation (yields 0)

      if (record.inTime && record.outTime && record.inTime !== '--' && record.outTime !== '--') {

        const inSec = this.timeStrToSec(record.inTime);

        const outSec = this.timeStrToSec(record.outTime);

        if (inSec === null || outSec === null) {

          return { workedSec: 0, totalDaySec: 0, netExtraSec: 0, netExtraStr: '00:00:00' };

        }



        const punchedSec = outSec >= inSec ? outSec - inSec : (86400 - inSec) + outSec;

        const [y, m, d] = record.date.split('-').map(Number);

        const isHol = this.isSunday(y, m - 1, d) || this.isSecondSaturday(y, m - 1, d) || record.status === 'PH' || !!record.isHoliday;



        const totalDaySec = punchedSec;



        // Rule: Deficit is never considered. Only positive overtime hours beyond 7h accumulate toward comp-off.

        let netExtraSec = 0;

        if (isHol) {

          netExtraSec = totalDaySec;

        } else {

          netExtraSec = Math.max(0, totalDaySec - stdDurationSec);

        }



        return {

          workedSec: punchedSec,

          totalDaySec: totalDaySec,

          netExtraSec,

          netExtraStr: `+${this.secToTimeStr(netExtraSec)}`

        };

      }



      return { workedSec: 0, totalDaySec: 0, netExtraSec: 0, netExtraStr: '00:00:00' };

    }

  };



  // ==========================================================================

  // STORAGE

  // ==========================================================================

  const Storage = {

    load() {

      try {

        let raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          // Backward-compatibility: migrate from temporary key if present
          const altRaw = localStorage.getItem('compoff_v2_spark_data');
          if (altRaw) {
            raw = altRaw;
            localStorage.setItem(STORAGE_KEY, altRaw);
          }
        }

        if (raw) {

          const parsed = JSON.parse(raw);

          if (parsed) {

            // One-time clear of old demo records to start afresh

            if (!parsed.clearedInitialDemo) {

              parsed.records = [];

              parsed.clearedInitialDemo = true;

            }



            // Prune any records outside the current month

            const now = new Date();

            const curY = now.getFullYear();

            const curM = now.getMonth();

            if (parsed.records && parsed.records.length > 0) {

              parsed.records = parsed.records.filter((r) => {

                if (!r.date) return false;

                const [y, m] = r.date.split('-').map(Number);

                return y === curY && (m - 1) === curM;

              });

            }



            // Keep only Christmas in holidays (all others have passed)

            if (!parsed.hasOnlyChristmasHoliday) {

              parsed.holidays = [{ date: '2026-12-25', name: 'Christmas' }];

              parsed.hasOnlyChristmasHoliday = true;

            }



            delete parsed.deductDeficit;



            this.save(parsed);

            return parsed;

          }

        }

      } catch (e) {

        console.error(e);

      }

      return null;

    },



    save(data) {

      try {

        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

      } catch (e) {

        console.error(e);

      }

    },



    initDefault(name = '') {

      const data = {

        name: name,

        shiftStart: '10:15:00',

        shiftEnd: '17:15:00',

        holidays: [...DEFAULT_HOLIDAYS],

        records: [],

        clearedInitialDemo: true,

        hasOnlyChristmasHoliday: true,

        fontSize: 'default'

      };

      this.save(data);

      return data;

    }

  };



  // ==========================================================================

  // SPARK ATTENDANCE PARSER (EXCEL, CSV, TABLE TEXT & IMAGE OCR)

  // ==========================================================================

  const SparkParser = {

    // Parse Date string into ISO YYYY-MM-DD

    parseDateToISO(str) {

      if (!str) return null;

      str = String(str).trim();

      // Matches DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY or [DD/MM/YYYY] or with |

      const m1 = str.match(/(?:\[|\()?(\d{1,2})[\/\-\.\|](\d{1,2})[\/\-\.\|](\d{4})(?:\]|\))?/);

      if (m1) {

        const d = m1[1].padStart(2, '0');

        const m = m1[2].padStart(2, '0');

        const y = m1[3];

        if (Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31) {

          return `${y}-${m}-${d}`;

        }

      }

      // Matches YYYY-MM-DD

      const m2 = str.match(/\b(\d{4})[\/\-\.\|](\d{1,2})[\/\-\.\|](\d{1,2})\b/);

      if (m2) {

        const y = m2[1];

        const m = m2[2].padStart(2, '0');

        const d = m2[3].padStart(2, '0');

        if (Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31) {

          return `${y}-${m}-${d}`;

        }

      }

      return null;

    },



    // Clean and normalize time string HH:MM:SS

    cleanTime(str) {

      if (!str) return '';

      str = String(str).trim();

      // Allow colons, dots, dashes, or semicolons in OCR time strings

      const m = str.match(/\b([01]?\d|2[0-3])[\:\.\;\-]([0-5]\d)(?:[\:\.\;\-]([0-5]\d))?\b/);

      if (m) {

        const h = m[1].padStart(2, '0');

        const min = m[2].padStart(2, '0');

        const s = m[3] ? m[3].padStart(2, '0') : '00';

        return `${h}:${min}:${s}`;

      }

      return '';

    },



    // Parse plain text / clipboard / TSV / CSV rows

    parseText(text) {

      if (!text) return [];

      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

      const rows = [];



      // Current month constraint: "also dont acceprt any date other than current month."

      const curAnchor = TimeEngine.getAnchorDate();

      const curYear = curAnchor.getFullYear();

      const curMonth = curAnchor.getMonth() + 1;



      for (const line of lines) {

        // Strictly ignore report generation metadata and header lines

        if (

          /generated by|report is generated|report.*generation/i.test(line) ||

          /with PEN\b/i.test(line) ||

          /SPARK database/i.test(line) ||

          /attendance report for the month/i.test(line) ||

          /regional design office/i.test(line) ||

          /designation\s*:/i.test(line) ||

          /name\s*:/i.test(line) ||

          /current grace time balance/i.test(line) ||

          /generate attendance report/i.test(line) ||

          (/date/i.test(line) && (/in\s*time|punch/i.test(line) || /status/i.test(line) || /sl\.?\s*no/i.test(line)))

        ) {

          continue;

        }



        // Check if line contains a date DD/MM/YYYY

        const dateISO = this.parseDateToISO(line);

        if (!dateISO) continue;



        // Filter strictly within current month

        const [rY, rM] = dateISO.split('-').map(Number);

        if (rY !== curYear || rM !== curMonth) {

          continue;

        }



        // Extract all times in the line (flexible with colons, dots, semicolons)

        const times = [];

        const timeMatches = line.matchAll(/\b([01]?\d|2[0-3])[\:\.\;\-]([0-5]\d)(?:[\:\.\;\-]([0-5]\d))?\b/g);

        for (const tm of timeMatches) {

          const t = this.cleanTime(tm[0]);

          if (t) times.push(t);

        }



        // Determine Status

        let status = 'P';

        if (/\b(PH|Public\s*Holiday|Holiday)\b/i.test(line)) {

          status = 'PH';

        } else if (/\bOD\b/i.test(line)) {

          status = 'OD';

        } else if (/\b(CL|Leave)\b/i.test(line)) {

          status = 'CL';

        }



        const inTime = times[0] || '';

        const outTime = times[1] || '';



        rows.push({

          date: dateISO,

          inTime,

          outTime,

          status,

          rawLine: line

        });

      }

      return rows;

    },



    // Parse Excel workbook or CSV using SheetJS (XLSX)

    parseSheet(arrayBufferOrBinary) {

      if (typeof XLSX === 'undefined') {

        throw new Error('SheetJS (XLSX) library is not loaded');

      }

      const workbook = XLSX.read(arrayBufferOrBinary, { type: 'binary', cellDates: true });

      const firstSheetName = workbook.SheetNames[0];

      const worksheet = workbook.Sheets[firstSheetName];

      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, dateNF: 'dd/mm/yyyy' });



      if (!jsonData || jsonData.length === 0) return [];



      let colDate = -1;

      let colIn = -1;

      let colOut = -1;

      let colStatus = -1;

      let dataStartRow = 0;



      for (let r = 0; r < Math.min(jsonData.length, 10); r++) {

        const row = jsonData[r];

        if (!Array.isArray(row)) continue;

        for (let c = 0; c < row.length; c++) {

          const val = String(row[c] || '').toLowerCase().trim();

          if (val === 'date' || val.includes('date')) colDate = c;

          if (val.includes('in time') || val.includes('in_time') || val.includes('punch in') || val === 'in') colIn = c;

          if (val.includes('out time') || val.includes('out_time') || val.includes('punch out') || val === 'out') colOut = c;

          if (val === 'status') colStatus = c;

        }

        if (colDate !== -1 && (colIn !== -1 || colOut !== -1 || colStatus !== -1)) {

          dataStartRow = r + 1;

          break;

        }

      }



      if (colDate === -1) {

        colDate = 0;

        colIn = 1;

        colOut = 3;

        colStatus = 5;

        dataStartRow = 1;

      }



      const rows = [];

      for (let r = dataStartRow; r < jsonData.length; r++) {

        const row = jsonData[r];

        if (!Array.isArray(row) || row.length === 0) continue;



        const rawDate = row[colDate];

        const dateISO = this.parseDateToISO(rawDate);

        if (!dateISO) continue;



        // Current month constraint

        const [rY, rM] = dateISO.split('-').map(Number);

        const curAnchor = TimeEngine.getAnchorDate();

        if (rY !== curAnchor.getFullYear() || rM !== (curAnchor.getMonth() + 1)) {

          continue;

        }



        const inTime = this.cleanTime(row[colIn]);

        const outTime = this.cleanTime(row[colOut]);

        const statusVal = String(row[colStatus] || '').trim().toUpperCase();



        let status = 'P';

        if (statusVal.includes('PH') || statusVal.includes('HOLIDAY')) {

          status = 'PH';

        } else if (statusVal.includes('OD')) {

          status = 'OD';

        } else if (statusVal.includes('CL') || statusVal.includes('LEAVE')) {

          status = 'CL';

        }



        rows.push({

          date: dateISO,

          inTime,

          outTime,

          status

        });

      }

      return rows;

    },



    // Parse PDF report using PDF.js

    async parsePdf(arrayBuffer) {

      if (typeof pdfjsLib === 'undefined') {

        throw new Error('PDF.js library is not loaded');

      }

      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });

      const pdf = await loadingTask.promise;

      let textLines = [];

      for (let i = 1; i <= pdf.numPages; i++) {

        const page = await pdf.getPage(i);

        const content = await page.getTextContent();

        // Group items by vertical Y coordinate

        const rowMap = new Map();

        content.items.forEach((item) => {

          const y = Math.round(item.transform[5]);

          if (!rowMap.has(y)) rowMap.set(y, []);

          rowMap.get(y).push({ x: item.transform[4], str: item.str });

        });

        const sortedYs = Array.from(rowMap.keys()).sort((a, b) => b - a);

        sortedYs.forEach((y) => {

          const rowItems = rowMap.get(y).sort((a, b) => a.x - b.x);

          const lineStr = rowItems.map((it) => it.str).join(' ').trim();

          if (lineStr) textLines.push(lineStr);

        });

      }

      return this.parseText(textLines.join('\n'));

    },



    // Parse image with Tesseract.js

    async parseImage(fileOrDataUrl, progressCb) {

      if (typeof Tesseract === 'undefined') {

        throw new Error('Tesseract OCR library is not available');

      }



      let processedUrl = fileOrDataUrl;

      try {

        processedUrl = await this.preprocessImage(fileOrDataUrl);

      } catch (e) {

        console.warn('Canvas pre-processing fallback to raw image:', e);

      }



      const worker = await Tesseract.createWorker('eng', 1, {

        logger: (m) => {

          if (progressCb && m.status === 'recognizing text' && m.progress) {

            progressCb(Math.round(m.progress * 100));

          }

        }

      });



      const ret = await worker.recognize(processedUrl);

      await worker.terminate();

      return this.parseText(ret.data.text);

    },



    // HTML5 canvas pre-processor for OCR

    preprocessImage(src) {

      return new Promise((resolve, reject) => {

        const img = new Image();

        img.crossOrigin = 'anonymous';

        img.onload = () => {

          const canvas = document.createElement('canvas');

          const ctx = canvas.getContext('2d');

          

          let cropX = 0;

          let cropY = 0;

          let cropW = img.width;

          let cropH = img.height;



          // If this is a wide SPARK portal desktop screenshot (has calendar on left)

          // focus on table region

          if (img.width >= 680 && img.width / img.height > 1.3) {

            cropX = Math.floor(img.width * 0.16);

            cropY = Math.floor(img.height * 0.12);

            cropW = Math.floor(img.width * 0.82);

            cropH = Math.floor(img.height * 0.72);

          }



          const scale = (cropW < 1000) ? 2.5 : 2.0;

          canvas.width = Math.floor(cropW * scale);

          canvas.height = Math.floor(cropH * scale);



          ctx.imageSmoothingEnabled = true;

          ctx.imageSmoothingQuality = 'high';

          ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);



          // Binarization: clean up striped table background to crisp black & white

          try {

            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            const d = imgData.data;

            for (let i = 0; i < d.length; i += 4) {

              const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

              const v = lum < 140 ? 0 : 255;

              d[i] = v;

              d[i + 1] = v;

              d[i + 2] = v;

            }

            ctx.putImageData(imgData, 0, 0);

          } catch (e) {

            console.warn('Canvas pixel manipulation skipped:', e);

          }



          resolve(canvas.toDataURL('image/png'));

        };

        img.onerror = reject;

        img.src = src;

      });

    }

  };



  // ==========================================================================

  // APP CONTROLLER

  // ==========================================================================

  class AppController {

    constructor() {

      this.data = Storage.load();

      this.editingRecordId = null;



      this.initElements();

      this.bindEvents();



      this.applyFontSize(this.data && this.data.fontSize ? this.data.fontSize : 'default');



      if (!this.data || !this.data.name) {

        this.openOnboarding();

      } else {

        this.renderAll();

      }

    }



    initElements() {

      // Home elements

      this.displayUserName = document.getElementById('displayUserName');

      this.heroAchievedState = document.getElementById('heroAchievedState');

      this.heroCountdownState = document.getElementById('heroCountdownState');

      this.valHours = document.getElementById('valHours');

      this.valMinutes = document.getElementById('valMinutes');

      this.valSeconds = document.getElementById('valSeconds');

      this.valTotalMinutes = document.getElementById('valTotalMinutes');

      this.valDaysRemaining = document.getElementById('valDaysRemaining');

      this.valTargetDesc = document.getElementById('valTargetDesc');

      this.btnSparkleAction = document.getElementById('btnSparkleAction');



      // Navigation

      this.navButtons = document.querySelectorAll('.nav-btn');

      this.viewPanels = document.querySelectorAll('.view-panel');



      // Log elements

      this.btnLogNewPunch = document.getElementById('btnLogNewPunch');

      this.logTableBody = document.getElementById('logTableBody');



      // Settings elements

      this.fontSizeButtons = document.querySelectorAll('.btn-size-pill');

      this.inputSettingsName = document.getElementById('inputSettingsName');

      this.btnSaveName = document.getElementById('btnSaveName');

      this.cfgShiftStart = document.getElementById('cfgShiftStart');

      this.cfgShiftEnd = document.getElementById('cfgShiftEnd');

      this.btnSaveShiftTimes = document.getElementById('btnSaveShiftTimes');

      this.newHolidayDate = document.getElementById('newHolidayDate');

      this.newHolidayName = document.getElementById('newHolidayName');

      this.btnAddHoliday = document.getElementById('btnAddHoliday');

      this.holidaysListContainer = document.getElementById('holidaysListContainer');

      this.btnOpenBulkHolidays = document.getElementById('btnOpenBulkHolidays');



      // Modals

      this.modalNameOnboarding = document.getElementById('modalNameOnboarding');

      this.formOnboarding = document.getElementById('formOnboarding');

      this.onboardingInputName = document.getElementById('onboardingInputName');



      this.modalPunch = document.getElementById('modalPunch');

      this.modalPunchTitle = document.getElementById('modalPunchTitle');

      this.btnClosePunchModal = document.getElementById('btnClosePunchModal');

      this.formPunch = document.getElementById('formPunch');

      this.modalTopRow = document.getElementById('modalTopRow');

      this.colTimeSession = document.getElementById('colTimeSession');

      this.entryRecordId = document.getElementById('entryRecordId');

      this.entryDate = document.getElementById('entryDate');

      this.entryStatus = document.getElementById('entryStatus');

      this.entryDuration = document.getElementById('entryDuration');

      this.punchTimesBlock = document.getElementById('punchTimesBlock');

      this.entryInTime = document.getElementById('entryInTime');

      this.entryOutTime = document.getElementById('entryOutTime');

      this.previewExtra = document.getElementById('previewExtra');

      this.btnDeleteRecord = document.getElementById('btnDeleteRecord');



      this.modalBulkHolidays = document.getElementById('modalBulkHolidays');

      this.btnCloseBulkHolidays = document.getElementById('btnCloseBulkHolidays');

      this.bulkHolidaysText = document.getElementById('bulkHolidaysText');

      this.btnSaveBulkHolidays = document.getElementById('btnSaveBulkHolidays');



      // SPARK Import Elements

      this.btnSparkImageUpload = document.getElementById('btnSparkImageUpload');

      this.inputSparkFile = document.getElementById('inputSparkFile');

      this.modalSparkImport = document.getElementById('modalSparkImport');

      this.btnCloseSparkImport = document.getElementById('btnCloseSparkImport');

      this.sparkDropZone = document.getElementById('sparkDropZone');

      this.btnBrowseSparkFile = document.getElementById('btnBrowseSparkFile');

      this.btnPasteSparkImage = document.getElementById('btnPasteSparkImage');

      this.btnTogglePasteArea = document.getElementById('btnTogglePasteArea');

      this.sparkPasteBox = document.getElementById('sparkPasteBox');

      this.sparkPasteText = document.getElementById('sparkPasteText');

      this.btnParsePastedText = document.getElementById('btnParsePastedText');

      this.sparkImportStatus = document.getElementById('sparkImportStatus');

      this.sparkStatusText = document.getElementById('sparkStatusText');

      this.sparkPreviewContainer = document.getElementById('sparkPreviewContainer');

      this.sparkSummaryStats = document.getElementById('sparkSummaryStats');

      this.chkSelectAllSpark = document.getElementById('chkSelectAllSpark');

      this.sparkPreviewBody = document.getElementById('sparkPreviewBody');

      this.btnCancelSparkImport = document.getElementById('btnCancelSparkImport');

      this.btnConfirmSparkImport = document.getElementById('btnConfirmSparkImport');

      this.pendingSparkRows = [];



      this.toastNotification = document.getElementById('toastNotification');

    }



    bindEvents() {

      // Navigation

      this.navButtons.forEach((btn) => {

        btn.addEventListener('click', () => {

          this.switchTab(btn.dataset.tab);

        });

      });



      // Onboarding Submit

      this.formOnboarding.addEventListener('submit', (e) => {

        e.preventDefault();

        const enteredName = this.onboardingInputName.value.trim();

        if (!enteredName) return;

        this.data = Storage.initDefault(enteredName);

        this.modalNameOnboarding.classList.remove('open');

        this.renderAll();

        this.showToast(`Welcome, ${enteredName}!`);

      });



      // Quick Punch from Home Add button or Log Add button

      const openPunch = () => {

        const todayStr = TimeEngine.formatDateISO(TimeEngine.getAnchorDate(this.data ? this.data.records : []));

        this.openPunchModal(todayStr, null, false);

      };

      this.btnSparkleAction.addEventListener('click', openPunch);

      this.btnLogNewPunch.addEventListener('click', openPunch);



      // Punch modal live preview & dynamic punch block toggle

      const updatePreview = () => this.updatePunchPreview();

      this.entryDate.addEventListener('change', updatePreview);

      this.entryInTime.addEventListener('input', updatePreview);

      this.entryOutTime.addEventListener('input', updatePreview);

      

      const handleStatusOrDurationChange = () => {

        const status = this.entryStatus.value;

        const duration = this.entryDuration.value;

        

        // Show AN/FN time field only when status is not Present

        if (status === 'P') {

          this.colTimeSession.style.display = 'none';

          this.modalTopRow.className = 'form-row-2col-top';

          this.punchTimesBlock.style.display = 'grid';

        } else {

          this.colTimeSession.style.display = 'flex';

          this.modalTopRow.className = 'form-row-3col';



          // If Full Day OD or Full Day Leave, punch inputs are hidden

          if (duration === 'FULL') {

            this.punchTimesBlock.style.display = 'none';

          } else {

            this.punchTimesBlock.style.display = 'grid';

          }

        }

        updatePreview();

      };



      this.entryStatus.addEventListener('change', handleStatusOrDurationChange);

      this.entryDuration.addEventListener('change', handleStatusOrDurationChange);



      this.formPunch.addEventListener('submit', (e) => {

        e.preventDefault();

        this.savePunchRecord();

      });



      this.btnDeleteRecord.addEventListener('click', () => {

        const dateToDelete = this.entryDate.value;

        if (!dateToDelete) return;

        if (confirm(`Delete attendance entry for ${dateToDelete}?`)) {

          // 1. Remove from records

          if (this.editingRecordId) {

            this.data.records = this.data.records.filter((r) => r.id !== this.editingRecordId);

          }

          this.data.records = this.data.records.filter((r) => r.date !== dateToDelete);



          // 2. Remove from custom holidays if matching date

          this.data.holidays = this.data.holidays.filter((h) => h.date !== dateToDelete);



          // 3. Keep in excludedDates so auto-generator doesn't show it again

          if (!this.data.excludedDates) this.data.excludedDates = [];

          if (!this.data.excludedDates.includes(dateToDelete)) {

            this.data.excludedDates.push(dateToDelete);

          }



          Storage.save(this.data);

          this.closePunchModal();

          this.renderAll();

          this.showToast('Entry deleted');

        }

      });



      this.btnClosePunchModal.addEventListener('click', () => this.closePunchModal());



      // Settings: Font Size Pills

      if (this.fontSizeButtons) {

        this.fontSizeButtons.forEach((btn) => {

          btn.addEventListener('click', () => {

            const size = btn.getAttribute('data-size');

            this.setFontSize(size);

          });

        });

      }



      // Settings: Update Name

      this.btnSaveName.addEventListener('click', () => {

        const newName = this.inputSettingsName.value.trim();

        if (newName) {

          this.data.name = newName;

          Storage.save(this.data);

          this.renderAll();

          this.showToast('Name updated');

        }

      });



      // Settings: Save Office Hours (with seconds)

      this.btnSaveShiftTimes.addEventListener('click', () => {

        let startVal = this.cfgShiftStart.value.trim();

        let endVal = this.cfgShiftEnd.value.trim();



        if (startVal && startVal.split(':').length === 2) startVal += ':00';

        if (endVal && endVal.split(':').length === 2) endVal += ':00';



        this.data.shiftStart = startVal || '10:15:00';

        this.data.shiftEnd = endVal || '17:15:00';

        Storage.save(this.data);

        this.renderAll();

        this.showToast('Office hours saved');

      });



      // Holidays

      this.btnAddHoliday.addEventListener('click', () => {

        const date = this.newHolidayDate.value;

        const name = this.newHolidayName.value.trim();

        if (!date || !name) return;

        this.data.holidays = this.data.holidays.filter((h) => h.date !== date);

        this.data.holidays.push({ date, name });

        this.data.holidays.sort((a, b) => a.date.localeCompare(b.date));

        Storage.save(this.data);

        this.newHolidayDate.value = '';

        this.newHolidayName.value = '';

        this.renderHolidaysList();

        this.renderHome();

        this.showToast('Holiday added');

      });



      this.btnOpenBulkHolidays.addEventListener('click', () => {

        this.bulkHolidaysText.value = this.data.holidays.map((h) => `${h.date}, ${h.name}`).join('\n');

        this.modalBulkHolidays.classList.add('open');

      });



      this.btnCloseBulkHolidays.addEventListener('click', () => this.modalBulkHolidays.classList.remove('open'));



      this.btnSaveBulkHolidays.addEventListener('click', () => {

        const lines = this.bulkHolidaysText.value.trim().split('\n');

        const list = [];

        lines.forEach((l) => {

          const parts = l.split(',');

          if (parts.length >= 2) {

            const d = parts[0].trim();

            const n = parts.slice(1).join(',').trim();

            if (d && n) list.push({ date: d, name: n });

          }

        });

        list.sort((a, b) => a.date.localeCompare(b.date));

        this.data.holidays = list;

        Storage.save(this.data);

        this.modalBulkHolidays.classList.remove('open');

        this.renderHolidaysList();

        this.renderHome();

        this.showToast('Holidays updated');

      });



      // SPARK Import Triggers

      if (this.btnSparkImageUpload) {

        this.btnSparkImageUpload.addEventListener('click', () => {

          this.openSparkImportModal();

        });

      }



      if (this.btnBrowseSparkFile) {

        this.btnBrowseSparkFile.addEventListener('click', () => {

          if (this.inputSparkFile) {

            this.inputSparkFile.value = '';

            this.inputSparkFile.click();

          }

        });

      }



      if (this.btnPasteSparkImage) {

        this.btnPasteSparkImage.addEventListener('click', () => {

          this.pasteImageFromClipboard();

        });

      }



      // Paste image from clipboard anywhere via Ctrl+V or right-click paste

      window.addEventListener('paste', (e) => {

        const clipboardData = e.clipboardData || window.clipboardData;

        if (!clipboardData) return;



        let imageFile = null;

        if (clipboardData.items) {

          for (let i = 0; i < clipboardData.items.length; i++) {

            const item = clipboardData.items[i];

            if (item.type && item.type.startsWith('image/')) {

              imageFile = item.getAsFile();

              break;

            }

          }

        }



        if (!imageFile && clipboardData.files && clipboardData.files.length > 0) {

          const f = clipboardData.files[0];

          if (f.type && f.type.startsWith('image/')) {

            imageFile = f;

          }

        }



        if (imageFile) {

          e.preventDefault();

          if (!this.modalSparkImport.classList.contains('open')) {

            this.openSparkImportModal();

          }

          this.processSparkFile(imageFile);

        }

      });



      if (this.inputSparkFile) {

        this.inputSparkFile.addEventListener('change', (e) => {

          const file = e.target.files && e.target.files[0];

          if (file) this.processSparkFile(file);

        });

      }



      if (this.btnCloseSparkImport) {

        this.btnCloseSparkImport.addEventListener('click', () => this.closeSparkImportModal());

      }

      if (this.btnCancelSparkImport) {

        this.btnCancelSparkImport.addEventListener('click', () => this.closeSparkImportModal());

      }



      // Drag and drop on drop zone

      if (this.sparkDropZone) {

        ['dragenter', 'dragover'].forEach((eventName) => {

          this.sparkDropZone.addEventListener(eventName, (e) => {

            e.preventDefault();

            this.sparkDropZone.classList.add('dragover');

          });

        });

        ['dragleave', 'drop'].forEach((eventName) => {

          this.sparkDropZone.addEventListener(eventName, (e) => {

            e.preventDefault();

            this.sparkDropZone.classList.remove('dragover');

          });

        });

        this.sparkDropZone.addEventListener('drop', (e) => {

          const dt = e.dataTransfer;

          const file = dt && dt.files && dt.files[0];

          if (file) this.processSparkFile(file);

        });

      }



      // Paste text box toggle

      if (this.btnTogglePasteArea) {

        this.btnTogglePasteArea.addEventListener('click', () => {

          const isHidden = (this.sparkPasteBox.style.display === 'none' || !this.sparkPasteBox.style.display);

          this.sparkPasteBox.style.display = isHidden ? 'flex' : 'none';

          if (isHidden && this.sparkPasteText) this.sparkPasteText.focus();

        });

      }



      // Parse pasted text

      if (this.btnParsePastedText) {

        this.btnParsePastedText.addEventListener('click', () => {

          const text = this.sparkPasteText.value.trim();

          if (!text) {

            this.showToast('Please paste table text first');

            return;

          }

          this.processSparkText(text);

        });

      }



      // Select All Checkbox in Spark table

      if (this.chkSelectAllSpark) {

        this.chkSelectAllSpark.addEventListener('change', (e) => {

          const checked = e.target.checked;

          const checkboxes = this.sparkPreviewBody.querySelectorAll('input[type="checkbox"]:not(:disabled)');

          checkboxes.forEach((cb) => {

            cb.checked = checked;

            const idx = parseInt(cb.getAttribute('data-idx'), 10);

            if (this.pendingSparkRows[idx]) {

              this.pendingSparkRows[idx].selected = checked;

            }

          });

          this.updateSparkImportButtonCount();

        });

      }



      // Confirm & Import button

      if (this.btnConfirmSparkImport) {

        this.btnConfirmSparkImport.addEventListener('click', () => {

          this.commitSparkImport();

        });

      }

    }



    openOnboarding() {

      this.modalNameOnboarding.classList.add('open');

      this.onboardingInputName.focus();

    }



    switchTab(tabId) {

      this.navButtons.forEach((b) => b.classList.toggle('active', b.dataset.tab === tabId));

      this.viewPanels.forEach((p) => p.classList.toggle('active', p.id === tabId));

      window.scrollTo({ top: 0, behavior: 'smooth' });



      if (tabId === 'viewHome') this.renderHome();

      if (tabId === 'viewLog') this.renderLog();

    }



    renderAll() {

      if (!this.data) return;

      this.renderHome();

      this.renderLog();

      this.renderSettings();

      this.renderHolidaysList();

    }



    getHolidayName(dateStr) {

      if (!dateStr || !this.data) return null;

      // 1. Check if configured in government holidays list first (e.g. Kannada Rajyotsava on Sunday)

      const govHol = this.data.holidays.find((h) => h.date === dateStr);

      if (govHol && govHol.name) {

        return govHol.name;

      }



      // 2. All second saturdays and sundays are holidays

      const [y, m, d] = dateStr.split('-').map(Number);

      const dt = new Date(y, m - 1, d);

      const dayOfWeek = dt.getDay();



      if (dayOfWeek === 0) {

        return 'Sunday';

      }

      if (dayOfWeek === 6 && d >= 8 && d <= 14) {

        return 'Second Saturday';

      }



      return null;

    }



    computeExtraBalance() {

      let totalExtraSec = 0;

      this.data.records.forEach((r) => {

        const holName = this.getHolidayName(r.date);

        const calc = TimeEngine.calculateRecord({ ...r, isHoliday: !!holName }, this.data.shiftStart, this.data.shiftEnd);

        totalExtraSec += calc.netExtraSec;

      });



      const anchor = TimeEngine.getAnchorDate(this.data ? this.data.records : []);

      const year = anchor.getFullYear();

      const month = anchor.getMonth();

      const currentDay = anchor.getDate();

      const totalDaysInMonth = new Date(year, month + 1, 0).getDate();

      const holidaysSet = new Set(this.data.holidays.map((h) => h.date));



      // Calculate remaining working days strictly from current date to end of month in all cases

      let remainingWorkingDays = 0;

      for (let d = currentDay; d <= totalDaysInMonth; d++) {

        const iso = TimeEngine.formatDateISO(new Date(year, month, d));

        const isSun = TimeEngine.isSunday(year, month, d);

        const is2ndSat = TimeEngine.isSecondSaturday(year, month, d);

        const isGovHol = holidaysSet.has(iso);



        if (!isSun && !is2ndSat && !isGovHol) {

          remainingWorkingDays++;

        }

      }



      return { totalExtraSec, remainingWorkingDays };

    }



    renderHome() {

      const p = this.data.name || 'Swaroop';

      const cleanName = p.trim().split(' ')[0];

      this.displayUserName.textContent = `${cleanName},`;



      const { totalExtraSec, remainingWorkingDays } = this.computeExtraBalance();

      const hasReachedGoal = totalExtraSec >= TARGET_EXTRA_SECONDS;



      if (hasReachedGoal) {

        if (this.heroCountdownState) this.heroCountdownState.style.display = 'none';

        if (this.heroAchievedState) this.heroAchievedState.style.display = 'block';

      } else {

        if (this.heroCountdownState) this.heroCountdownState.style.display = 'block';

        if (this.heroAchievedState) this.heroAchievedState.style.display = 'none';



        const neededSec = TARGET_EXTRA_SECONDS - Math.max(0, totalExtraSec);

        const h = Math.floor(neededSec / 3600);

        const m = Math.floor((neededSec % 3600) / 60);

        const s = neededSec % 60;

        const totalMinutes = Math.ceil(neededSec / 60);



        this.valHours.textContent = h;

        this.valMinutes.textContent = String(m).padStart(2, '0');

        this.valSeconds.textContent = String(s).padStart(2, '0');

        this.valTotalMinutes.textContent = `(~${totalMinutes} Minutes)`;

        this.valTargetDesc.textContent = 'For a day of Compensatory Off.';

        this.valDaysRemaining.textContent = remainingWorkingDays;

      }

    }



    // ==========================================================================

    // TABULAR LOG: PRESENT MONTH ONLY (FUTURE DATES LIGHTER & FORENOON/AFTERNOON)

    // ==========================================================================

    renderLog() {

      if (!this.data) return;

      const anchor = TimeEngine.getAnchorDate(this.data ? this.data.records : []);

      const todayISO = TimeEngine.formatDateISO(anchor);

      const curYear = anchor.getFullYear();

      const curMonth = anchor.getMonth();

      const daysInCurMonth = new Date(curYear, curMonth + 1, 0).getDate();

      const excluded = new Set(this.data.excludedDates || []);



      // Collect records by date

      const recordMap = new Map();

      this.data.records.forEach((r) => recordMap.set(r.date, r));



      // Cutoff date: maximum of current date or the latest entered date in this month

      let cutoffDate = todayISO;

      this.data.records.forEach((r) => {

        const [y, m] = r.date.split('-').map(Number);

        if (y === curYear && (m - 1) === curMonth) {

          if (r.date > cutoffDate) {

            cutoffDate = r.date;

          }

        }

      });



      // Build consolidated set of dates for the PRESENT month

      const datesSet = new Set();

      this.data.records.forEach((r) => {

        const [y, m] = r.date.split('-').map(Number);

        if (y === curYear && (m - 1) === curMonth) {

          if (!excluded.has(r.date)) {

            datesSet.add(r.date);

          }

        }

      });



      // Automatically include Sundays, Second Saturdays, and Government Holidays

      // ONLY up to the current date (or last entered date in the month).

      // Holidays after the cutoff date are hidden from the log table.

      for (let d = 1; d <= daysInCurMonth; d++) {

        const iso = `${curYear}-${String(curMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

        if (iso <= cutoffDate && !excluded.has(iso) && this.getHolidayName(iso)) {

          datesSet.add(iso);

        }

      }



      const sortedDates = Array.from(datesSet).sort((a, b) => b.localeCompare(a));

      this.logTableBody.innerHTML = '';



      if (sortedDates.length === 0) {

        this.logTableBody.innerHTML = `

          <tr class="table-empty-row">

            <td colspan="5">No attendance records logged yet.</td>

          </tr>

        `;

        return;

      }



      sortedDates.forEach((dateStr) => {

        const [y, m, d] = dateStr.split('-').map(Number);

        const dt = new Date(y, m - 1, d);

        const dayName = dt.toLocaleDateString('en-US', { weekday: 'short' });

        const dateFormatted = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;



        const tr = document.createElement('tr');



        // Check if date is in the future (planned attendance)

        const isFuture = dateStr > todayISO;

        if (isFuture) {

          tr.classList.add('row-future');

        }



        const holName = this.getHolidayName(dateStr);

        const rec = recordMap.get(dateStr);



        // Case 1: Holiday row without attendance punches -> holiday name centered across Punch In, Punch Out, Remarks

        const isHolidayOnly = (holName || (rec && rec.status === 'PH')) && (!rec || (!rec.inTime && !rec.outTime));



        if (isHolidayOnly) {

          const displayName = holName || 'Public Holiday';

          tr.style.cursor = 'default';

          tr.innerHTML = `

            <td class="cell-date">${dateFormatted}</td>

            <td class="cell-day">${dayName}</td>

            <td colspan="3" class="cell-holiday-centered">${displayName}</td>

          `;

        } else {

          // Case 2: Attendance entry (Punch / OD / Leave / Worked on Holiday)

          let inDisplay = (rec && rec.inTime) ? rec.inTime : (rec && ['OD', 'CL'].includes(rec.status) ? '--' : '--:--:--');

          let outDisplay = (rec && rec.outTime) ? rec.outTime : (rec && ['OD', 'CL'].includes(rec.status) ? '--' : '--:--:--');

          let remarksHtml = '';



          // Calculate extra time for this entry (requires both in and out punches)

          let netExtraSec = 0;

          let netExtraStr = '';

          if (rec) {

            const calc = TimeEngine.calculateRecord({ ...rec, isHoliday: !!holName }, this.data.shiftStart, this.data.shiftEnd);

            netExtraSec = calc.netExtraSec;

            netExtraStr = calc.netExtraStr;

          }



          if (rec && rec.inTime && rec.outTime && rec.inTime !== '--' && rec.outTime !== '--') {

            inDisplay = rec.inTime;

            outDisplay = rec.outTime;



            if (rec.status === 'OD_HALF' || (rec.status === 'OD' && (rec.duration === 'FN' || rec.duration === 'AN'))) {

              const session = rec.duration || TimeEngine.identifySession(rec.inTime, rec.outTime);

              remarksHtml = `<span class="remark-tag remark-tag-od">OD ${session}</span>`;

              if (netExtraSec > 0) {

                remarksHtml += ` <span class="remark-extra-green">${netExtraStr}</span>`;

              }

            } else if (rec.status === 'CL_HALF' || (rec.status === 'CL' && (rec.duration === 'FN' || rec.duration === 'AN'))) {

              const session = rec.duration || TimeEngine.identifySession(rec.inTime, rec.outTime);

              remarksHtml = `<span class="remark-tag remark-tag-leave">Leave ${session}</span>`;

              if (netExtraSec > 0) {

                remarksHtml += ` <span class="remark-extra-green">${netExtraStr}</span>`;

              }

            } else {

              // Regular Present or Worked on Holiday

              if (holName) {

                remarksHtml = `<span class="remark-tag remark-tag-leave">${holName}</span>`;

                if (netExtraSec > 0) {

                  remarksHtml += ` <span class="remark-extra-green">${netExtraStr}</span>`;

                }

              } else if (netExtraSec > 0) {

                remarksHtml += `<span class="remark-extra-green">${netExtraStr}</span>`;

              }

            }

          } else if (rec && rec.status === 'OD') {

            remarksHtml = `<span class="remark-tag remark-tag-od">OD</span>`;

          } else if (rec && rec.status === 'CL') {

            remarksHtml = `<span class="remark-tag remark-tag-leave">Leave</span>`;

          }



          tr.innerHTML = `

            <td class="cell-date">${dateFormatted}</td>

            <td class="cell-day">${dayName}</td>

            <td class="cell-time">${inDisplay}</td>

            <td class="cell-time">${outDisplay}</td>

            <td class="cell-remarks">${remarksHtml}</td>

          `;



          tr.addEventListener('click', () => this.openPunchModal(dateStr, rec ? rec.id : null, true));

        }



        this.logTableBody.appendChild(tr);

      });

    }



    renderSettings() {

      this.inputSettingsName.value = this.data.name || '';

      

      let start = this.data.shiftStart || '10:15:00';

      let end = this.data.shiftEnd || '17:15:00';

      if (start.split(':').length === 2) start += ':00';

      if (end.split(':').length === 2) end += ':00';



      this.cfgShiftStart.value = start;

      this.cfgShiftEnd.value = end;



      this.applyFontSize(this.data && this.data.fontSize ? this.data.fontSize : 'default');

    }



    setFontSize(size) {

      if (!this.data) return;

      this.data.fontSize = size;

      Storage.save(this.data);

      this.applyFontSize(size);

      const labelMap = {

        small: 'Small',

        default: 'Default',

        large: 'Large',

        xlarge: 'Extra Large'

      };

      this.showToast(`Font size: ${labelMap[size] || size}`);

    }



    applyFontSize(size = 'default') {

      const scaleMap = {

        small: 0.88,

        default: 1.0,

        large: 1.15,

        xlarge: 1.30

      };

      const scale = scaleMap[size] || 1.0;

      document.documentElement.style.setProperty('--ui-font-scale', scale);

      if (this.fontSizeButtons) {

        this.fontSizeButtons.forEach((btn) => {

          btn.classList.toggle('active', btn.getAttribute('data-size') === size);

        });

      }

    }



    renderHolidaysList() {

      this.holidaysListContainer.innerHTML = '';

      this.data.holidays.forEach((hol) => {

        const row = document.createElement('div');

        row.className = 'hol-row';

        row.innerHTML = `

          <div><span class="hol-date">${hol.date}</span><span>${hol.name}</span></div>

          <button style="background: none; border: none; color: #64748b; cursor: pointer;">✕</button>

        `;

        row.querySelector('button').addEventListener('click', () => {

          this.data.holidays = this.data.holidays.filter((h) => h.date !== hol.date);

          Storage.save(this.data);

          this.renderHolidaysList();

          this.renderHome();

        });

        this.holidaysListContainer.appendChild(row);

      });

    }



    openPunchModal(dateStr, recordId = null, fromTableRow = false) {

      this.editingRecordId = recordId;



      // Restrict date picker strictly to current month

      const anchor = TimeEngine.getAnchorDate();

      const curYear = anchor.getFullYear();

      const curMonth = anchor.getMonth();

      const firstDayStr = `${curYear}-${String(curMonth + 1).padStart(2, '0')}-01`;

      const lastDay = new Date(curYear, curMonth + 1, 0).getDate();

      const lastDayStr = `${curYear}-${String(curMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      this.entryDate.min = firstDayStr;

      this.entryDate.max = lastDayStr;



      // If provided date is outside current month or missing, default to current anchor date

      if (dateStr) {

        const [y, m] = dateStr.split('-').map(Number);

        if (y !== curYear || (m - 1) !== curMonth) {

          dateStr = TimeEngine.formatDateISO(anchor);

        }

      } else {

        dateStr = TimeEngine.formatDateISO(anchor);

      }

      this.entryDate.value = dateStr;



      const rec = recordId ? this.data.records.find((r) => r.id === recordId) : this.data.records.find((r) => r.date === dateStr);



      if (rec) {

        this.editingRecordId = rec.id;

        this.modalPunchTitle.textContent = 'Edit Attendance';

        this.entryDate.value = rec.date;

        

        if (rec.status === 'OD_HALF') {

          this.entryStatus.value = 'OD';

          this.entryDuration.value = (rec.duration === 'FN' || rec.duration === 'AN') ? rec.duration : 'FN';

        } else if (rec.status === 'CL_HALF') {

          this.entryStatus.value = 'CL';

          this.entryDuration.value = (rec.duration === 'FN' || rec.duration === 'AN') ? rec.duration : 'FN';

        } else if (rec.status === 'OD') {

          this.entryStatus.value = 'OD';

          this.entryDuration.value = (rec.duration === 'FN' || rec.duration === 'AN') ? rec.duration : 'FULL';

        } else if (rec.status === 'CL') {

          this.entryStatus.value = 'CL';

          this.entryDuration.value = (rec.duration === 'FN' || rec.duration === 'AN') ? rec.duration : 'FULL';

        } else {

          this.entryStatus.value = 'P';

          this.entryDuration.value = 'FULL';

        }



        this.entryInTime.value = rec.inTime || '';

        this.entryOutTime.value = rec.outTime || '';

        this.btnDeleteRecord.style.display = 'block';

      } else if (fromTableRow) {

        this.editingRecordId = null;

        this.modalPunchTitle.textContent = 'Edit Attendance';

        this.entryStatus.value = 'P';

        this.entryDuration.value = 'FULL';

        this.entryInTime.value = this.data.shiftStart || '10:15:00';

        this.entryOutTime.value = this.data.shiftEnd || '17:15:00';

        this.btnDeleteRecord.style.display = 'block';

      } else {

        this.editingRecordId = null;

        this.modalPunchTitle.textContent = 'Log Attendance';

        this.entryStatus.value = 'P';

        this.entryDuration.value = 'FULL';

        this.entryInTime.value = this.data.shiftStart || '10:15:00';

        this.entryOutTime.value = this.data.shiftEnd || '17:15:00';

        this.btnDeleteRecord.style.display = 'none';

      }



      // Show AN/FN time field only when status is not Present

      if (this.entryStatus.value === 'P') {

        this.colTimeSession.style.display = 'none';

        this.modalTopRow.className = 'form-row-2col-top';

        this.punchTimesBlock.style.display = 'grid';

      } else {

        this.colTimeSession.style.display = 'flex';

        this.modalTopRow.className = 'form-row-3col';

        if (this.entryDuration.value === 'FULL') {

          this.punchTimesBlock.style.display = 'none';

        } else {

          this.punchTimesBlock.style.display = 'grid';

        }

      }



      this.updatePunchPreview();

      this.modalPunch.classList.add('open');

    }



    closePunchModal() {

      this.modalPunch.classList.remove('open');

      this.editingRecordId = null;

    }



    updatePunchPreview() {

      const status = this.entryStatus.value;

      const duration = this.entryDuration.value;

      let effectiveStatus = status;

      if (status === 'OD' && (duration === 'FN' || duration === 'AN' || duration === 'HALF')) effectiveStatus = 'OD_HALF';

      if (status === 'CL' && (duration === 'FN' || duration === 'AN' || duration === 'HALF')) effectiveStatus = 'CL_HALF';



      const holName = this.getHolidayName(this.entryDate.value);

      if (holName) {

        this.previewExtra.textContent = `Holiday (${holName})`;

        this.previewExtra.className = 'extra-neutral';

        return;

      }



      const inTime = this.entryInTime.value;

      const outTime = this.entryOutTime.value;

      const isFull = (effectiveStatus === 'OD' || effectiveStatus === 'CL');



      if (!isFull && inTime && outTime) {

        const inSec = TimeEngine.timeStrToSec(inTime);

        const outSec = TimeEngine.timeStrToSec(outTime);

        if (inSec !== null && outSec !== null && inSec >= outSec) {

          this.previewExtra.textContent = 'Invalid (In ≥ Out)';

          this.previewExtra.className = 'extra-neutral';

          return;

        }

      }



      const mock = {

        date: this.entryDate.value || '2026-11-23',

        status: effectiveStatus,

        duration: duration,

        inTime: inTime,

        outTime: outTime,

        isHoliday: !!holName

      };

      const res = TimeEngine.calculateRecord(mock, this.data.shiftStart, this.data.shiftEnd);

      

      if (res.netExtraSec > 0) {

        this.previewExtra.textContent = res.netExtraStr;

        this.previewExtra.className = 'extra-positive-green';

      } else {

        this.previewExtra.textContent = '00:00:00';

        this.previewExtra.className = 'extra-neutral';

      }

    }



    savePunchRecord() {

      const date = this.entryDate.value;

      const status = this.entryStatus.value;

      const duration = this.entryDuration.value;

      const inTime = this.entryInTime.value;

      const outTime = this.entryOutTime.value;



      if (!date) {

        this.showToast('Please select a date');

        return;

      }



      // Restrict date strictly to the current month

      const anchor = TimeEngine.getAnchorDate();

      const curYear = anchor.getFullYear();

      const curMonth = anchor.getMonth();

      const [y, m] = date.split('-').map(Number);

      if (y !== curYear || (m - 1) !== curMonth) {

        this.showToast('Date must be within the current month');

        return;

      }



      // 1. Do not allow attendance entry or edit on a holiday

      const holName = this.getHolidayName(date);

      if (holName) {

        this.showToast(`Cannot log attendance on a holiday (${holName})`);

        return;

      }



      // 2. Do not allow two entries for the same day

      if (this.editingRecordId) {

        const duplicate = this.data.records.find((r) => r.date === date && r.id !== this.editingRecordId);

        if (duplicate) {

          this.showToast(`An attendance record already exists for ${date}`);

          return;

        }

      } else {

        const existing = this.data.records.find((r) => r.date === date);

        if (existing) {

          this.showToast(`An attendance record already exists for ${date}`);

          return;

        }

      }



      let effectiveStatus = status;

      if (status === 'OD') {

        effectiveStatus = (duration === 'FN' || duration === 'AN' || duration === 'HALF') ? 'OD_HALF' : 'OD';

      } else if (status === 'CL') {

        effectiveStatus = (duration === 'FN' || duration === 'AN' || duration === 'HALF') ? 'CL_HALF' : 'CL';

      } else {

        effectiveStatus = 'P';

      }



      const isFullODorLeave = (effectiveStatus === 'OD' || effectiveStatus === 'CL');



      // 3. Punch In time must be strictly earlier than Punch Out time

      if (!isFullODorLeave) {

        if (!inTime || !outTime) {

          this.showToast('Please enter both Punch In and Punch Out times');

          return;

        }

        const inSec = TimeEngine.timeStrToSec(inTime);

        const outSec = TimeEngine.timeStrToSec(outTime);

        if (inSec === null || outSec === null || inSec >= outSec) {

          this.showToast('Punch In time must be earlier than Punch Out time');

          return;

        }

      }



      let rec = this.editingRecordId ? this.data.records.find((r) => r.id === this.editingRecordId) : null;



      if (rec) {

        rec.date = date;

        rec.status = effectiveStatus;

        rec.duration = duration;

        rec.inTime = isFullODorLeave ? '' : inTime;

        rec.outTime = isFullODorLeave ? '' : outTime;

      } else {

        this.data.records.push({

          id: `rec-${date.replace(/-/g, '')}`,

          date,

          status: effectiveStatus,

          duration: duration,

          inTime: isFullODorLeave ? '' : inTime,

          outTime: isFullODorLeave ? '' : outTime

        });

      }



      // If date was previously excluded/deleted, un-exclude it now that it has been saved

      if (this.data.excludedDates) {

        this.data.excludedDates = this.data.excludedDates.filter((d) => d !== date);

      }



      Storage.save(this.data);

      this.closePunchModal();

      this.renderAll();

      this.showToast('Attendance saved');

    }



    // ==========================================================================

    // SPARK IMPORT & PREVIEW CONTROLLER

    // ==========================================================================

    openSparkImportModal() {

      if (!this.modalSparkImport) return;

      this.pendingSparkRows = [];

      this.sparkImportStatus.style.display = 'none';

      this.sparkPreviewContainer.style.display = 'none';

      if (this.sparkPasteBox) this.sparkPasteBox.style.display = 'none';

      if (this.sparkPasteText) this.sparkPasteText.value = '';

      this.modalSparkImport.classList.add('open');

    }



    closeSparkImportModal() {

      if (!this.modalSparkImport) return;

      this.modalSparkImport.classList.remove('open');

      this.pendingSparkRows = [];

    }



    async processSparkFile(file) {

      if (!file) return;



      const fileName = file.name || 'clipboard-image.png';

      this.sparkImportStatus.style.display = 'flex';

      this.sparkStatusText.textContent = `Reading ${fileName}...`;

      this.sparkPreviewContainer.style.display = 'none';



      try {

        const isPdf = (file.type === 'application/pdf') || /\.pdf$/i.test(fileName);

        const isImage = (file.type && file.type.startsWith('image/')) || /\.(png|jpe?g|webp|bmp)$/i.test(fileName);

        const isExcel = /\.(xlsx|xls)$/i.test(fileName);

        const isCsvOrText = /\.(csv|txt|tsv)$/i.test(fileName) || (file.type && file.type.includes('text'));



        let rows = [];



        if (isPdf) {

          this.sparkStatusText.textContent = 'Parsing SPARK PDF report...';

          const buffer = await file.arrayBuffer();

          rows = await SparkParser.parsePdf(buffer);

        } else if (isImage) {

          this.sparkStatusText.textContent = 'Running OCR on SPARK table screenshot...';

          const dataUrl = await new Promise((resolve, reject) => {

            const reader = new FileReader();

            reader.onload = (e) => resolve(e.target.result);

            reader.onerror = reject;

            reader.readAsDataURL(file);

          });

          rows = await SparkParser.parseImage(dataUrl, (pct) => {

            this.sparkStatusText.textContent = `Recognizing SPARK table... ${pct}%`;

          });

        } else if (isExcel) {

          this.sparkStatusText.textContent = 'Parsing Excel sheet...';

          const binary = await new Promise((resolve, reject) => {

            const reader = new FileReader();

            reader.onload = (e) => resolve(e.target.result);

            reader.onerror = reject;

            reader.readAsBinaryString(file);

          });

          rows = SparkParser.parseSheet(binary);

        } else if (isCsvOrText) {

          this.sparkStatusText.textContent = 'Parsing CSV/Text...';

          const text = await new Promise((resolve, reject) => {

            const reader = new FileReader();

            reader.onload = (e) => resolve(e.target.result);

            reader.onerror = reject;

            reader.readAsText(file);

          });

          rows = SparkParser.parseText(text);

        } else {

          // Fallback attempt with SheetJS

          const binary = await new Promise((resolve, reject) => {

            const reader = new FileReader();

            reader.onload = (e) => resolve(e.target.result);

            reader.onerror = reject;

            reader.readAsBinaryString(file);

          });

          rows = SparkParser.parseSheet(binary);

        }



        this.sparkImportStatus.style.display = 'none';

        if (!rows || rows.length === 0) {

          if (isImage) {

            this.showToast('Screenshot resolution too low for OCR. Please click "Generate Attendance Report" on SPARK to download the PDF.');

          } else {

            this.showToast('No valid attendance rows found in file');

          }

          return;

        }

        this.populateSparkPreview(rows);

      } catch (err) {

        console.error('SPARK extraction error:', err);

        this.sparkImportStatus.style.display = 'none';

        this.showToast(`Extraction failed: ${err.message || 'Could not parse file'}`);

      }

    }



    async pasteImageFromClipboard() {

      if (navigator.clipboard && navigator.clipboard.read) {

        try {

          this.sparkImportStatus.style.display = 'flex';

          this.sparkStatusText.textContent = 'Reading image from clipboard...';

          this.sparkPreviewContainer.style.display = 'none';



          const items = await navigator.clipboard.read();

          let imageBlob = null;

          for (const item of items) {

            for (const type of item.types) {

              if (type.startsWith('image/')) {

                imageBlob = await item.getType(type);

                break;

              }

            }

            if (imageBlob) break;

          }



          if (imageBlob) {

            const file = new File([imageBlob], 'clipboard-screenshot.png', { type: imageBlob.type || 'image/png' });

            await this.processSparkFile(file);

            return;

          } else {

            this.sparkImportStatus.style.display = 'none';

            this.showToast('No image in clipboard. Press Ctrl+V to paste directly.');

          }

        } catch (err) {

          console.warn('Clipboard read error:', err);

          this.sparkImportStatus.style.display = 'none';

          this.showToast('Clipboard access restricted. Press Ctrl+V to paste image directly.');

        }

      } else {

        this.showToast('Please press Ctrl+V to paste your copied image.');

      }

    }



    processSparkText(rawText) {

      this.sparkImportStatus.style.display = 'flex';

      this.sparkStatusText.textContent = 'Parsing SPARK table rows...';

      this.sparkPreviewContainer.style.display = 'none';



      try {

        const rows = SparkParser.parseText(rawText);

        this.sparkImportStatus.style.display = 'none';

        if (!rows || rows.length === 0) {

          if (isImage) {

            this.showToast('Screenshot resolution too low for OCR. Please click "Generate Attendance Report" on SPARK to download the PDF.');

          } else {

            this.showToast('No valid attendance rows found in file');

          }

          return;

        }

        this.populateSparkPreview(rows);

      } catch (err) {

        console.error(err);

        this.sparkImportStatus.style.display = 'none';

        this.showToast('Could not parse text');

      }

    }



    populateSparkPreview(rawRows) {

      if (!rawRows || rawRows.length === 0) {

        this.showToast('No valid attendance rows found');

        return;

      }



      const anchor = TimeEngine.getAnchorDate();

      const curYear = anchor.getFullYear();

      const curMonth = anchor.getMonth();

      const holidaysSet = new Set(this.data.holidays.map((h) => h.date));



      const preparedRows = [];

      let workingCount = 0;

      let holidayExcludedCount = 0;



      rawRows.forEach((r) => {

        if (!r.date) return;

        const [y, m, d] = r.date.split('-').map(Number);

        

        // Filter strictly within current month

        if (y !== curYear || (m - 1) !== curMonth) {

          return;

        }



        const dt = new Date(y, m - 1, d);

        const dayOfWeek = dt.getDay();

        const isSunday = dayOfWeek === 0;

        const is2ndSat = (dayOfWeek === 6 && d >= 8 && d <= 14);

        const isGovHol = holidaysSet.has(r.date);

        const isMarkedPH = (r.status === 'PH');



        // Rule: "it can contain punch in out for holidays. dont take thoswe while parsing."

        const isHoliday = (isSunday || is2ndSat || isGovHol || isMarkedPH);



        let holidayLabel = '';

        if (isGovHol) holidayLabel = this.getHolidayName(r.date) || 'Government Holiday';

        else if (isSunday) holidayLabel = 'Sunday';

        else if (is2ndSat) holidayLabel = 'Second Saturday';

        else if (isMarkedPH) holidayLabel = 'Public Holiday';



        const item = {

          date: r.date,

          dayName: dt.toLocaleDateString('en-US', { weekday: 'short' }),

          dateDisplay: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`,

          inTime: r.inTime || '',

          outTime: r.outTime || '',

          status: r.status || 'P',

          isHoliday: isHoliday,

          holidayLabel: holidayLabel,

          // If holiday, strictly do NOT select/import punches

          // Working days (Present, OD, Leaves, single punch days) are selected by default. Only holidays are excluded.

          selected: !isHoliday,

          netExtraStr: '',

          netExtraSec: 0

        };



        if (isHoliday) {

          holidayExcludedCount++;

        } else {

          workingCount++;

          if (item.inTime && item.outTime) {

            const calc = TimeEngine.calculateRecord({

              date: item.date,

              inTime: item.inTime,

              outTime: item.outTime,

              status: item.status,

              isHoliday: false

            }, this.data.shiftStart, this.data.shiftEnd);

            item.netExtraSec = calc.netExtraSec;

            item.netExtraStr = calc.netExtraStr;

          }

        }



        preparedRows.push(item);

      });



      // Deduplicate by date, keeping the row with punch times

      const rowMap = new Map();

      preparedRows.forEach((row) => {

        if (!rowMap.has(row.date)) {

          rowMap.set(row.date, row);

        } else {

          const existing = rowMap.get(row.date);

          if ((!existing.inTime || !existing.outTime) && (row.inTime && row.outTime)) {

            rowMap.set(row.date, row);

          }

        }

      });

      const finalRows = Array.from(rowMap.values());



      // Sort chronological

      finalRows.sort((a, b) => a.date.localeCompare(b.date));

      this.pendingSparkRows = finalRows;



      if (finalRows.length === 0) {

        this.showToast('No records matched the current month');

        return;

      }



      // Render into Preview Table

      this.sparkPreviewBody.innerHTML = '';

      finalRows.forEach((row, idx) => {

        const tr = document.createElement('tr');

        if (row.isHoliday) {

          tr.className = 'row-holiday-excluded';

          tr.innerHTML = `

            <td><input type="checkbox" disabled></td>

            <td><strong>${row.dateDisplay}</strong> <span style="color:#64748b; font-size:10px;">${row.dayName}</span></td>

            <td><span class="badge-excluded-tag">Holiday (${row.holidayLabel})</span></td>

            <td style="color:#64748b;">${row.inTime || '--'}</td>

            <td style="color:#64748b;">${row.outTime || '--'}</td>

            <td><span class="badge-excluded-tag">Punches Excluded</span></td>

          `;

        } else {

          const inDisp = row.inTime ? row.inTime : (['OD', 'CL'].includes(row.status) ? '--' : '--:--:--');

          const outDisp = row.outTime ? row.outTime : (['OD', 'CL'].includes(row.status) ? '--' : '--:--:--');

          let statusBadge = `<span class="remark-tag remark-tag-od">${row.status}</span>`;

          if (row.status === 'P') statusBadge = 'Present';

          else if (row.status === 'OD') statusBadge = `<span class="remark-tag remark-tag-od">OD</span>`;

          else if (row.status === 'CL') statusBadge = `<span class="remark-tag remark-tag-leave">Leave</span>`;



          let extraHtml = '----';

          if (row.netExtraSec > 0) {

            extraHtml = `<span class="remark-extra-green">${row.netExtraStr}</span>`;

          }



          tr.innerHTML = `

            <td><input type="checkbox" data-idx="${idx}" ${row.selected ? 'checked' : ''}></td>

            <td><strong>${row.dateDisplay}</strong> <span style="color:#64748b; font-size:10px;">${row.dayName}</span></td>

            <td>${statusBadge}</td>

            <td class="cell-time">${inDisp}</td>

            <td class="cell-time">${outDisp}</td>

            <td>${extraHtml}</td>

          `;



          const cb = tr.querySelector('input[type="checkbox"]');

          cb.addEventListener('change', (e) => {

            row.selected = e.target.checked;

            this.updateSparkImportButtonCount();

          });

        }

        this.sparkPreviewBody.appendChild(tr);

      });



      this.sparkSummaryStats.textContent = `${workingCount} working days found · ${holidayExcludedCount} holidays excluded`;

      this.updateSparkImportButtonCount();

      this.sparkPreviewContainer.style.display = 'block';

    }



    updateSparkImportButtonCount() {

      const selectedCount = this.pendingSparkRows.filter((r) => r.selected && !r.isHoliday).length;

      this.btnConfirmSparkImport.textContent = `Confirm & Import (${selectedCount})`;

      this.btnConfirmSparkImport.disabled = (selectedCount === 0);

    }



    commitSparkImport() {

      const selectedRows = this.pendingSparkRows.filter((r) => r.selected && !r.isHoliday);

      if (selectedRows.length === 0) {

        this.showToast('No records selected to import');

        return;

      }



      // Merge records by date

      const recordMap = new Map();

      this.data.records.forEach((r) => recordMap.set(r.date, r));



      let importedCount = 0;

      selectedRows.forEach((r) => {

        // Enforce Punch In < Punch Out

        if (r.inTime && r.outTime) {

          const inSec = TimeEngine.timeStrToSec(r.inTime);

          const outSec = TimeEngine.timeStrToSec(r.outTime);

          if (inSec !== null && outSec !== null && inSec >= outSec) {

            return; // Skip invalid timing

          }

        }



        const recId = `rec-${r.date.replace(/-/g, '')}`;

        recordMap.set(r.date, {

          id: recId,

          date: r.date,

          status: r.status,

          duration: 'FULL',

          inTime: r.inTime,

          outTime: r.outTime

        });

        importedCount++;

      });



      this.data.records = Array.from(recordMap.values()).sort((a, b) => b.date.localeCompare(a.date));

      Storage.save(this.data);



      this.closeSparkImportModal();

      this.renderAll();

      this.showToast(`Imported ${importedCount} records from SPARK`);

    }



    showToast(msg) {

      if (!this.toastNotification) return;

      this.toastNotification.textContent = msg;

      this.toastNotification.classList.add('show');

      clearTimeout(this._t);

      this._t = setTimeout(() => this.toastNotification.classList.remove('show'), 2000);

    }

  }



  document.addEventListener('DOMContentLoaded', () => {

    window.SparkParser = SparkParser;

    window.app = new AppController();

  });

})();

