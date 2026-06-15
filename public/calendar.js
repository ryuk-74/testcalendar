// ====== Jalali Calendar Functions ======
const jalaliMonths = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

function gregorianToJalali(gy, gm, gd) {
    const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    let jy = (gy <= 1600) ? 0 : 979;
    gy -= (gy <= 1600) ? 621 : 1600;
    const gy2 = (gm > 2) ? (gy + 1) : gy;
    let days = (365 * gy) + (Math.floor((gy2 + 3) / 4)) - (Math.floor((gy2 + 99) / 100)) + (Math.floor((gy2 + 399) / 400)) - 80 + gd + g_d_m[gm - 1];
    jy += 33 * (Math.floor(days / 12053));
    days %= 12053;
    jy += 4 * (Math.floor(days / 1461));
    days %= 1461;
    jy += Math.floor((days - 1) / 365);
    if (days > 365) days = (days - 1) % 365;
    const jm = (days < 186) ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
    const jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30));
    return [jy, jm, jd];
}

function jalaliToGregorian(jy, jm, jd) {
    let gy = (jy <= 979) ? 621 : 1600;
    jy -= (jy <= 979) ? 0 : 979;
    const days = (365 * jy) + ((Math.floor(jy / 33)) * 8) + (Math.floor(((jy % 33) + 3) / 4)) + 78 + jd + ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
    gy += 400 * (Math.floor(days / 146097));
    let d = days % 146097;
    if (d > 36524) {
        gy += 100 * (Math.floor(--d / 36524));
        d %= 36524;
        if (d >= 365) d++;
    }
    gy += 4 * (Math.floor(d / 1461));
    d %= 1461;
    gy += Math.floor((d - 1) / 365);
    if (d > 365) d = (d - 1) % 365;
    let gd = d + 1;
    const g_d_m = [0, 31, (((gy % 4 === 0) && (gy % 100 !== 0)) || (gy % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let gm = 0;
    for (gm = 0; gm < 13 && gd > g_d_m[gm]; gm++) gd -= g_d_m[gm];
    return [gy, gm, gd];
}

function getJalaliMonthDays(jy, jm) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    return isJalaliLeapYear(jy) ? 30 : 29;
}

function isJalaliLeapYear(jy) {
    return [1, 5, 9, 13, 17, 22, 26, 30].includes(jy % 33);
}

function getFirstDayOfMonth(jy, jm) {
    const [gy, gm, gd] = jalaliToGregorian(jy, jm, 1);
    const date = new Date(gy, gm - 1, gd);
    let day = date.getDay();
    return (day + 1) % 7;
}

function jalaliDateToTimestamp(dateStr, timeStr = '00:00') {
    const [jy, jm, jd] = dateStr.split('/').map(Number);
    const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
    const [hours, minutes] = timeStr.split(':').map(Number);
    return new Date(gy, gm - 1, gd, hours || 0, minutes || 0).getTime();
}

// ====== App State ======
let currentYear, currentMonth;
let tasks = [];
let goals = [];
let colorSettings = {};
let isDarkMode = localStorage.getItem('darkMode') === 'true';
// Set initial theme class immediately so toggle always starts from a clean known state
document.documentElement.classList.add(isDarkMode ? 'dark' : 'light');
document.documentElement.classList.remove(isDarkMode ? 'light' : 'dark');
let draggedTask = null;
let currentFileData = null;
let pendingPublishCheck = null;
let db = null;

// ====== IndexedDB Setup (Fallback) ======
const DB_NAME = 'ContentCalendarDB';
const DB_VERSION = 1;
const FILE_STORE = 'files';

async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (e) => {
            const database = e.target.result;
            if (!database.objectStoreNames.contains(FILE_STORE)) {
                database.createObjectStore(FILE_STORE, { keyPath: 'id' });
            }
        };
    });
}

async function saveFileToDB(id, file, data) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([FILE_STORE], 'readwrite');
        const store = transaction.objectStore(FILE_STORE);
        const record = {
            id: id,
            name: file.name,
            type: file.type,
            size: file.size,
            data: data,
            createdAt: Date.now()
        };
        const request = store.put(record);
        request.onsuccess = () => resolve(id);
        request.onerror = () => reject(request.error);
    });
}

async function getFileFromDB(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([FILE_STORE], 'readonly');
        const store = transaction.objectStore(FILE_STORE);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function deleteFileFromDB(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([FILE_STORE], 'readwrite');
        const store = transaction.objectStore(FILE_STORE);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function getAllFilesFromDB() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([FILE_STORE], 'readonly');
        const store = transaction.objectStore(FILE_STORE);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// ====== Initialize ======
async function init() {
    await initDB();
    
    tasks = JSON.parse(localStorage.getItem('contentCalendarTasks')) || [];
    await loadGoals();
    
    // Load color settings
    const colors = await getColorSettings();
    colorSettings = {};
    colors.forEach(color => {
        const key = color.platformType.replace(':', '-');
        colorSettings[color.platformType] = color;
        document.documentElement.style.setProperty(`--color-${key}`, isDarkMode ? color.darkColor : color.lightColor);
    });
    
    const today = new Date();
    const [jy, jm] = gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
    currentYear = jy;
    currentMonth = jm;
    
    if (isDarkMode) {
        document.documentElement.classList.remove('light');
        document.documentElement.classList.add('dark');
        document.getElementById('themeBtn').textContent = '☀️';
    }
    
    renderCalendar();
    setTimeout(() => checkPendingPublications(), 1000);
}

// ====== File Handling ======
function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('fileUploadZone').classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('fileUploadZone').classList.remove('dragover');
}

function handleFileDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('fileUploadZone').classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        processFile(files[0]);
    }
}

function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        processFile(files[0]);
    }
}

function processFile(file) {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        alert('فقط فایل‌های تصویری و ویدیویی مجاز هستند!');
        return;
    }
    
    const progressContainer = document.getElementById('uploadProgress');
    const progressBar = document.getElementById('uploadProgressBar');
    const progressText = document.getElementById('uploadProgressText');
    
    progressContainer.classList.remove('hidden');
    progressBar.style.width = '0%';
    progressText.textContent = 'در حال خواندن فایل...';
    
    const reader = new FileReader();
    
    reader.onprogress = (e) => {
        if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            progressBar.style.width = percent + '%';
            progressText.textContent = `در حال پردازش... ${percent}%`;
        }
    };
    
    reader.onload = (e) => {
        progressBar.style.width = '100%';
        progressText.textContent = 'آماده!';
        
        setTimeout(() => {
            progressContainer.classList.add('hidden');
        }, 500);
        
        currentFileData = {
            name: file.name,
            type: file.type,
            size: file.size,
            data: e.target.result
        };
        
        showFilePreview(currentFileData);
    };
    
    reader.onerror = () => {
        progressContainer.classList.add('hidden');
        alert('خطا در خواندن فایل!');
    };
    
    reader.readAsDataURL(file);
}

function showFilePreview(fileData) {
    const previewContainer = document.getElementById('filePreviewContainer');
    const previewEl = document.getElementById('filePreview');
    const nameEl = document.getElementById('fileName');
    const uploadPrompt = document.getElementById('fileUploadPrompt');
    
    if (fileData.type.startsWith('image/')) {
        previewEl.innerHTML = `<img src="${fileData.data}" class="file-preview mx-auto rounded-lg max-w-full">`;
    } else if (fileData.type.startsWith('video/')) {
        previewEl.innerHTML = `<video src="${fileData.data}" class="file-preview mx-auto rounded-lg max-w-full" controls></video>`;
    }
    
    const sizeDisplay = formatFileSize(fileData.size);
    nameEl.textContent = `${fileData.name} (${sizeDisplay})`;
    
    previewContainer.classList.remove('hidden');
    uploadPrompt.classList.add('hidden');
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function removeFile() {
    currentFileData = null;
    document.getElementById('filePreviewContainer').classList.add('hidden');
    document.getElementById('fileUploadPrompt').classList.remove('hidden');
    document.getElementById('taskFile').value = '';
    document.getElementById('taskFileId').value = '';
}

async function openFileViewer(fileId) {
    const file = await getFileFromDB(fileId);
    if (!file) {
        alert('فایل یافت نشد!');
        return;
    }
    
    let modal = document.getElementById('fileViewerModal');
    if (!modal) {
        const modalHTML = `
            <div id="fileViewerModal" class="fixed inset-0 bg-black/90 modal-overlay hidden items-center justify-center z-[60] p-4">
                <div class="relative w-full max-w-4xl max-h-[90vh]">
                    <button onclick="closeFileViewer()" class="absolute top-4 right-4 z-10 p-2 bg-white/20 hover:bg-white/40 rounded-full transition text-white text-xl">✕</button>
                    <div id="fileViewerContent" class="flex items-center justify-center"></div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        modal = document.getElementById('fileViewerModal');
    }
    
    const content = document.getElementById('fileViewerContent');
    
    if (file.type.startsWith('image/')) {
        content.innerHTML = `<img src="${file.data}" class="max-h-[85vh] max-w-full rounded-lg shadow-2xl">`;
    } else if (file.type.startsWith('video/')) {
        content.innerHTML = `<video src="${file.data}" class="max-h-[85vh] max-w-full rounded-lg shadow-2xl" controls autoplay></video>`;
    }
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeFileViewer() {
    const modal = document.getElementById('fileViewerModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        document.getElementById('fileViewerContent').innerHTML = '';
    }
}

// ====== Publish Confirmation System ======
async function checkPendingPublications() {
    const now = Date.now();
    const HOURS_48 = 48 * 60 * 60 * 1000;
    
    for (const task of tasks) {
        if (!task.fileId || task.fileDeleted || task.publishConfirmed) continue;
        if (task.status !== 'ready' && task.status !== 'published') continue;
        
        const taskTime = jalaliDateToTimestamp(task.date, task.time || '00:00');
        const timePassed = now - taskTime;
        
        if (timePassed >= HOURS_48) {
            pendingPublishCheck = task;
            showPublishConfirmModal(task);
            return;
        }
    }
}

function showPublishConfirmModal(task) {
    if (!document.getElementById('publishConfirmModal')) {
        const modalHTML = `
            <div id="publishConfirmModal" class="fixed inset-0 bg-black/50 modal-overlay hidden items-center justify-center z-50 p-4">
                <div class="secondary-bg rounded-2xl shadow-2xl w-full max-w-md">
                    <div class="p-6 text-center">
                        <span class="text-5xl mb-4 block">🎉</span>
                        <h3 class="text-lg font-bold mb-2">آیا این پست منتشر شده؟</h3>
                        <p id="publishTaskTitle" class="text-secondary-custom mb-4"></p>
                        <p class="text-sm text-secondary-custom mb-6">بیش از 48 ساعت از زمان انتشار گذشته است</p>
                        <div class="flex gap-3">
                            <button onclick="confirmPublished(true)" class="flex-1 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg transition">
                                ✅ بله، منتشر شده
                            </button>
                            <button onclick="confirmPublished(false)" class="flex-1 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition">
                                ⏳ هنوز نه
                            </button>
                        </div>
                        <button onclick="skipPublishConfirm()" class="mt-3 text-sm text-secondary-custom hover:underline">بعداً یادآوری کن</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }
    
    document.getElementById('publishTaskTitle').textContent = `"${task.title}" - ${task.date}`;
    const modal = document.getElementById('publishConfirmModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closePublishConfirmModal() {
    const modal = document.getElementById('publishConfirmModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

async function confirmPublished(isPublished) {
    if (!pendingPublishCheck) return;
    
    const task = tasks.find(t => t.id === pendingPublishCheck.id);
    if (task) {
        if (isPublished) {
            if (task.fileId) {
                await deleteFileFromDB(task.fileId);
            }
            task.status = 'published';
            task.publishConfirmed = true;
            task.fileDeleted = true;
            task.publishedAt = Date.now();
            saveTasks();
            renderCalendar();
        } else {
            task.lastCheckTime = Date.now();
        }
        saveTasks();
    }
    
    closePublishConfirmModal();
    pendingPublishCheck = null;
    
    setTimeout(() => checkPendingPublications(), 500);
}

function skipPublishConfirm() {
    if (pendingPublishCheck) {
        const task = tasks.find(t => t.id === pendingPublishCheck.id);
        if (task) {
            task.lastCheckTime = Date.now();
            saveTasks();
        }
    }
    closePublishConfirmModal();
    pendingPublishCheck = null;
}

// ====== Render Calendar ======
function renderCalendar() {
    // Copy mode banner
    let banner = document.getElementById('copyModeBanner');
    if (copiedTask) {
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'copyModeBanner';
            banner.className = 'fixed top-0 left-0 right-0 z-50 bg-green-500 text-white text-center py-2 text-sm font-medium flex items-center justify-center gap-3';
            banner.innerHTML = `<span>📋 حالت کپی فعال — روی هر روز کلیک کن تا رویداد «${copiedTask.title}» چسبانده شه</span><button onclick="cancelCopy()" class="bg-white text-green-600 px-3 py-0.5 rounded-full text-xs font-bold hover:bg-green-100">✕ لغو</button>`;
            document.body.prepend(banner);
        } else {
            banner.querySelector('span').textContent = `📋 حالت کپی فعال — روی هر روز کلیک کن تا رویداد «${copiedTask.title}» چسبانده شه`;
        }
    } else {
        if (banner) banner.remove();
    }
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';
    
    document.getElementById('currentMonth').textContent = `${jalaliMonths[currentMonth - 1]} ${currentYear}`;
    
    const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
    const daysInMonth = getJalaliMonthDays(currentYear, currentMonth);
    const today = new Date();
    const [todayJy, todayJm, todayJd] = gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
    
    for (let i = 0; i < firstDay; i++) {
        const cell = document.createElement('div');
        cell.className = 'day-cell border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30';
        grid.appendChild(cell);
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        const dateStr = `${currentYear}/${String(currentMonth).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
        const isToday = todayJy === currentYear && todayJm === currentMonth && todayJd === day;
        const isFriday = (firstDay + day - 1) % 7 === 6;
        
        cell.className = `day-cell border border-gray-200 dark:border-gray-700 p-1 md:p-2 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition relative ${isToday ? 'bg-indigo-100 dark:bg-indigo-900/40' : ''} flex flex-col`;
        cell.dataset.date = dateStr;
        
        cell.ondragover = (e) => e.preventDefault();
        cell.ondrop = (e) => handleDrop(e, dateStr);
        cell.onclick = () => copiedTask ? pasteTask(dateStr) : openTaskModal(dateStr);
        cell.oncontextmenu = (e) => { e.preventDefault(); if (copiedTask) pasteTask(dateStr); };
        
        const dayTasks = getFilteredTasks().filter(t => t.date === dateStr);        const hasFileTask = dayTasks.some(t => t.fileId && !t.fileDeleted);
        
        const header = document.createElement('div');
        header.className = 'flex justify-between items-start mb-1 flex-shrink-0';
        header.innerHTML = `
            <span class="text-sm font-medium ${isToday ? 'bg-indigo-500 text-white w-6 h-6 rounded-full flex items-center justify-center' : ''} ${isFriday ? 'text-red-500' : ''}">${day}</span>
            <div class="flex items-center gap-1">
                ${hasFileTask ? '<span class="text-xs">📎</span>' : ''}
                ${copiedTask ? `<button onclick="event.stopPropagation(); pasteTask('${dateStr}')" class="text-xs bg-green-500 text-white px-1 rounded hover:bg-green-600" title="چسباندن">📋</button>` : ''}
                ${dayTasks.length > 0 ? `<span class="text-xs bg-indigo-500 text-white px-1.5 rounded-full">${dayTasks.length}</span>` : ''}
            </div>
        `;
        cell.appendChild(header);
        
        const taskContainer = document.createElement('div');
        taskContainer.className = 'task-scroll-container scrollbar-thin space-y-1 flex-1';
        taskContainer.onclick = (e) => e.stopPropagation();
        
        dayTasks.forEach(task => {
            const taskEl = document.createElement('div');
            taskEl.draggable = true;
            taskEl.ondragstart = (e) => handleDragStart(e, task.id);
            taskEl.onclick = (e) => { e.stopPropagation(); openTaskDetail(task.id); };
            taskEl.className = `task-item text-xs p-1 md:p-1.5 rounded cursor-pointer platform-${task.platform} type-${task.type} truncate relative ${task.fileId && !task.fileDeleted ? 'has-file' : ''}`;
            
            // Set CSS custom property for dynamic color
            const colorKey = `${task.platform}-${task.type}`;
            taskEl.style.setProperty('--task-color', `var(--color-${colorKey})`);
            
            taskEl.innerHTML = `${getTypeEmoji(task.type, task.platform)} ${task.title}`;
            taskContainer.appendChild(taskEl);
        });
        
        cell.appendChild(taskContainer);
        grid.appendChild(cell);
    }
}

function getFilteredTasks() {
    const platform = document.getElementById('filterPlatform').value;
    const status = document.getElementById('filterStatus').value;
    const type = document.getElementById('filterType').value;
    
    return tasks.filter(t => {
        if (platform !== 'all' && t.platform !== platform) return false;
        if (status !== 'all' && t.status !== status) return false;
        if (type !== 'all' && t.type !== type) return false;
        return true;
    });
}

function getTypeEmoji(type, platform) {
    const typeLabels = { post: 'پست', story: 'استوری', reels: 'ریلز' };
    const iconMap = {
        instagram: 'icons/instagram.svg',
        website:   'icons/website.svg',
        messenger: 'icons/telegram.svg'
    };
    const icon = (platform && iconMap[platform])
        ? `<img src="${iconMap[platform]}" class="inline w-4 h-4" style="vertical-align:-2px"> `
        : '';
    return icon + (typeLabels[type] || type);
}

function getStatusLabel(status) {
    const labels = { idea: 'ایده', writing: 'در حال نوشتن', ready: 'آماده انتشار', published: 'منتشر شده' };
    return labels[status] || status;
}

function getPlatformLabel(platform) {
  const labels = {
    instagram: '<img src="icons/instagram.svg" class="inline w-4 h-4 mr-1"> اینستاگرام',
    website:   '<img src="icons/website.svg"   class="inline w-4 h-4 mr-1"> وبسایت',
    messenger: '<img src="icons/telegram.svg"  class="inline w-4 h-4 mr-1"> کانال پیام‌رسان'
  };
  return labels[platform] || platform;
}
/*
function getPlatformLabel(platform) {
    const labels = { instagram: 'اینستاگرام', website: 'وبسایت', messenger: 'کانال پیام‌رسان' };
    return labels[platform] || platform;
};
*/
// Types available per platform
const PLATFORM_TYPES = {
    instagram: [
        { value: 'post',    label: '<img src="icons/instagram.svg" class="inline w-4 h-4 mr-1"> پست' },
        { value: 'story',   label: '<img src="icons/instagram.svg" class="inline w-4 h-4 mr-1"> استوری' },
        { value: 'reels',   label: '<img src="icons/instagram.svg" class="inline w-4 h-4 mr-1"> ریلز' }
    ],
    website: [
        { value: 'post',    label: '<img src="icons/website.svg" class="inline w-4 h-4 mr-1"> پست' }
    ],
    messenger: [
        { value: 'post',    label: '<img src="icons/telegram.svg"  class="inline w-4 h-4 mr-1"> پست' }
    ]
};

function updateTypeOptions() {
    const selected = [...document.querySelectorAll('input[name="platform"]:checked')].map(c => c.value);
    const container = document.getElementById('typeCheckboxes');
    if (!container) return;

    if (selected.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-400 dark:text-gray-500">ابتدا پلتفرم را انتخاب کنید</p>';
        return;
    }

    // Gather unique types across all selected platforms
    const seen = new Set();
    const allTypes = [];
    selected.forEach(p => {
        (PLATFORM_TYPES[p] || []).forEach(t => {
            if (!seen.has(t.value)) {
                seen.add(t.value);
                allTypes.push(t);
            }
        });
    });

    container.innerHTML = allTypes.map(t => `
        <label class="flex items-center gap-1.5 cursor-pointer px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 has-[:checked]:bg-purple-500 has-[:checked]:text-white has-[:checked]:border-purple-500 transition text-sm">
            <input type="checkbox" name="contentType" value="${t.value}" class="hidden"> ${t.label}
        </label>
    `).join('');
}

// Copy/paste clipboard
let copiedTask = null;

function copyTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    copiedTask = { ...task };
    showToast('📋 رویداد کپی شد — برای لغو Escape بزن یا دوباره 📋 بزن');
    renderCalendar();
}

function cancelCopy() {
    copiedTask = null;
    renderCalendar();
}

function pasteTask(date) {
    if (!copiedTask) { showToast('هیچ رویدادی کپی نشده'); return; }
    const newTask = {
        ...copiedTask,
        id: Date.now().toString(),
        date: date || copiedTask.date,
        publishConfirmed: false,
        publishedAt: null,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    if (window.saveTaskToServer) {
        window.saveTaskToServer(newTask).then(() => renderCalendar());
    } else {
        tasks.push(newTask);
        saveTasks();
        renderCalendar();
    }
    showToast('✅ رویداد چسبانده شد');
}

// ====== Navigation ======
function prevMonth() {
    currentMonth--;
    if (currentMonth < 1) {
        currentMonth = 12;
        currentYear--;
    }
    renderCalendar();
}

function nextMonth() {
    currentMonth++;
    if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
    }
    renderCalendar();
}

function goToToday() {
    const today = new Date();
    const [jy, jm] = gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
    currentYear = jy;
    currentMonth = jm;
    renderCalendar();
}

// ====== Drag & Drop ======
function handleDragStart(e, taskId) {
    draggedTask = taskId;
    e.dataTransfer.effectAllowed = 'move';
}

function handleDrop(e, newDate) {
    e.preventDefault();
    if (draggedTask) {
        const task = tasks.find(t => t.id === draggedTask);
        if (task) {
            task.date = newDate;
            saveTasks();
            renderCalendar();
        }
        draggedTask = null;
    }
}

// ====== Task Modal ======
function openTaskModal(date = null) {
    document.getElementById('taskModal').classList.remove('hidden');
    document.getElementById('taskModal').classList.add('flex');
    document.getElementById('modalTitle').textContent = 'افزودن کار جدید';
    document.getElementById('taskForm').reset();
    document.getElementById('taskId').value = '';
    document.getElementById('taskFileId').value = '';
    document.getElementById('checklistContainer').innerHTML = '';
    document.getElementById('uploadProgress').classList.add('hidden');
    
    // Reset platform & type checkboxes
    document.querySelectorAll('input[name="platform"]').forEach(c => c.checked = false);
    updateTypeOptions();
    if (document.getElementById('platformError')) document.getElementById('platformError').classList.add('hidden');
    if (document.getElementById('typeError')) document.getElementById('typeError').classList.add('hidden');

    currentFileData = null;
    document.getElementById('filePreviewContainer').classList.add('hidden');
    document.getElementById('fileUploadPrompt').classList.remove('hidden');
    
    if (date) {
        document.getElementById('taskDate').value = date;
    } else {
        const today = new Date();
        const [jy, jm, jd] = gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
        document.getElementById('taskDate').value = `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
    }
}

function closeTaskModal() {
    document.getElementById('taskModal').classList.add('hidden');
    document.getElementById('taskModal').classList.remove('flex');
    currentFileData = null;
}

function addChecklistItem(text = '', checked = false) {
    const container = document.getElementById('checklistContainer');
    const item = document.createElement('div');
    item.className = 'flex items-center gap-2';
    item.innerHTML = `
        <input type="checkbox" ${checked ? 'checked' : ''} class="checklist-check w-4 h-4 rounded">
        <input type="text" value="${text}" placeholder="آیتم چک‌لیست" class="checklist-text flex-1 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800">
        <button type="button" onclick="this.parentElement.remove()" class="text-red-500 hover:text-red-700 text-sm">✕</button>
    `;
    container.appendChild(item);
}

async function saveTask(e) {
    e.preventDefault();
    
    const selectedPlatforms = [...document.querySelectorAll('input[name="platform"]:checked')].map(c => c.value);
    const selectedTypes = [...document.querySelectorAll('input[name="contentType"]:checked')].map(c => c.value);

    // Validation
    const platformError = document.getElementById('platformError');
    const typeError = document.getElementById('typeError');
    let valid = true;

    if (selectedPlatforms.length === 0) {
        if (platformError) platformError.classList.remove('hidden');
        valid = false;
    } else {
        if (platformError) platformError.classList.add('hidden');
    }
    if (selectedTypes.length === 0) {
        if (typeError) typeError.classList.remove('hidden');
        valid = false;
    } else {
        if (typeError) typeError.classList.add('hidden');
    }
    if (!valid) return;

    const checklist = [];
    document.querySelectorAll('#checklistContainer > div').forEach(item => {
        const text = item.querySelector('.checklist-text').value.trim();
        if (text) checklist.push({ text, checked: item.querySelector('.checklist-check').checked });
    });
    
    let fileId = document.getElementById('taskFileId').value || null;
    if (currentFileData) {
        fileId = 'file_' + Date.now();
        await saveFileToDB(fileId, { 
            name: currentFileData.name, type: currentFileData.type, size: currentFileData.size 
        }, currentFileData.data);
    }

    const existingId = document.getElementById('taskId').value;
    const isEdit = !!existingId;

    const baseData = {
        title: document.getElementById('taskTitle').value,
        date: document.getElementById('taskDate').value,
        time: document.getElementById('taskTime').value,
        status: document.getElementById('taskStatus').value,
        tags: document.getElementById('taskTags').value.split(',').map(t => t.trim()).filter(t => t),
        note: document.getElementById('taskNote').value,
        checklist,
        fileId,
        fileDeleted: false,
        publishConfirmed: false
    };

    if (isEdit) {
        // Single task edit — preserve platform & type from existing
        const existingTask = tasks.find(t => t.id === existingId);
        const taskData = {
            ...baseData,
            id: existingId,
            platform: selectedPlatforms[0],
            type: selectedTypes[0],
            publishConfirmed: existingTask?.publishConfirmed || false,
            fileDeleted: existingTask?.fileDeleted || false
        };
        if (!fileId && existingTask?.fileId) taskData.fileId = existingTask.fileId;

        if (window.saveTaskToServer) {
            await window.saveTaskToServer(taskData);
        } else {
            const index = tasks.findIndex(t => t.id === existingId);
            if (index >= 0) tasks[index] = taskData; else tasks.push(taskData);
            saveTasks();
        }
    } else {
        // Multi-create: one task per platform × type combination (filtered by PLATFORM_TYPES)
        const combos = [];
        selectedPlatforms.forEach(platform => {
            const validTypes = (PLATFORM_TYPES[platform] || []).map(t => t.value);
            selectedTypes.forEach(type => {
                if (validTypes.includes(type)) combos.push({ platform, type });
            });
        });

        for (const combo of combos) {
            const taskData = {
                ...baseData,
                id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
                platform: combo.platform,
                type: combo.type
            };
            if (window.saveTaskToServer) {
                await window.saveTaskToServer(taskData);
            } else {
                tasks.push(taskData);
            }
        }
        if (!window.saveTaskToServer) saveTasks();

        if (combos.length > 1) showToast(`✅ ${combos.length} رویداد ایجاد شد`);
    }
    
    closeTaskModal();
    renderCalendar();
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('taskForm');
    if (form) {
        form.onsubmit = saveTask;
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && copiedTask) {
            cancelCopy();
        }
    });
});

// ====== Task Detail Modal ======
async function openTaskDetail(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    let modal = document.getElementById('taskDetailModal');
    if (!modal) {
        const modalHTML = `
            <div id="taskDetailModal" class="fixed inset-0 bg-black/50 modal-overlay hidden items-center justify-center z-50 p-4">
                <div class="secondary-bg rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin">
                    <div class="p-4" id="taskDetailContent"></div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        modal = document.getElementById('taskDetailModal');
    }
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    let filePreviewHTML = '';
    if (task.fileId && !task.fileDeleted) {
        const file = await getFileFromDB(task.fileId);
        if (file) {
            if (file.type.startsWith('image/')) {
                filePreviewHTML = `
                    <div class="mb-4">
                        <span class="text-secondary-custom text-sm block mb-2">📎 فایل پیوست:</span>
                        <img src="${file.data}" class="w-full max-h-48 object-cover rounded-lg cursor-pointer hover:opacity-90 transition" 
                             onclick="openFileViewer('${task.fileId}')">
                        <p class="text-xs text-secondary-custom mt-1">${file.name} (${formatFileSize(file.size)})</p>
                    </div>
                `;
            } else if (file.type.startsWith('video/')) {
                filePreviewHTML = `
                    <div class="mb-4">
                        <span class="text-secondary-custom text-sm block mb-2">📎 فایل پیوست:</span>
                        <video src="${file.data}" class="w-full max-h-48 rounded-lg" controls></video>
                        <p class="text-xs text-secondary-custom mt-1">${file.name} (${formatFileSize(file.size)})</p>
                        <button onclick="openFileViewer('${task.fileId}')" class="text-sm text-indigo-500 hover:underline mt-1">🔍 نمایش تمام صفحه</button>
                    </div>
                `;
            }
        }
    } else if (task.fileDeleted) {
        filePreviewHTML = `
            <div class="mb-4 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm text-secondary-custom">
                📎 فایل پس از انتشار حذف شده است
            </div>
        `;
    }
    
    document.getElementById('taskDetailContent').innerHTML = `
        <div class="flex items-start justify-between mb-4">
            <h3 class="text-lg font-bold">${getTypeEmoji(task.type, task.platform)} ${task.title}</h3>
            <button onclick="closeTaskDetail()" class="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition">✕</button>
        </div>
        
        ${filePreviewHTML}
        
        <div class="space-y-3 mb-4">
            <div class="flex items-center gap-2 text-sm">
                <span class="text-secondary-custom">📅 تاریخ:</span>
                <span>${task.date}</span>
                ${task.time ? `<span class="text-secondary-custom">⏰</span><span>${task.time}</span>` : ''}
            </div>
            <div class="flex items-center gap-2 text-sm">
                <span class="text-secondary-custom">📱 پلتفرم:</span>
                <span class="px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300">${getPlatformLabel(task.platform)}</span>
            </div>
            <div class="flex items-center gap-2 text-sm">
                <span class="text-secondary-custom">📊 وضعیت:</span>
                <span class="px-2 py-0.5 rounded bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-300">${getStatusLabel(task.status)}</span>
            </div>
            ${task.tags && task.tags.length > 0 ? `
                <div class="flex items-center gap-2 text-sm flex-wrap">
                    <span class="text-secondary-custom">🏷️ برچسب‌ها:</span>
                    ${task.tags.map(tag => `<span class="px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-300 text-xs">#${tag}</span>`).join('')}
                </div>
            ` : ''}
            ${task.note ? `
                <div class="text-sm">
                    <span class="text-secondary-custom">📝 یادداشت:</span>
                    <p class="mt-1 p-2 rounded bg-gray-100 dark:bg-gray-800">${task.note}</p>
                </div>
            ` : ''}
            ${task.checklist && task.checklist.length > 0 ? `
                <div class="text-sm">
                    <span class="text-secondary-custom">✅ چک‌لیست:</span>
                    <div class="mt-1 space-y-1">
                        ${task.checklist.map((item, i) => `
                            <label class="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" ${item.checked ? 'checked' : ''} onchange="toggleChecklistItem('${task.id}', ${i})" class="w-4 h-4 rounded">
                                <span class="${item.checked ? 'line-through text-secondary-custom' : ''}">${item.text}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
        
        <div class="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button onclick="copyTask('${task.id}')" class="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition">📋</button>
            <button onclick="editTask('${task.id}')" class="flex-1 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition">✏️ ویرایش</button>
            ${task.fileId && !task.fileDeleted ? `<button onclick="downloadTaskFile('${task.id}')" class="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition">📥</button>` : ''}
            <button onclick="deleteTask('${task.id}')" class="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition">🗑️</button>
        </div>
    `;
}

function closeTaskDetail() {
    const modal = document.getElementById('taskDetailModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function toggleChecklistItem(taskId, index) {
    const task = tasks.find(t => t.id === taskId);
    if (task && task.checklist[index]) {
        task.checklist[index].checked = !task.checklist[index].checked;
        saveTasks();
    }
}

async function editTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    closeTaskDetail();
    
    document.getElementById('taskModal').classList.remove('hidden');
    document.getElementById('taskModal').classList.add('flex');
    document.getElementById('modalTitle').textContent = 'ویرایش کار';
    
    document.getElementById('taskId').value = task.id;
    document.getElementById('taskTitle').value = task.title;
    document.getElementById('taskDate').value = task.date;
    document.getElementById('taskTime').value = task.time || '';
    document.getElementById('taskStatus').value = task.status;
    document.getElementById('taskTags').value = (task.tags || []).join('، ');
    document.getElementById('taskNote').value = task.note || '';
    document.getElementById('taskFileId').value = task.fileId || '';

    // Set platform checkbox
    document.querySelectorAll('input[name="platform"]').forEach(c => {
        c.checked = c.value === task.platform;
    });
    updateTypeOptions();
    // Set type checkbox after options rendered
    setTimeout(() => {
        document.querySelectorAll('input[name="contentType"]').forEach(c => {
            c.checked = c.value === task.type;
        });
    }, 0);
    
    currentFileData = null;
    if (task.fileId && !task.fileDeleted) {
        const file = await getFileFromDB(task.fileId);
        if (file) {
            showFilePreview({ name: file.name, type: file.type, size: file.size, data: file.data });
        }
    } else {
        document.getElementById('filePreviewContainer').classList.add('hidden');
        document.getElementById('fileUploadPrompt').classList.remove('hidden');
    }
    
    document.getElementById('checklistContainer').innerHTML = '';
    if (task.checklist) {
        task.checklist.forEach(item => addChecklistItem(item.text, item.checked));
    }
}

async function deleteTask(taskId) {
    if (confirm('آیا از حذف این کار مطمئن هستید؟')) {
        if (window.deleteTaskFromServer) {
            await window.deleteTaskFromServer(taskId);
        } else {
            const task = tasks.find(t => t.id === taskId);
            if (task && task.fileId) {
                await deleteFileFromDB(task.fileId);
            }
            tasks = tasks.filter(t => t.id !== taskId);
            saveTasks();
        }
        closeTaskDetail();
        renderCalendar();
    }
}

async function downloadTaskFile(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !task.fileId) return;
    
    const file = await getFileFromDB(task.fileId);
    if (!file) {
        alert('فایل یافت نشد!');
        return;
    }
    
    const link = document.createElement('a');
    link.href = file.data;
    link.download = file.name;
    link.click();
}

// ====== Search Modal ======
function openSearchModal() {
    let modal = document.getElementById('searchModal');
    if (!modal) {
        const modalHTML = `
            <div id="searchModal" class="fixed inset-0 bg-black/50 modal-overlay hidden items-center justify-center z-50 p-4">
                <div class="secondary-bg rounded-2xl shadow-2xl w-full max-w-lg">
                    <div class="p-4 border-b border-gray-200 dark:border-gray-700">
                        <input type="text" id="searchInput" oninput="performSearch()" placeholder="جستجو در کارها..." class="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none text-lg">
                    </div>
                    <div id="searchResults" class="max-h-96 overflow-y-auto scrollbar-thin p-4"></div>
                    <div class="p-4 border-t border-gray-200 dark:border-gray-700">
                        <button onclick="closeSearchModal()" class="w-full py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">بستن</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        modal = document.getElementById('searchModal');
    }
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.getElementById('searchInput').value = '';
    document.getElementById('searchResults').innerHTML = '<p class="text-center text-secondary-custom">عبارت مورد نظر را جستجو کنید</p>';
    document.getElementById('searchInput').focus();
}

function closeSearchModal() {
    const modal = document.getElementById('searchModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function performSearch() {
    const query = document.getElementById('searchInput').value.trim().toLowerCase();
    const results = document.getElementById('searchResults');
    
    if (!query) {
        results.innerHTML = '<p class="text-center text-secondary-custom">عبارت مورد نظر را جستجو کنید</p>';
        return;
    }
    
    const found = tasks.filter(t => 
        t.title.toLowerCase().includes(query) ||
        (t.note && t.note.toLowerCase().includes(query)) ||
        (t.tags && t.tags.some(tag => tag.toLowerCase().includes(query)))
    );
    
    if (found.length === 0) {
        results.innerHTML = '<p class="text-center text-secondary-custom">نتیجه‌ای یافت نشد</p>';
        return;
    }
    
    results.innerHTML = found.map(task => `
        <div onclick="closeSearchModal(); openTaskDetail('${task.id}')" class="p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer mb-2 border border-gray-200 dark:border-gray-700">
            <div class="font-medium">${getTypeEmoji(task.type, task.platform)} ${task.title} ${task.fileId && !task.fileDeleted ? '📎' : ''}</div>
            <div class="text-sm text-secondary-custom">${task.date} | ${getPlatformLabel(task.platform)}</div>
        </div>
    `).join('');
}

// ====== Goals Functions ======

const SEASONS = {
  spring: { label: 'بهار', months: [1, 2, 3] },
  summer: { label: 'تابستان', months: [4, 5, 6] },
  autumn: { label: 'پاییز', months: [7, 8, 9] },
  winter: { label: 'زمستان', months: [10, 11, 12] }
};

const GOAL_TYPES = {
  instagram: [
    { key: 'post_reels', label: 'پست + ریلز (تجمیعی)', types: ['post', 'reels'] },
    { key: 'story', label: 'استوری', types: ['story'] }
  ],
  website: [
    { key: 'post', label: 'پست', types: ['post'] }
  ],
  messenger: [
    { key: 'post', label: 'پست کانال', types: ['post'] }
  ]
};

function getCurrentSeason(month) {
  for (const [key, val] of Object.entries(SEASONS)) {
    if (val.months.includes(month)) return key;
  }
  return 'spring';
}

function getSeasonMonths(season, year) {
  return SEASONS[season].months.map(m => `${year}/${String(m).padStart(2, '0')}`);
}

async function loadGoals() {
  try {
    goals = await getGoalsFromServer();
  } catch(e) {
    goals = JSON.parse(localStorage.getItem('contentCalendarGoals') || '[]');
  }
}

async function loadColorSettings() {
  try {
    const colors = await getColorSettings();
    if (!colors || colors.length === 0) {
      // Use defaults if no colors from server
      applyDefaultColors();
      return;
    }
    
    colorSettings = {};
    colors.forEach(color => {
      const isDark = isDarkMode;
      const colorValue = isDark ? color.darkColor : color.lightColor;
      const key = color.platformType.replace(':', '-');
      colorSettings[color.platformType] = color;
      document.documentElement.style.setProperty(`--color-${key}`, colorValue);
    });
    console.log('✅ رنگ‌های بارگذاری شدند');
  } catch(e) {
    console.warn('خطا در بارگذاری رنگ‌ها، استفاده از پیش‌فرض‌ها:', e);
    applyDefaultColors();
  }
}

function applyDefaultColors() {
  const defaults = {
    'instagram-post':  { light: '#b298dc', dark: '#a663cc' },
    'instagram-reels': { light: '#9b6fd6', dark: '#8e4eb8' },
    'instagram-story': { light: '#c9b3e8', dark: '#c084e0' },
    'website-post':    { light: '#90a955', dark: '#4f772d' },
    'messenger-post':  { light: '#00a6fb', dark: '#006494' }
  };
  
  Object.entries(defaults).forEach(([key, colors]) => {
    const colorValue = isDarkMode ? colors.dark : colors.light;
    document.documentElement.style.setProperty(`--color-${key}`, colorValue);
  });
  console.log('✅ رنگ‌های پیش‌فرض اعمال شدند');
}

async function saveGoal(platform, contentType, season, targetCount) {
  const id = `${platform}_${contentType}_${season}`;
  const goal = { id, platform, contentType, season, targetCount: parseInt(targetCount) || 0 };
  
  try {
    if (window.apiRequest) {
      await window.apiRequest('/goals', { method: 'POST', body: JSON.stringify(goal) });
    }
  } catch(e) {}
  
  // Update local
  const idx = goals.findIndex(g => g.id === id);
  if (idx >= 0) goals[idx] = goal;
  else goals.push(goal);
  localStorage.setItem('contentCalendarGoals', JSON.stringify(goals));
}

function getGoal(platform, contentType, season) {
  const g = goals.find(g => g.platform === platform && g.contentType === contentType && g.season === season);
  return g ? g.targetCount : 0;
}

function getActualCount(platform, contentTypeKey, season, year) {
  const typeConfig = GOAL_TYPES[platform]?.find(t => t.key === contentTypeKey);
  if (!typeConfig) return 0;
  
  const months = getSeasonMonths(season, year);
  return tasks.filter(t => {
    const matchPlatform = t.platform === platform || (platform !== 'both' && t.platform === 'both');
    const matchType = typeConfig.types.includes(t.type);
    const matchDate = months.some(m => t.date.startsWith(m));
    return matchPlatform && matchType && matchDate;
  }).length;
}

// ====== Goals Settings Modal ======
async function openGoalsModal() {
  let modal = document.getElementById('goalsModal');
  if (!modal) {
    const modalHTML = `
      <div id="goalsModal" class="fixed inset-0 bg-black/50 modal-overlay hidden items-center justify-center z-50 p-4">
        <div class="secondary-bg rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <div class="sticky top-0 secondary-bg border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
            <h3 class="text-lg font-bold">🎯 تنظیم اهداف محتوایی</h3>
            <button onclick="closeGoalsModal()" class="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition">✕</button>
          </div>
          <div class="p-4 border-b border-gray-200 dark:border-gray-700">
            <div class="flex gap-2 flex-wrap">
              ${Object.entries(SEASONS).map(([k,v]) => `
                <button onclick="switchGoalSeason('${k}')" id="goalSeasonBtn_${k}" 
                  class="px-4 py-2 rounded-lg text-sm font-medium transition border border-gray-300 dark:border-gray-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30">
                  ${v.label}
                </button>
              `).join('')}
            </div>
          </div>
          <div id="goalsContent" class="p-4 overflow-y-auto scrollbar-thin flex-1"></div>
          <div class="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
            <button onclick="saveAllGoals()" class="flex-1 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:opacity-90 transition font-medium">💾 ذخیره اهداف</button>
            <button onclick="closeGoalsModal()" class="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">انصراف</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    modal = document.getElementById('goalsModal');
  }
  
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  
  const currentSeason = getCurrentSeason(currentMonth);
  switchGoalSeason(currentSeason);
}

let activeGoalSeason = 'spring';

function switchGoalSeason(season) {
  activeGoalSeason = season;
  
  // Update button styles
  Object.keys(SEASONS).forEach(s => {
    const btn = document.getElementById(`goalSeasonBtn_${s}`);
    if (btn) {
      if (s === season) {
        btn.className = 'px-4 py-2 rounded-lg text-sm font-medium transition bg-indigo-500 text-white';
      } else {
        btn.className = 'px-4 py-2 rounded-lg text-sm font-medium transition border border-gray-300 dark:border-gray-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30';
      }
    }
  });
  
  renderGoalsContent(season);
}

function renderGoalsContent(season) {
  const content = document.getElementById('goalsContent');
  if (!content) return;
  
  const platforms = [
    { key: 'instagram', label: '<img src="icons/instagram.svg" class="inline w-4 h-4 mr-1"> اینستاگرام', color: 'pink' },
    { key: 'website', label: '<img src="icons/website.svg"   class="inline w-4 h-4 mr-1"> وبسایت', color: 'blue' },
    { key: 'messenger', label: '<img src="icons/telegram.svg"  class="inline w-4 h-4 mr-1"> کانال پیام‌رسان', color: 'green' }
  ];
  
  const colorMap = {
    pink: 'bg-pink-50 dark:bg-pink-900/20 border-pink-200 dark:border-pink-800',
    blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    green: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
  };
  
  content.innerHTML = `
    <div class="space-y-6">
      <p class="text-sm text-secondary-custom text-center">اهداف فصل <strong>${SEASONS[season].label}</strong> را وارد کنید (ماه‌های ${SEASONS[season].months.join('، ')})</p>
      ${platforms.map(p => `
        <div class="rounded-xl border p-4 ${colorMap[p.color]}">
          <h4 class="font-bold mb-3">${p.label}</h4>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            ${(GOAL_TYPES[p.key] || []).map(t => {
              const current = getGoal(p.key, t.key, season);
              const actual = getActualCount(p.key, t.key, season, currentYear);
              return `
                <div class="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                  <label class="block text-sm font-medium mb-2">${t.label}</label>
                  <div class="flex items-center gap-2">
                    <input type="number" min="0" 
                      id="goal_${p.key}_${t.key}_${season}"
                      value="${current}"
                      class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none text-center text-lg font-bold"
                      placeholder="0">
                  </div>
                  <p class="text-xs text-secondary-custom mt-2 text-center">تاکنون: <span class="font-bold text-indigo-500">${actual}</span> عدد</p>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

async function saveAllGoals() {
  const platforms = ['instagram', 'website', 'messenger'];
  
  for (const platform of platforms) {
    for (const type of (GOAL_TYPES[platform] || [])) {
      const input = document.getElementById(`goal_${platform}_${type.key}_${activeGoalSeason}`);
      if (input) {
        await saveGoal(platform, type.key, activeGoalSeason, input.value);
      }
    }
  }
  
  showToast('✅ اهداف ذخیره شدند');
  closeGoalsModal();
}

function closeGoalsModal() {
  const modal = document.getElementById('goalsModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 50%; transform: translateX(50%);
    background: #1e293b; color: white; padding: 12px 24px; border-radius: 30px;
    font-size: 14px; z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    animation: slideUp 0.3s ease;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// ====== Stats Modal ======
function openStatsModal() {
    let modal = document.getElementById('statsModal');
    if (!modal) {
        const modalHTML = `
            <div id="statsModal" class="fixed inset-0 bg-black/50 modal-overlay hidden items-center justify-center z-50 p-4">
                <div class="secondary-bg rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                    <div class="sticky top-0 secondary-bg border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
                        <h3 class="text-lg font-bold">📊 آمار و اهداف محتوا</h3>
                        <button onclick="closeStatsModal()" class="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition">✕</button>
                    </div>
                    <div class="p-3 border-b border-gray-200 dark:border-gray-700 flex gap-2 flex-wrap">
                      <button onclick="switchStatsSeason('current')" id="statsBtnCurrent" class="px-3 py-1.5 rounded-lg text-sm font-medium transition bg-indigo-500 text-white">این فصل</button>
                      ${Object.entries(SEASONS).map(([k,v]) => `
                        <button onclick="switchStatsSeason('${k}')" id="statsBtn_${k}" class="px-3 py-1.5 rounded-lg text-sm font-medium transition border border-gray-300 dark:border-gray-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30">${v.label}</button>
                      `).join('')}
                    </div>
                    <div id="statsContent" class="p-4 overflow-y-auto scrollbar-thin flex-1"></div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        modal = document.getElementById('statsModal');
    }
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    switchStatsSeason('current');
}

let activeStatsSeason = 'current';

function switchStatsSeason(seasonKey) {
  activeStatsSeason = seasonKey;
  const season = seasonKey === 'current' ? getCurrentSeason(currentMonth) : seasonKey;
  
  // Update buttons
  ['current', ...Object.keys(SEASONS)].forEach(k => {
    const btn = document.getElementById(k === 'current' ? 'statsBtnCurrent' : `statsBtn_${k}`);
    if (btn) {
      if (k === seasonKey) {
        btn.className = 'px-3 py-1.5 rounded-lg text-sm font-medium transition bg-indigo-500 text-white';
      } else {
        btn.className = 'px-3 py-1.5 rounded-lg text-sm font-medium transition border border-gray-300 dark:border-gray-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30';
      }
    }
  });
  
  renderStatsContent(season);
}

function renderStatsContent(season) {
    const content = document.getElementById('statsContent');
    if (!content) return;
    
    const seasonTasks = tasks.filter(t => t.date.includes(`${currentYear}/`) && getSeasonMonths(season, currentYear).some(m => t.date.startsWith(m)));
    const thisMonth = tasks.filter(t => t.date.startsWith(`${currentYear}/${String(currentMonth).padStart(2, '0')}`));
    
    // Overall stats
    const statusCounts = { idea: 0, writing: 0, ready: 0, published: 0 };
    let withFiles = 0;
    thisMonth.forEach(t => {
        statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
        if (t.fileId && !t.fileDeleted) withFiles++;
    });
    
    // Get parent goals for current season
    const parentGoals = goals.filter(g => !g.parentId && g.season === season);
    
    const goalsHTML = parentGoals.map(parentGoal => {
        const childGoals = goals.filter(g => g.parentId === parentGoal.id);
        const parentTasksCount = seasonTasks.filter(t => t.platform === parentGoal.platform && t.type === parentGoal.type).length;
        const parentPercent = parentGoal.targetCount ? Math.min(100, Math.round((parentTasksCount / parentGoal.targetCount) * 100)) : 0;
        
        const childrenHTML = childGoals.map(child => {
            const childTasksCount = seasonTasks.filter(t => 
                t.platform === child.platform && 
                t.type === child.type && 
                (child.category ? t.tags.includes(child.category) : true)
            ).length;
            const childPercent = child.targetCount ? Math.min(100, Math.round((childTasksCount / child.targetCount) * 100)) : childTasksCount;
            const childStatus = child.targetCount 
                ? (childPercent >= 100 ? 'completed' : childPercent >= 60 ? 'progress' : 'behind')
                : 'unplanned';
            
            const colorMap = { completed: 'bg-green-500', progress: 'bg-yellow-500', behind: 'bg-red-400', unplanned: 'bg-gray-300 dark:bg-gray-600' };
            
            return `
                <div class="ml-4 py-2 px-3 bg-gray-50 dark:bg-gray-900 rounded-lg mb-2">
                    <div class="flex justify-between items-center">
                        <span class="text-sm font-medium">${child.category || 'بدون دسته'}</span>
                        <span class="text-sm font-bold">
                            ${childTasksCount}${child.targetCount ? ` / ${child.targetCount}` : ' (بدون هدف)'}
                            ${child.targetCount ? `<span class="text-xs text-secondary-custom ml-1">(${childPercent}%)</span>` : ''}
                        </span>
                    </div>
                    ${child.targetCount ? `
                        <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-1">
                            <div class="${colorMap[childStatus]} h-2 rounded-full transition-all" style="width: ${childPercent}%"></div>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
        
        const parentStatus = parentGoal.targetCount 
            ? (parentPercent >= 100 ? 'completed' : parentPercent >= 60 ? 'progress' : 'behind')
            : 'unplanned';
        
        const colorMap = { completed: 'bg-green-500', progress: 'bg-yellow-500', behind: 'bg-red-400', unplanned: 'bg-gray-300 dark:bg-gray-600' };
        
        return `
            <div class="card-bg rounded-xl border p-4 mb-4">
                <div class="flex items-center justify-between mb-3">
                    <div>
                        <h4 class="font-bold">${parentGoal.name}</h4>
                        <p class="text-xs text-secondary-custom">${parentGoal.platform} • ${parentGoal.type}</p>
                    </div>
                    <span class="text-sm font-bold">
                        ${parentTasksCount}${parentGoal.targetCount ? ` / ${parentGoal.targetCount}` : ''}
                    </span>
                </div>
                
                ${parentGoal.targetCount ? `
                    <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-3">
                        <div class="${colorMap[parentStatus]} h-3 rounded-full transition-all" style="width: ${parentPercent}%"></div>
                    </div>
                    <p class="text-xs text-secondary-custom mb-2">${parentPercent}% پیشرفت</p>
                ` : '<p class="text-xs text-orange-500 mb-2">هدف تنظیم‌نشده</p>'}
                
                ${childrenHTML ? `<div class="mt-3 border-t border-gray-200 dark:border-gray-700 pt-3">${childrenHTML}</div>` : ''}
            </div>
        `;
    }).join('');
    
    content.innerHTML = `
      <div class="grid grid-cols-2 gap-3 mb-5">
        <div class="card-bg p-3 rounded-xl text-center border">
          <div class="text-3xl font-bold text-indigo-500">${tasks.length}</div>
          <div class="text-xs text-secondary-custom mt-1">کل کارها</div>
        </div>
        <div class="card-bg p-3 rounded-xl text-center border">
          <div class="text-3xl font-bold text-purple-500">${thisMonth.length}</div>
          <div class="text-xs text-secondary-custom mt-1">این ماه</div>
        </div>
        <div class="card-bg p-3 rounded-xl text-center border">
          <div class="text-3xl font-bold text-orange-500">${seasonTasks.length}</div>
          <div class="text-xs text-secondary-custom mt-1">این فصل</div>
        </div>
        <div class="card-bg p-3 rounded-xl text-center border">
          <div class="text-3xl font-bold text-green-500">${statusCounts.published}</div>
          <div class="text-xs text-secondary-custom mt-1">منتشرشده (ماه)</div>
        </div>
      </div>
      
      <div class="flex items-center justify-between mb-3">
        <h4 class="font-bold">🎯 اهداف فصل ${SEASONS[season].label}</h4>
        <button onclick="closeStatsModal(); openGoalsModal()" class="text-xs text-indigo-500 hover:underline px-3 py-1 border border-indigo-300 rounded-lg">✏️ ویرایش</button>
      </div>
      
      ${goalsHTML || '<p class="text-secondary-custom text-sm">هیچ هدفی تنظیم نشده‌ است</p>'}
      
      <div class="card-bg rounded-xl border p-4">
        <h4 class="font-bold mb-3">📊 وضعیت این ماه</h4>
        ${Object.entries(statusCounts).map(([k, v]) => `
          <div class="flex justify-between text-sm py-1 border-b border-gray-100 dark:border-gray-700 last:border-0">
            <span>${getStatusLabel(k)}</span>
            <span class="font-medium">${v}</span>
          </div>
        `).join('')}
      </div>
    `;
}

function closeStatsModal() {
    const modal = document.getElementById('statsModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

// ====== File Manager Modal ======
async function openFileManagerModal() {
    let modal = document.getElementById('fileManagerModal');
    if (!modal) {
        const modalHTML = `
            <div id="fileManagerModal" class="fixed inset-0 bg-black/50 modal-overlay hidden items-center justify-center z-50 p-4">
                <div class="secondary-bg rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                    <div class="sticky top-0 secondary-bg border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
                        <h3 class="text-lg font-bold">📁 مدیریت فایل‌ها</h3>
                        <button onclick="closeFileManagerModal()" class="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition">✕</button>
                    </div>
                    <div id="fileManagerContent" class="p-4 overflow-y-auto scrollbar-thin flex-1"></div>
                    <div class="p-4 border-t border-gray-200 dark:border-gray-700 text-sm text-secondary-custom text-center">
                        <span id="storageInfo"></span>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        modal = document.getElementById('fileManagerModal');
    }
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    const files = await getAllFilesFromDB();
    const content = document.getElementById('fileManagerContent');
    
    if (files.length === 0) {
        content.innerHTML = '<p class="text-center text-secondary-custom py-8">هیچ فایلی ذخیره نشده است</p>';
        document.getElementById('storageInfo').textContent = 'حجم کل: 0 B | تعداد: 0 فایل';
    } else {
        let totalSize = 0;
        content.innerHTML = `
            <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
                ${files.map(file => {
                    totalSize += file.size;
                    const task = tasks.find(t => t.fileId === file.id);
                    const preview = file.type.startsWith('image/') 
                        ? `<img src="${file.data}" class="w-full h-24 object-cover rounded-lg">`
                        : `<div class="w-full h-24 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center text-3xl">🎬</div>`;
                    return `
                        <div class="card-bg border rounded-lg overflow-hidden">
                            ${preview}
                            <div class="p-2">
                                <p class="text-xs truncate font-medium">${file.name}</p>
                                <p class="text-xs text-secondary-custom">${formatFileSize(file.size)}</p>
                                ${task ? `<p class="text-xs text-indigo-500 truncate mt-1">📌 ${task.title}</p>` : '<p class="text-xs text-red-500 mt-1">⚠️ بدون کار</p>'}
                                <button onclick="deleteOrphanFile('${file.id}')" class="text-xs text-red-500 hover:underline mt-1">حذف</button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        
        document.getElementById('storageInfo').textContent = `حجم کل: ${formatFileSize(totalSize)} | تعداد: ${files.length} فایل`;
    }
}

function closeFileManagerModal() {
    const modal = document.getElementById('fileManagerModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

async function deleteOrphanFile(fileId) {
    if (confirm('آیا از حذف این فایل مطمئن هستید؟')) {
        await deleteFileFromDB(fileId);
        const task = tasks.find(t => t.fileId === fileId);
        if (task) {
            task.fileId = null;
            task.fileDeleted = true;
            saveTasks();
        }
        openFileManagerModal();
    }
}

// ====== Export to CSV ======
function exportToCSV() {
    if (tasks.length === 0) {
        alert('هیچ کاری برای خروجی وجود ندارد!');
        return;
    }
    
    const headers = ['عنوان', 'تاریخ', 'ساعت', 'پلتفرم', 'نوع', 'وضعیت', 'برچسب‌ها', 'یادداشت', 'دارای فایل'];
    const rows = tasks.map(t => [
        t.title,
        t.date,
        t.time || '',
        getPlatformLabel(t.platform),
        t.type,
        getStatusLabel(t.status),
        (t.tags || []).join(' '),
        t.note || '',
        t.fileId && !t.fileDeleted ? 'بله' : 'خیر'
    ]);
    
    const csvContent = '\uFEFF' + [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `content-calendar-${currentYear}-${currentMonth}.csv`;
    link.click();
}

// ====== Backup Modal ======
function openBackupModal() {
    let modal = document.getElementById('backupModal');
    if (!modal) {
        const modalHTML = `
            <div id="backupModal" class="fixed inset-0 bg-black/50 modal-overlay hidden items-center justify-center z-50 p-4">
                <div class="secondary-bg rounded-2xl shadow-2xl w-full max-w-md">
                    <div class="sticky top-0 secondary-bg border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
                        <h3 class="text-lg font-bold">💾 پشتیبان‌گیری و بازیابی</h3>
                        <button onclick="closeBackupModal()" class="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition">✕</button>
                    </div>
                    <div class="p-4 space-y-4">
                        <button onclick="downloadBackup()" class="w-full py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg transition flex items-center justify-center gap-2">
                            <span>📥</span> دانلود فایل پشتیبان (بدون فایل‌ها)
                        </button>
                        <button onclick="downloadFullBackup()" class="w-full py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition flex items-center justify-center gap-2">
                            <span>📦</span> دانلود پشتیبان کامل (با فایل‌ها)
                        </button>
                        <div class="relative">
                            <input type="file" id="restoreFile" accept=".json" onchange="restoreBackup(event)" class="absolute inset-0 opacity-0 cursor-pointer">
                            <button class="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition flex items-center justify-center gap-2">
                                <span>📤</span> بازیابی از فایل
                            </button>
                        </div>
                        <p class="text-sm text-center text-secondary-custom">فایل پشتیبان شامل تمام کارهای شماست</p>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        modal = document.getElementById('backupModal');
    }
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeBackupModal() {
    const modal = document.getElementById('backupModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function downloadBackup() {
    if (window.downloadBackupAPI) {
        window.downloadBackupAPI();
    } else {
        const data = JSON.stringify(tasks, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `content-calendar-backup-${Date.now()}.json`;
        link.click();
    }
}

async function downloadFullBackup() {
    if (window.downloadFullBackupAPI) {
        window.downloadFullBackupAPI();
    } else {
        const files = await getAllFilesFromDB();
        const backupData = {
            tasks: tasks,
            files: files,
            exportedAt: Date.now()
        };
        
        const data = JSON.stringify(backupData);
        const blob = new Blob([data], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `content-calendar-full-backup-${Date.now()}.json`;
        link.click();
    }
}

async function restoreBackup(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = JSON.parse(event.target.result);
            
            if (window.restoreBackupAPI && data.tasks && data.files) {
                if (confirm(`آیا می‌خواهید ${data.tasks.length} کار و ${data.files.length} فایل را بازیابی کنید؟`)) {
                    await window.restoreBackupAPI(data);
                    renderCalendar();
                    closeBackupModal();
                    alert('بازیابی با موفقیت انجام شد!');
                }
            } else if (data.tasks && data.files) {
                if (confirm(`آیا می‌خواهید ${data.tasks.length} کار و ${data.files.length} فایل را بازیابی کنید؟`)) {
                    tasks = data.tasks;
                    saveTasks();
                    
                    for (const file of data.files) {
                        await saveFileToDB(file.id, { name: file.name, type: file.type, size: file.size }, file.data);
                    }
                    
                    renderCalendar();
                    closeBackupModal();
                    alert('بازیابی کامل با موفقیت انجام شد!');
                }
            } else if (Array.isArray(data)) {
                if (confirm(`آیا می‌خواهید ${data.length} کار را بازیابی کنید؟`)) {
                    tasks = data;
                    saveTasks();
                    renderCalendar();
                    closeBackupModal();
                    alert('بازیابی با موفقیت انجام شد!');
                }
            } else {
                alert('فایل نامعتبر است!');
            }
        } catch (err) {
            alert('خطا در خواندن فایل!');
            console.error(err);
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

// ====== Color Settings ======
async function openColorSettingsModal() {
    const settings = await getColorSettings();
    
    let html = `
        <div id="colorSettingsModal" class="fixed inset-0 bg-black/50 modal-overlay flex items-center justify-center z-50 p-4">
            <div class="card-bg rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 sticky top-0 card-bg rounded-t-lg">
                    <h2 class="text-xl font-bold">🎨 تنظیمات رنگ</h2>
                    <button onclick="closeColorSettingsModal()" class="text-2xl leading-none">✕</button>
                </div>
                
                <div class="p-6 space-y-4">
    `;
    
    const colorMap = {
        'instagram:post':  'پست اینستاگرام',
        'instagram:reels': 'ریلز اینستاگرام',
        'instagram:story': 'استوری اینستاگرام',
        'website:post':    'پست وبسایت',
        'messenger:post':  'پست کانال پیام‌رسان'
    };
    
    settings.forEach(setting => {
        const label = colorMap[setting.platformType] || setting.platformType;
        html += `
            <div class="flex items-center gap-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div class="flex-1">
                    <p class="font-medium">${label}</p>
                    <p class="text-xs text-secondary-custom">${setting.platformType}</p>
                </div>
                <div class="flex items-center gap-2">
                    <div class="flex items-center gap-2">
                        <span class="text-xs">روشن</span>
                        <input type="color" id="light-${setting.id}" value="${setting.lightColor}" 
                               onchange="updateColorSettingUI('${setting.id}', this.value, document.getElementById('dark-${setting.id}').value)"
                               class="w-10 h-10 rounded cursor-pointer">
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="text-xs">تاریک</span>
                        <input type="color" id="dark-${setting.id}" value="${setting.darkColor}"
                               onchange="updateColorSettingUI('${setting.id}', document.getElementById('light-${setting.id}').value, this.value)"
                               class="w-10 h-10 rounded cursor-pointer">
                    </div>
                </div>
            </div>
        `;
    });
    
    html += `
                </div>
                
                <div class="flex gap-2 p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                    <button onclick="resetColorsUI()" class="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition">
                        ↺ بازگردانی پیش‌فرض
                    </button>
                    <button onclick="closeColorSettingsModal()" class="flex-1 px-4 py-2 bg-gray-300 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg transition">
                        بستن
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', html);
}

function closeColorSettingsModal() {
    const modal = document.getElementById('colorSettingsModal');
    if (modal) modal.remove();
}

async function updateColorSettingUI(id, lightColor, darkColor) {
    await updateColorSetting(id, lightColor, darkColor);
    const key = Object.values(colorSettings).find(c => c.id === id)?.platformType.replace(':', '-');
    if (key) {
        const colorValue = isDarkMode ? darkColor : lightColor;
        document.documentElement.style.setProperty(`--color-${key}`, colorValue);
    }
    showToast('✅ رنگ بروزرسانی شد');
}

async function resetColorsUI() {
    if (confirm('آیا می‌خواهید تمام رنگ‌ها به پیش‌فرض برگردند؟')) {
        await resetColorSettings();
        await loadColorSettings();
        closeColorSettingsModal();
        openColorSettingsModal();
        showToast('✅ رنگ‌ها به پیش‌فرض برگردانده شدند');
    }
}

async function resetColorSettingsWithUI() {
    if (confirm('آیا می‌خواهید تمام رنگ‌ها به پیش‌فرض برگردند؟')) {
        await resetColorSettings();
        closeColorSettingsModal();
        openColorSettingsModal();
        showToast('✅ رنگ‌ها به پیش‌فرض برگردانده شدند');
    }
}

// ====== Goals Management ======
async function openGoalsModal() {
    const allGoals = await getGoalsFromServer();
    const parentGoals = allGoals.filter(g => !g.parentId);
    
    let html = `
        <div id="goalsModal" class="fixed inset-0 bg-black/50 modal-overlay flex items-center justify-center z-50 p-4">
            <div class="card-bg rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 sticky top-0 card-bg rounded-t-lg">
                    <h2 class="text-xl font-bold">🎯 مدیریت اهداف</h2>
                    <button onclick="closeGoalsModal()" class="text-2xl leading-none">✕</button>
                </div>
                
                <div class="p-6 space-y-6">
    `;
    
    parentGoals.forEach(parent => {
        const children = allGoals.filter(g => g.parentId === parent.id);
        const completedChildren = children.filter(c => c.targetCount).length;
        
        html += `
            <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div class="flex items-center justify-between mb-3">
                    <div>
                        <h3 class="font-bold text-lg">${parent.name}</h3>
                        <p class="text-xs text-secondary-custom">${parent.platform} • ${parent.type} • ${parent.season}</p>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="editGoal('${parent.id}')" class="px-3 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition">✎</button>
                        <button onclick="deleteGoalWithConfirm('${parent.id}')" class="px-3 py-1 text-sm bg-red-500 hover:bg-red-600 text-white rounded transition">🗑️</button>
                    </div>
                </div>
                
                <div class="space-y-2 ml-4 border-right-2 border-indigo-400 pr-3">
        `;
        
        if (children.length === 0) {
            html += `<p class="text-sm text-secondary-custom italic">بدون اهداف فرزندی</p>`;
        } else {
            children.forEach(child => {
                const progressPercent = child.targetCount ? Math.round((0 / child.targetCount) * 100) : 0;
                html += `
                    <div class="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-900 rounded">
                        <div class="flex-1">
                            <p class="text-sm font-medium">${child.category || 'بدون دسته'}</p>
                            ${child.targetCount ? `<p class="text-xs text-secondary-custom">هدف: ${child.targetCount} مورد</p>` : '<p class="text-xs text-orange-500">بدون هدف تعریف‌شده</p>'}
                        </div>
                        <div class="flex gap-1">
                            <button onclick="editGoal('${child.id}')" class="px-2 py-0.5 text-xs bg-blue-400 hover:bg-blue-500 text-white rounded">✎</button>
                            <button onclick="deleteGoalWithConfirm('${child.id}')" class="px-2 py-0.5 text-xs bg-red-400 hover:bg-red-500 text-white rounded">×</button>
                        </div>
                    </div>
                `;
            });
        }
        
        html += `
                    <button onclick="openAddSubGoalModal('${parent.id}')" class="w-full text-sm py-1 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded transition">
                        + اضافه کردن هدف فرزندی
                    </button>
                </div>
            </div>
        `;
    });
    
    html += `
                    <button onclick="openAddParentGoalModal()" class="w-full text-lg py-3 border-2 border-dashed border-indigo-500 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition font-medium">
                        + اضافه کردن هدف جدید
                    </button>
                </div>
                
                <div class="flex gap-2 p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                    <button onclick="closeGoalsModal()" class="flex-1 px-4 py-2 bg-gray-300 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg transition">
                        بستن
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', html);
}

function closeGoalsModal() {
    const modal = document.getElementById('goalsModal');
    if (modal) modal.remove();
}

async function openAddParentGoalModal() {
    const seasons = ['بهار', 'تابستان', 'پاییز', 'زمستان'];
    const platforms = ['Instagram', 'Website', 'Messenger'];
    const types = ['Post', 'Story', 'Article', 'Video'];
    
    let html = `
        <div id="addGoalModal" class="fixed inset-0 bg-black/50 modal-overlay flex items-center justify-center z-50 p-4">
            <div class="card-bg rounded-lg shadow-2xl w-full max-w-md">
                <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <h2 class="text-lg font-bold">هدف جدید</h2>
                    <button onclick="closeAddGoalModal()" class="text-2xl leading-none">✕</button>
                </div>
                
                <div class="p-6 space-y-4">
                    <div>
                        <label class="block text-sm font-medium mb-1">نام هدف</label>
                        <input type="text" id="goalName" placeholder="مثلاً: 30 پست تابستان" 
                               class="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-sm font-medium mb-1">پلتفرم</label>
                            <select id="goalPlatform" class="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none">
                                ${platforms.map(p => `<option value="${p.toLowerCase()}">${p}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">نوع</label>
                            <select id="goalType" class="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none">
                                ${types.map(t => `<option value="${t.toLowerCase()}">${t}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">فصل</label>
                        <select id="goalSeason" class="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none">
                            ${seasons.map(s => `<option value="${s}">${s}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">تعداد کل (اختیاری)</label>
                        <input type="number" id="goalTarget" placeholder="مثلاً: 30" min="0"
                               class="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none">
                    </div>
                </div>
                
                <div class="flex gap-2 p-6 border-t border-gray-200 dark:border-gray-700">
                    <button onclick="saveNewGoal()" class="flex-1 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition">
                        ذخیره
                    </button>
                    <button onclick="closeAddGoalModal()" class="flex-1 px-4 py-2 bg-gray-300 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg transition">
                        انصراف
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', html);
}

async function openAddSubGoalModal(parentId) {
    const parent = (await getGoalsFromServer()).find(g => g.id === parentId);
    
    let html = `
        <div id="addGoalModal" class="fixed inset-0 bg-black/50 modal-overlay flex items-center justify-center z-50 p-4">
            <div class="card-bg rounded-lg shadow-2xl w-full max-w-md">
                <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <h2 class="text-lg font-bold">هدف فرزندی جدید</h2>
                    <button onclick="closeAddGoalModal()" class="text-2xl leading-none">✕</button>
                </div>
                
                <div class="p-6 space-y-4">
                    <div class="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded">
                        <p class="text-sm font-medium">هدف مادر: ${parent.name}</p>
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">دسته/نام</label>
                        <input type="text" id="subGoalName" placeholder="مثلاً: معرفی برند، B2B، برنامه‌ریزی نشده" 
                               class="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">تعداد (اختیاری)</label>
                        <input type="number" id="subGoalTarget" placeholder="مثلاً: 10" min="0"
                               class="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none">
                    </div>
                </div>
                
                <div class="flex gap-2 p-6 border-t border-gray-200 dark:border-gray-700">
                    <button onclick="saveNewSubGoal('${parentId}')" class="flex-1 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition">
                        ذخیره
                    </button>
                    <button onclick="closeAddGoalModal()" class="flex-1 px-4 py-2 bg-gray-300 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg transition">
                        انصراف
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', html);
}

function closeAddGoalModal() {
    const modal = document.getElementById('addGoalModal');
    if (modal) modal.remove();
}

async function saveNewGoal() {
    const name = document.getElementById('goalName').value;
    const platform = document.getElementById('goalPlatform').value;
    const type = document.getElementById('goalType').value;
    const season = document.getElementById('goalSeason').value;
    const targetCount = parseInt(document.getElementById('goalTarget').value) || null;
    
    if (!name || !platform || !type || !season) {
        alert('تمام فیلدهای اجباری را پر کنید!');
        return;
    }
    
    const goalData = {
        name,
        platform,
        type,
        season,
        targetCount,
        parentId: null
    };
    
    await createGoal(goalData);
    closeAddGoalModal();
    closeGoalsModal();
    openGoalsModal();
    showToast('✅ هدف با موفقیت اضافه شد');
}

async function saveNewSubGoal(parentId) {
    const name = document.getElementById('subGoalName').value;
    const targetCount = parseInt(document.getElementById('subGoalTarget').value) || null;
    
    if (!name) {
        alert('نام دسته‌بندی الزامی است!');
        return;
    }
    
    const parent = (await getGoalsFromServer()).find(g => g.id === parentId);
    
    const goalData = {
        name,
        category: name,
        platform: parent.platform,
        type: parent.type,
        season: parent.season,
        targetCount,
        parentId
    };
    
    await createGoal(goalData);
    closeAddGoalModal();
    closeGoalsModal();
    openGoalsModal();
    showToast('✅ هدف فرزندی با موفقیت اضافه شد');
}

async function deleteGoalWithConfirm(goalId) {
    if (confirm('آیا مطمئن هستید؟')) {
        await deleteGoal(goalId);
        closeGoalsModal();
        openGoalsModal();
        showToast('✅ هدف حذف شد');
    }
}

function editGoal(goalId) {
    alert('ویرایش هدف برای نسخه بعدی');
}
function saveTasks() {
    localStorage.setItem('contentCalendarTasks', JSON.stringify(tasks));
}

// ====== Theme Toggle ======
function toggleTheme() {
    isDarkMode = !isDarkMode;
    document.documentElement.classList.toggle('dark');
    document.documentElement.classList.toggle('light');
    document.getElementById('themeBtn').textContent = isDarkMode ? '☀️' : '🌙';
    localStorage.setItem('darkMode', isDarkMode);
    
    // Re-apply from cached settings — no API call needed
    const settingsArray = Array.isArray(colorSettings)
        ? colorSettings
        : Object.values(colorSettings);
    
    if (settingsArray.length > 0) {
        settingsArray.forEach(color => {
            const key = color.platformType.replace(':', '-');
            document.documentElement.style.setProperty(`--color-${key}`, isDarkMode ? color.darkColor : color.lightColor);
        });
    } else {
        applyDefaultColors();
    }
}

// ====== Keyboard shortcuts ======
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeTaskModal();
        closeTaskDetail();
        closeSearchModal();
        closeStatsModal();
        closeBackupModal();
        closeFileViewer();
        closeFileManagerModal();
        closePublishConfirmModal();
    }
    if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        openSearchModal();
    }
});

// ====== Export functions to window ======
window.gregorianToJalali = gregorianToJalali;
window.jalaliToGregorian = jalaliToGregorian;
window.getJalaliMonthDays = getJalaliMonthDays;
window.isJalaliLeapYear = isJalaliLeapYear;
window.getFirstDayOfMonth = getFirstDayOfMonth;
window.jalaliDateToTimestamp = jalaliDateToTimestamp;
window.initDB = initDB;
window.saveFileToDB = saveFileToDB;
window.getFileFromDB = getFileFromDB;
window.deleteFileFromDB = deleteFileFromDB;
window.getAllFilesFromDB = getAllFilesFromDB;
window.init = init;
window.handleDragOver = handleDragOver;
window.handleDragLeave = handleDragLeave;
window.handleFileDrop = handleFileDrop;
window.handleFileSelect = handleFileSelect;
window.processFile = processFile;
window.showFilePreview = showFilePreview;
window.formatFileSize = formatFileSize;
window.removeFile = removeFile;
window.openFileViewer = openFileViewer;
window.closeFileViewer = closeFileViewer;
window.checkPendingPublications = checkPendingPublications;
window.showPublishConfirmModal = showPublishConfirmModal;
window.closePublishConfirmModal = closePublishConfirmModal;
window.confirmPublished = confirmPublished;
window.skipPublishConfirm = skipPublishConfirm;
window.renderCalendar = renderCalendar;
window.getFilteredTasks = getFilteredTasks;
window.getTypeEmoji = getTypeEmoji;
window.getStatusLabel = getStatusLabel;
window.getPlatformLabel = getPlatformLabel;
window.prevMonth = prevMonth;
window.nextMonth = nextMonth;
window.goToToday = goToToday;
window.handleDragStart = handleDragStart;
window.handleDrop = handleDrop;
window.openTaskModal = openTaskModal;
window.closeTaskModal = closeTaskModal;
window.addChecklistItem = addChecklistItem;
window.saveTask = saveTask;
window.openTaskDetail = openTaskDetail;
window.closeTaskDetail = closeTaskDetail;
window.toggleChecklistItem = toggleChecklistItem;
window.editTask = editTask;
window.deleteTask = deleteTask;
window.downloadTaskFile = downloadTaskFile;
window.openSearchModal = openSearchModal;
window.closeSearchModal = closeSearchModal;
window.performSearch = performSearch;
window.updateTypeOptions = updateTypeOptions;
window.copyTask = copyTask;
window.cancelCopy = cancelCopy;
window.pasteTask = pasteTask;
window.openGoalsModal = openGoalsModal;
window.closeGoalsModal = closeGoalsModal;
window.switchGoalSeason = switchGoalSeason;
window.saveAllGoals = saveAllGoals;
window.openStatsModal = openStatsModal;
window.closeStatsModal = closeStatsModal;
window.switchStatsSeason = switchStatsSeason;
window.loadGoals = loadGoals;
window.goals = goals;
window.openFileManagerModal = openFileManagerModal;
window.closeFileManagerModal = closeFileManagerModal;
window.deleteOrphanFile = deleteOrphanFile;
window.exportToCSV = exportToCSV;
window.openBackupModal = openBackupModal;
window.closeBackupModal = closeBackupModal;
window.downloadBackup = downloadBackup;
window.downloadFullBackup = downloadFullBackup;
window.restoreBackup = restoreBackup;
window.saveTasks = saveTasks;
window.toggleTheme = toggleTheme;
window.openColorSettingsModal = openColorSettingsModal;
window.closeColorSettingsModal = closeColorSettingsModal;
window.resetColorSettingsWithUI = resetColorSettingsWithUI;
window.updateColorSettingUI = updateColorSettingUI;
window.resetColorsUI = resetColorsUI;
window.loadColorSettings = loadColorSettings;
window.openGoalsModal = openGoalsModal;
window.closeGoalsModal = closeGoalsModal;
window.openAddParentGoalModal = openAddParentGoalModal;
window.openAddSubGoalModal = openAddSubGoalModal;
window.closeAddGoalModal = closeAddGoalModal;
window.saveNewGoal = saveNewGoal;
window.saveNewSubGoal = saveNewSubGoal;
window.deleteGoalWithConfirm = deleteGoalWithConfirm;
window.editGoal = editGoal;

console.log('✅ Calendar.js loaded successfully');