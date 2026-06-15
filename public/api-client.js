// ====== API Configuration ======
const API_BASE = window.location.origin;
const API_URL = `${API_BASE}/api`;

let isOnlineMode = true;
let serverInfo = null;

// ====== Check server connection ======
async function checkServerConnection() {
  try {
    const response = await fetch(`${API_URL}/server-info`);
    if (response.ok) {
      serverInfo = await response.json();
      isOnlineMode = true;
      return true;
    }
  } catch (error) {
    console.warn('Server not available:', error);
  }
  isOnlineMode = false;
  return false;
}

// ====== API Helper ======
async function apiRequest(endpoint, options = {}) {
  if (!isOnlineMode) {
    throw new Error('Server not connected');
  }
  
  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// ====== Override IndexedDB functions ======
const originalInitDB = window.initDB;

window.initDB = async function() {
  const connected = await checkServerConnection();
  
  if (connected) {
    console.log('✅ متصل به سرور');
    showConnectionStatus(true);
    return Promise.resolve();
  } else {
    console.log('⚠️ سرور در دسترس نیست - استفاده از حالت محلی');
    showConnectionStatus(false);
    if (originalInitDB) {
      return originalInitDB();
    }
    return Promise.resolve();
  }
};

// ====== Load tasks from server ======
window.loadTasksFromServer = async function() {
  if (!isOnlineMode) {
    tasks = JSON.parse(localStorage.getItem('contentCalendarTasks')) || [];
    console.log('📦 بارگذاری از حافظه محلی:', tasks.length, 'کار');
    return;
  }
  
  try {
    tasks = await apiRequest('/tasks');
    console.log('✅ بارگذاری از سرور:', tasks.length, 'کار');
  } catch (error) {
    console.error('خطا در بارگذاری از سرور:', error);
    tasks = JSON.parse(localStorage.getItem('contentCalendarTasks')) || [];
    isOnlineMode = false;
    showConnectionStatus(false);
  }
};

// ====== Override saveTasks ======
const originalSaveTasks = window.saveTasks;

window.saveTasks = function() {
  if (!isOnlineMode && originalSaveTasks) {
    originalSaveTasks();
  }
};

// ====== Save task to server ======
window.saveTaskToServer = async function(taskData) {
  if (!isOnlineMode) {
    const index = tasks.findIndex(t => t.id === taskData.id);
    if (index >= 0) {
      tasks[index] = taskData;
    } else {
      tasks.push(taskData);
    }
    localStorage.setItem('contentCalendarTasks', JSON.stringify(tasks));
    return;
  }
  
  try {
    const exists = tasks.find(t => t.id === taskData.id);
    
    if (exists) {
      await apiRequest(`/tasks/${taskData.id}`, {
        method: 'PUT',
        body: JSON.stringify(taskData)
      });
      const index = tasks.findIndex(t => t.id === taskData.id);
      tasks[index] = taskData;
    } else {
      await apiRequest('/tasks', {
        method: 'POST',
        body: JSON.stringify(taskData)
      });
      tasks.push(taskData);
    }
    
    console.log('✅ کار ذخیره شد');
  } catch (error) {
    console.error('خطا در ذخیره کار:', error);
    alert('❌ خطا در ذخیره کار! لطفاً دوباره تلاش کنید.');
    throw error;
  }
};

// ====== Delete task from server ======
window.deleteTaskFromServer = async function(taskId) {
  const task = tasks.find(t => t.id === taskId);
  
  if (!isOnlineMode) {
    if (task && task.fileId && window.deleteFileFromDB) {
      await window.deleteFileFromDB(task.fileId);
    }
    tasks = tasks.filter(t => t.id !== taskId);
    localStorage.setItem('contentCalendarTasks', JSON.stringify(tasks));
    return;
  }
  
  try {
    if (task && task.fileId) {
      await apiRequest(`/files/${task.fileId}`, { method: 'DELETE' });
    }
    await apiRequest(`/tasks/${taskId}`, { method: 'DELETE' });
    tasks = tasks.filter(t => t.id !== taskId);
    console.log('✅ کار حذف شد');
  } catch (error) {
    console.error('خطا در حذف کار:', error);
    throw error;
  }
};

// ====== Override file operations ======
const originalSaveFileToDB = window.saveFileToDB;
const originalGetFileFromDB = window.getFileFromDB;
const originalDeleteFileFromDB = window.deleteFileFromDB;
const originalGetAllFilesFromDB = window.getAllFilesFromDB;

window.saveFileToDB = async function(id, file, data) {
  if (!isOnlineMode && originalSaveFileToDB) {
    return originalSaveFileToDB(id, file, data);
  }
  
  try {
    const fileData = {
      id: id,
      name: file.name,
      type: file.type,
      size: file.size,
      data: data
    };
    
    await apiRequest('/files', {
      method: 'POST',
      body: JSON.stringify(fileData)
    });
    
    console.log('✅ فایل ذخیره شد');
    return id;
  } catch (error) {
    console.error('خطا در ذخیره فایل:', error);
    throw error;
  }
};

window.getFileFromDB = async function(id) {
  if (!isOnlineMode && originalGetFileFromDB) {
    return originalGetFileFromDB(id);
  }
  
  try {
    return await apiRequest(`/files/${id}`);
  } catch (error) {
    console.error('خطا در دریافت فایل:', error);
    return null;
  }
};

window.deleteFileFromDB = async function(id) {
  if (!isOnlineMode && originalDeleteFileFromDB) {
    return originalDeleteFileFromDB(id);
  }
  
  try {
    await apiRequest(`/files/${id}`, { method: 'DELETE' });
    console.log('✅ فایل حذف شد');
  } catch (error) {
    console.error('خطا در حذف فایل:', error);
  }
};

window.getAllFilesFromDB = async function() {
  if (!isOnlineMode && originalGetAllFilesFromDB) {
    return originalGetAllFilesFromDB();
  }
  
  try {
    return await apiRequest('/files');
  } catch (error) {
    console.error('خطا در دریافت لیست فایل‌ها:', error);
    return [];
  }
};

// ====== Backup functions ======
window.downloadBackupAPI = async function() {
  try {
    const backup = await apiRequest('/backup');
    
    const tasksOnly = {
      tasks: backup.tasks,
      exportedAt: backup.exportedAt
    };
    
    const data = JSON.stringify(tasksOnly, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `content-calendar-backup-${Date.now()}.json`;
    link.click();
  } catch (error) {
    console.error('خطا در دانلود پشتیبان:', error);
    alert('❌ خطا در دانلود پشتیبان!');
  }
};

window.downloadFullBackupAPI = async function() {
  try {
    const backup = await apiRequest('/backup');
    
    const data = JSON.stringify(backup, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `content-calendar-full-backup-${Date.now()}.json`;
    link.click();
  } catch (error) {
    console.error('خطا در دانلود پشتیبان کامل:', error);
    alert('❌ خطا در دانلود پشتیبان کامل!');
  }
};

window.restoreBackupAPI = async function(backupData) {
  try {
    const result = await apiRequest('/restore', {
      method: 'POST',
      body: JSON.stringify(backupData)
    });
    
    console.log('✅ پشتیبان بازیابی شد:', result);
    await loadTasksFromServer();
    return result;
  } catch (error) {
    console.error('خطا در بازیابی پشتیبان:', error);
    alert('❌ خطا در بازیابی پشتیبان!');
    throw error;
  }
};

// ====== Connection status UI ======
function showConnectionStatus(connected) {
  let indicator = document.getElementById('connectionStatus');
  
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'connectionStatus';
    indicator.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      padding: 12px 24px;
      border-radius: 30px;
      font-size: 14px;
      font-weight: 500;
      z-index: 9999;
      backdrop-filter: blur(10px);
      transition: all 0.3s;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      cursor: pointer;
    `;
    document.body.appendChild(indicator);
    
    indicator.addEventListener('click', () => {
      if (serverInfo && serverInfo.urls && serverInfo.urls.length > 0) {
        showServerInfoModal();
      }
    });
  }
  
  if (connected) {
    indicator.innerHTML = '🟢 متصل به سرور' + (serverInfo ? ' <span style="opacity: 0.7; font-size: 11px;">(کلیک برای جزئیات)</span>' : '');
    indicator.style.background = 'rgba(34, 197, 94, 0.2)';
    indicator.style.color = '#22c55e';
    indicator.style.border = '1px solid rgba(34, 197, 94, 0.3)';
  } else {
    indicator.innerHTML = '🟡 حالت آفلاین (محلی)';
    indicator.style.background = 'rgba(234, 179, 8, 0.2)';
    indicator.style.color = '#eab308';
    indicator.style.border = '1px solid rgba(234, 179, 8, 0.3)';
  }
  
  setTimeout(() => {
    indicator.style.opacity = '0.7';
  }, 3000);
  
  indicator.addEventListener('mouseenter', () => {
    indicator.style.opacity = '1';
  });
}

// ====== Server info modal ======
function showServerInfoModal() {
  if (!serverInfo || !serverInfo.urls) return;
  
  const existingModal = document.getElementById('serverInfoModal');
  if (existingModal) {
    existingModal.remove();
  }
  
  const modal = document.createElement('div');
  modal.id = 'serverInfoModal';
  modal.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 20px;
  `;
  
  const content = document.createElement('div');
  content.style.cssText = `
    background: var(--bg-secondary);
    border-radius: 16px;
    padding: 24px;
    max-width: 500px;
    width: 100%;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    border: 1px solid var(--border-color);
  `;
  
  let urlsHTML = '';
  serverInfo.urls.forEach(url => {
    urlsHTML += `
      <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--bg-card); border-radius: 8px; margin-bottom: 8px; border: 1px solid var(--border-color);">
        <span style="flex: 1; font-family: monospace; font-size: 14px;">${url}</span>
        <button onclick="copyToClipboard('${url}')" style="padding: 6px 12px; background: #6366f1; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; transition: all 0.2s;">
          📋 کپی
        </button>
      </div>
    `;
  });
  
  content.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
      <h3 style="margin: 0; font-size: 18px; font-weight: bold;">📡 اطلاعات اتصال</h3>
      <button onclick="document.getElementById('serverInfoModal').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-primary); padding: 4px 8px;">×</button>
    </div>
    
    <p style="margin-bottom: 16px; color: var(--text-secondary); font-size: 14px;">
      از این آدرس‌ها می‌توانید از دستگاه‌های دیگر در شبکه محلی به تقویم دسترسی داشته باشید:
    </p>
    
    <div style="margin-bottom: 20px;">
      ${urlsHTML}
    </div>
    
    <div style="padding: 12px; background: rgba(99, 102, 241, 0.1); border-radius: 8px; border-right: 3px solid #6366f1;">
      <p style="margin: 0; font-size: 13px; color: var(--text-secondary);">
        💡 <strong>نکته:</strong> مطمئن شوید هر دو دستگاه در یک شبکه Wi-Fi هستند.
      </p>
    </div>
  `;
  
  modal.appendChild(content);
  document.body.appendChild(modal);
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

// ====== Copy to clipboard ======
window.copyToClipboard = function(text) {
  navigator.clipboard.writeText(text).then(() => {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✓ کپی شد!';
    btn.style.background = '#22c55e';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.background = '#6366f1';
    }, 2000);
  }).catch(err => {
    console.error('خطا در کپی:', err);
    alert('❌ خطا در کپی کردن!');
  });
};

// ====== Goals API ======
window.loadGoals = async function() {
  try {
    if (isOnlineMode) {
      goals = await apiRequest('/goals');
    } else {
      goals = JSON.parse(localStorage.getItem('contentCalendarGoals') || '[]');
    }
  } catch(e) {
    goals = JSON.parse(localStorage.getItem('contentCalendarGoals') || '[]');
  }
  localStorage.setItem('contentCalendarGoals', JSON.stringify(goals));
};

// ====== Goals API ======
window.getGoalsFromServer = async function() {
  if (!isOnlineMode) {
    return JSON.parse(localStorage.getItem('contentCalendarGoals')) || [];
  }
  
  try {
    return await apiRequest('/goals');
  } catch (error) {
    console.error('خطا در دریافت اهداف:', error);
    return [];
  }
};

window.createGoal = async function(goalData) {
  if (isOnlineMode) {
    try {
      const result = await apiRequest('/goals', { 
        method: 'POST', 
        body: JSON.stringify(goalData) 
      });
      return result.id;
    } catch(e) { console.error('Goal create error', e); }
  }
  return null;
};

window.updateGoal = async function(id, goalData) {
  if (isOnlineMode) {
    try {
      await apiRequest(`/goals/${id}`, { 
        method: 'PUT', 
        body: JSON.stringify(goalData) 
      });
    } catch(e) { console.error('Goal update error', e); }
  }
};

window.deleteGoal = async function(id) {
  if (isOnlineMode) {
    try {
      await apiRequest(`/goals/${id}`, { method: 'DELETE' });
    } catch(e) { console.error('Goal delete error', e); }
  }
};

// ====== Color Settings API ======
window.getColorSettings = async function() {
  if (!isOnlineMode) {
    return JSON.parse(localStorage.getItem('contentCalendarColors')) || [];
  }
  
  try {
    return await apiRequest('/color-settings');
  } catch (error) {
    console.error('خطا در دریافت تنظیمات رنگ:', error);
    return [];
  }
};

window.updateColorSetting = async function(id, lightColor, darkColor) {
  if (isOnlineMode) {
    try {
      await apiRequest(`/color-settings/${id}`, { 
        method: 'PUT', 
        body: JSON.stringify({ lightColor, darkColor }) 
      });
    } catch(e) { console.error('Color update error', e); }
  }
};

window.resetColorSettings = async function() {
  if (isOnlineMode) {
    try {
      await apiRequest('/color-settings/reset', { method: 'POST' });
    } catch(e) { console.error('Color reset error', e); }
  }
};

console.log('✅ API Client آماده است');