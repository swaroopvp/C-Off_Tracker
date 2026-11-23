/**
 * Pure Minimalist Comp-Off Tracker
 * Target: Exactly 10:00:00 extra hours = 1 day of Compensatory-off.
 * Tabular Log Layout | Office Hours with Seconds & Inline Save | Full/Half Day OD & Leave
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'compoff_pure_minimal_v1';
  const TARGET_EXTRA_SECONDS = 10 * 3600; // Strictly 10:00:00 (36,000 seconds)

  const DEFAULT_HOLIDAYS = [
    { date: '2026-01-15', name: 'Makara Sankranti' },
    { date: '2026-01-26', name: 'Republic Day' },
    { date: '2026-03-19', name: 'Ugadi' },
    { date: '2026-04-14', name: 'Dr. B.R. Ambedkar Jayanti' },
    { date: '2026-05-01', name: 'May Day' },
    { date: '2026-08-15', name: 'Independence Day' },
    { date: '2026-10-02', name: 'Gandhi Jayanti' },
    { date: '2026-10-20', name: 'Vijayadashami' },
    { date: '2026-11-01', name: 'Kannada Rajyotsava' },
    { date: '2026-11-08', name: 'Deepavali' },
    { date: '2026-12-25', name: 'Christmas' }
  ];

  // Authentic November 2026 portal records
  const DEMO_RECORDS = [
    { id: 'rec-1', date: '2026-11-01', inTime: '', outTime: '', status: 'PH' },
    { id: 'rec-2', date: '2026-11-02', inTime: '08:25:09', outTime: '17:48:10', status: 'P' },
    { id: 'rec-3', date: '2026-11-03', inTime: '08:47:31', outTime: '17:15:39', status: 'P' },
    { id: 'rec-4', date: '2026-11-04', inTime: '10:05:01', outTime: '17:45:53', status: 'P' },
    { id: 'rec-5', date: '2026-11-05', inTime: '10:03:37', outTime: '16:21:51', status: 'P' },
    { id: 'rec-6', date: '2026-11-06', inTime: '07:31:45', outTime: '16:47:43', status: 'P' },
    { id: 'rec-7', date: '2026-11-07', inTime: '09:49:05', outTime: '18:48:04', status: 'P' },
    { id: 'rec-8', date: '2026-11-08', inTime: '', outTime: '', status: 'PH' },
    { id: 'rec-9', date: '2026-11-09', inTime: '', outTime: '', status: 'OD' },
    { id: 'rec-10', date: '2026-11-10', inTime: '09:48:10', outTime: '17:15:08', status: 'P' },
    { id: 'rec-11', date: '2026-11-11', inTime: '09:40:59', outTime: '17:15:08', status: 'P' },
    { id: 'rec-12', date: '2026-11-12', inTime: '09:43:09', outTime: '17:15:08', status: 'P' },
    { id: 'rec-13', date: '2026-11-13', inTime: '09:39:54', outTime: '16:17:24', status: 'P' },
    { id: 'rec-14', date: '2026-11-14', inTime: '', outTime: '', status: 'PH' },
    { id: 'rec-15', date: '2026-11-15', inTime: '', outTime: '', status: 'PH' },
    { id: 'rec-16', date: '2026-11-16', inTime: '09:31:06', outTime: '17:36:52', status: 'P' },
    { id: 'rec-17', date: '2026-11-17', inTime: '09:49:04', outTime: '17:39:55', status: 'P' },
    { id: 'rec-18', date: '2026-11-18', inTime: '09:35:45', outTime: '17:22:15', status: 'P' },
    { id: 'rec-19', date: '2026-11-19', inTime: '09:50:45', outTime: '17:18:01', status: 'P' },
    { id: 'rec-20', date: '2026-11-20', inTime: '09:49:30', outTime: '17:21:59', status: 'P' },
    { id: 'rec-21', date: '2026-11-21', inTime: '10:08:16', outTime: '13:01:43', status: 'P' },
    { id: 'rec-22', date: '2026-11-22', inTime: '', outTime: '', status: 'PH' }
  ];

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
      const now = new Date();
      if (now.getFullYear() === 2026 && now.getMonth() === 10) return now;
      return new Date(2026, 10, 23, 10, 8, 0); // 23 Nov 2026
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
      if (record.status === 'OD') {
        return { workedSec: stdDurationSec, totalDaySec: stdDurationSec, netExtraSec: 0, netExtraStr: '+00:00:00' };
      }

      // 2. Full Day Leave (CL) or Holiday with no punch
      if (['PH', 'CL'].includes(record.status) && (!record.inTime || !record.outTime)) {
        return { workedSec: 0, totalDaySec: 0, netExtraSec: 0, netExtraStr: '00:00:00' };
      }

      // 3. Punch Entries: Present, Half Day OD, or Half Day Leave
      if (record.inTime && record.outTime) {
        const inSec = this.timeStrToSec(record.inTime);
        const outSec = this.timeStrToSec(record.outTime);
        if (inSec === null || outSec === null) {
          return { workedSec: 0, totalDaySec: 0, netExtraSec: 0, netExtraStr: '00:00:00' };
        }

        const punchedSec = outSec >= inSec ? outSec - inSec : (86400 - inSec) + outSec;
        const [y, m, d] = record.date.split('-').map(Number);
        const isHol = this.isSunday(y, m - 1, d) || this.isSecondSaturday(y, m - 1, d) || record.status === 'PH' || !!record.isHoliday;

        // Even for half day, actual punched time is checked against the 7-hour threshold (no 3.5h split)
        const totalDaySec = punchedSec;

        let netExtraSec = 0;
        if (isHol) {
          // Working on holiday grants 100% credit
          netExtraSec = totalDaySec;
        } else {
          // Standard check: does total attendance time exceed 7 hours?
          netExtraSec = totalDaySec - stdDurationSec;
        }

        const sign = netExtraSec >= 0 ? '+' : '-';
        return {
          workedSec: punchedSec,
          totalDaySec: totalDaySec,
          netExtraSec,
          netExtraStr: `${sign}${this.secToTimeStr(Math.abs(netExtraSec))}`
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
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed) return parsed;
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
        records: [...DEMO_RECORDS]
      };
      this.save(data);
      return data;
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

      // Quick Punch from Sparkle or Log Button
      const openPunch = () => {
        const todayStr = TimeEngine.formatDateISO(TimeEngine.getAnchorDate());
        this.openPunchModal(todayStr);
      };
      this.btnSparkleAction.addEventListener('click', openPunch);
      this.btnLogNewPunch.addEventListener('click', openPunch);

      // Punch modal live preview & dynamic punch block toggle
      const updatePreview = () => this.updatePunchPreview();
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
        if (this.editingRecordId && confirm('Delete this attendance entry?')) {
          this.data.records = this.data.records.filter((r) => r.id !== this.editingRecordId);
          Storage.save(this.data);
          this.closePunchModal();
          this.renderAll();
          this.showToast('Record deleted');
        }
      });

      this.btnClosePunchModal.addEventListener('click', () => this.closePunchModal());

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

      const anchor = TimeEngine.getAnchorDate();
      const year = anchor.getFullYear();
      const month = anchor.getMonth();
      const currentDay = anchor.getDate();
      const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
      const holidaysSet = new Set(this.data.holidays.map((h) => h.date));

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
        this.valTargetDesc.textContent = 'For a day of Compensatory-off.';
        this.valDaysRemaining.textContent = remainingWorkingDays;
      }
    }

    // ==========================================================================
    // TABULAR LOG: FUTURE DATES LIGHTER & FORENOON/AFTERNOON RECOGNITION
    // ==========================================================================
    renderLog() {
      if (!this.data) return;
      const anchor = TimeEngine.getAnchorDate();
      const todayISO = TimeEngine.formatDateISO(anchor);
      const curYear = anchor.getFullYear();
      const curMonth = anchor.getMonth();
      const daysInCurMonth = new Date(curYear, curMonth + 1, 0).getDate();

      // Collect records by date
      const recordMap = new Map();
      this.data.records.forEach((r) => recordMap.set(r.date, r));

      // Build consolidated set of dates: all logged records + all holidays in the month
      const datesSet = new Set();
      this.data.records.forEach((r) => datesSet.add(r.date));

      // Automatically include all Sundays, Second Saturdays, and Government Holidays in current month
      for (let d = 1; d <= daysInCurMonth; d++) {
        const iso = `${curYear}-${String(curMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (this.getHolidayName(iso)) {
          datesSet.add(iso);
        }
      }

      const sortedDates = Array.from(datesSet).sort((a, b) => b.localeCompare(a));
      this.logTableBody.innerHTML = '';

      if (sortedDates.length === 0) {
        this.logTableBody.innerHTML = `
          <tr class="table-empty-row">
            <td colspan="4">No attendance records logged yet.</td>
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

        let inDisplay = '--:--:--';
        let outDisplay = '--:--:--';

        if (rec && rec.inTime && rec.outTime) {
          if (rec.status === 'OD_HALF' || (rec.status === 'OD' && (rec.duration === 'FN' || rec.duration === 'AN'))) {
            const session = rec.duration || TimeEngine.identifySession(rec.inTime, rec.outTime);
            const tagClass = session === 'FN' ? 'tag-fn' : 'tag-an';
            inDisplay = `${rec.inTime} <span class="session-tag ${tagClass}">OD ${session}</span>`;
            outDisplay = rec.outTime;
          } else if (rec.status === 'CL_HALF' || (rec.status === 'CL' && (rec.duration === 'FN' || rec.duration === 'AN'))) {
            const session = rec.duration || TimeEngine.identifySession(rec.inTime, rec.outTime);
            const tagClass = session === 'FN' ? 'tag-fn' : 'tag-an';
            inDisplay = `${rec.inTime} <span class="session-tag ${tagClass}">Leave ${session}</span>`;
            outDisplay = rec.outTime;
          } else {
            if (holName) {
              inDisplay = `${rec.inTime} <span class="session-tag tag-fn">${holName}</span>`;
            } else {
              inDisplay = rec.inTime;
            }
            outDisplay = rec.outTime;
          }
        } else if (rec && rec.status === 'OD') {
          inDisplay = '<span class="cell-status-od">OD</span>';
          outDisplay = '--';
        } else if (rec && rec.status === 'CL') {
          inDisplay = '<span class="cell-status-leave">Leave</span>';
          outDisplay = '--';
        } else if (holName || (rec && rec.status === 'PH')) {
          const displayName = holName || 'Public Holiday';
          inDisplay = `<span class="cell-status-ph">${displayName}</span>`;
          outDisplay = '--';
        }

        const plannedIndicator = isFuture ? '<span class="tag-future-indicator">(Planned)</span>' : '';

        tr.innerHTML = `
          <td class="cell-date">${dateFormatted}${plannedIndicator}</td>
          <td class="cell-day">${dayName}</td>
          <td class="cell-time">${inDisplay}</td>
          <td class="cell-time">${outDisplay}</td>
        `;

        tr.addEventListener('click', () => this.openPunchModal(dateStr, rec ? rec.id : null));
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

    openPunchModal(dateStr, recordId = null) {
      this.editingRecordId = recordId;
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
      } else {
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

      const mock = {
        date: this.entryDate.value || '2026-11-23',
        status: effectiveStatus,
        duration: duration,
        inTime: this.entryInTime.value,
        outTime: this.entryOutTime.value,
        isHoliday: !!holName
      };
      const res = TimeEngine.calculateRecord(mock, this.data.shiftStart, this.data.shiftEnd);
      
      this.previewExtra.textContent = res.netExtraStr;
      if (res.netExtraSec > 0) {
        this.previewExtra.className = 'extra-positive-green';
      } else {
        this.previewExtra.className = 'extra-neutral';
      }
    }

    savePunchRecord() {
      const date = this.entryDate.value;
      const status = this.entryStatus.value;
      const duration = this.entryDuration.value;
      const inTime = this.entryInTime.value;
      const outTime = this.entryOutTime.value;

      if (!date) return;

      let effectiveStatus = status;
      if (status === 'OD') {
        effectiveStatus = (duration === 'FN' || duration === 'AN' || duration === 'HALF') ? 'OD_HALF' : 'OD';
      } else if (status === 'CL') {
        effectiveStatus = (duration === 'FN' || duration === 'AN' || duration === 'HALF') ? 'CL_HALF' : 'CL';
      } else {
        effectiveStatus = 'P';
      }

      const isFullODorLeave = (effectiveStatus === 'OD' || effectiveStatus === 'CL');

      let rec = this.data.records.find((r) => r.id === this.editingRecordId) || this.data.records.find((r) => r.date === date);

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

      Storage.save(this.data);
      this.closePunchModal();
      this.renderAll();
      this.showToast('Attendance saved');
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
    window.app = new AppController();
  });
})();
