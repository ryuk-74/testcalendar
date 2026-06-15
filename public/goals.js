// ============ GOALS MANAGEMENT ============

let goals = [];
let currentGoalFilter = { platform: 'all', season: 'all' };

const seasons = ['تابستان', 'زمستان', 'بهار', 'پاییز'];
const platforms = ['instagram', 'website', 'messenger'];
const contentTypes = {
  instagram: ['معرفی محصول', 'معرفی برند', 'اخبار و اطلاعیه'],
  website: ['معرفی محصول', 'معرفی برند', 'اخبار و اطلاعیه'],
  messenger: ['معرفی محصول', 'معرفی برند', 'اخبار و اطلاعیه']
};

// دریافت اهداف
async function loadGoals() {
  try {
    goals = await getGoalsFromServer();
    console.log('✅ اهداف بارگذاری شدند:', goals.length);
  } catch (error) {
    console.error('خطا در بارگذاری اهداف:', error);
    goals = [];
  }
}

// باز کردن مودال اهداف
function openGoalsModal() {
  const modal = document.getElementById('goalsModal');
  if (!modal) createGoalsModal();
  renderGoalsModal();
  document.getElementById('goalsModal').classList.remove('hidden');
}

function closeGoalsModal() {
  const modal = document.getElementById('goalsModal');
  if (modal) modal.classList.add('hidden');
}

// ایجاد مودال اهداف
function createGoalsModal() {
  const modal = document.createElement('div');
  modal.id = 'goalsModal';
  modal.className = 'fixed inset-0 bg-black/50 modal-overlay hidden items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="secondary-bg rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto scrollbar-thin flex flex-col">
      <!-- Header -->
      <div class="sticky top-0 secondary-bg border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between z-10">
        <h3 class="text-lg font-bold flex items-center gap-2">🎯 اهداف محتوایی</h3>
        <button onclick="closeGoalsModal()" class="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition">✕</button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto scrollbar-thin">
        <div class="p-6 space-y-6">
          <!-- Section: ایجاد هدف جدید -->
          <div class="card-bg rounded-xl p-4 border">
            <h4 class="font-bold mb-4 flex items-center gap-2">➕ ایجاد هدف جدید</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium mb-1">پلتفرم *</label>
                <select id="newGoalPlatform" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm">
                  <option value="">انتخاب کنید</option>
                  <option value="instagram">اینستاگرام</option>
                  <option value="website">وبسایت</option>
                  <option value="messenger">کانال پیام‌رسان</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">نوع محتوا *</label>
                <select id="newGoalType" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm">
                  <option value="">انتخاب کنید</option>
                  <option value="معرفی محصول">معرفی محصول</option>
                  <option value="معرفی برند">معرفی برند</option>
                  <option value="اخبار و اطلاعیه">اخبار و اطلاعیه</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">فصل *</label>
                <select id="newGoalSeason" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm">
                  <option value="">انتخاب کنید</option>
                  <option value="تابستان">تابستان</option>
                  <option value="زمستان">زمستان</option>
                  <option value="بهار">بهار</option>
                  <option value="پاییز">پاییز</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">تعداد هدف *</label>
                <input type="number" id="newGoalTarget" min="1" placeholder="مثلاً: 10" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm">
              </div>
            </div>
            <button onclick="addNewGoal()" class="mt-4 w-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white py-2 rounded-lg hover:opacity-90 transition font-medium">+ افزودن هدف</button>
          </div>

          <!-- Section: فیلتر -->
          <div class="flex gap-3 flex-wrap">
            <select id="goalFilterPlatform" onchange="updateGoalFilter()" class="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm">
              <option value="all">تمام پلتفرم‌ها</option>
              <option value="instagram">اینستاگرام</option>
              <option value="website">وبسایت</option>
              <option value="messenger">کانال پیام‌رسان</option>
            </select>
            <select id="goalFilterSeason" onchange="updateGoalFilter()" class="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm">
              <option value="all">تمام فصل‌ها</option>
              <option value="تابستان">تابستان</option>
              <option value="زمستان">زمستان</option>
              <option value="بهار">بهار</option>
              <option value="پاییز">پاییز</option>
            </select>
          </div>

          <!-- Section: لیست اهداف -->
          <div id="goalsListContainer" class="space-y-3">
            <!-- Goals will be rendered here -->
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeGoalsModal();
  });
}

// بروزرسانی فیلتر
function updateGoalFilter() {
  currentGoalFilter.platform = document.getElementById('goalFilterPlatform').value;
  currentGoalFilter.season = document.getElementById('goalFilterSeason').value;
  renderGoalsModal();
}

// رندر کردن مودال اهداف
async function renderGoalsModal() {
  const container = document.getElementById('goalsListContainer');
  if (!container) return;

  let filteredGoals = goals;
  if (currentGoalFilter.platform !== 'all') {
    filteredGoals = filteredGoals.filter(g => g.platform === currentGoalFilter.platform);
  }
  if (currentGoalFilter.season !== 'all') {
    filteredGoals = filteredGoals.filter(g => g.season === currentGoalFilter.season);
  }

  if (filteredGoals.length === 0) {
    container.innerHTML = '<div class="text-center py-8 text-gray-400">هیچ هدفی ایجاد نشده است</div>';
    return;
  }

  // گروه‌بندی بر اساس platform + season
  const grouped = {};
  filteredGoals.forEach(goal => {
    const key = `${goal.platform}|${goal.season}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(goal);
  });

  let html = '';
  for (const key in grouped) {
    const [platform, season] = key.split('|');
    const goalsInGroup = grouped[key];
    const totalTarget = goalsInGroup.reduce((sum, g) => sum + (g.targetCount || 0), 0);

    html += `
      <div class="card-bg rounded-xl p-4 border">
        <div class="flex items-center justify-between mb-3">
          <h4 class="font-bold flex items-center gap-2">
            <span>${platform === 'instagram' ? '📷' : platform === 'website' ? '🌐' : '💬'}</span>
            <span>${platform} • ${season}</span>
          </h4>
          <span class="text-sm px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded">هدف کل: ${totalTarget}</span>
        </div>
        <div class="space-y-2">
    `;

    for (const goal of goalsInGroup) {
      const tasksCount = tasks.filter(t => t.goalId === goal.id).length;
      const isOver = tasksCount > goal.targetCount;

      html += `
        <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <div class="flex-1">
            <div class="font-medium">${goal.type}</div>
            <div class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <span>${tasksCount} / ${goal.targetCount}</span>
              ${isOver ? '<span class="text-red-500 text-xs">⚠️ بیش از هدف</span>' : ''}
            </div>
          </div>
          <div class="flex gap-2">
            <button onclick="editGoal('${goal.id}')" class="px-2 py-1 text-sm text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded transition">✏️ ویرایش</button>
            <button onclick="deleteGoalConfirm('${goal.id}')" class="px-2 py-1 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition">🗑️ حذف</button>
          </div>
        </div>
      `;
    }

    html += `
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

// اضافه کردن هدف جدید
async function addNewGoal() {
  const platform = document.getElementById('newGoalPlatform').value;
  const type = document.getElementById('newGoalType').value;
  const season = document.getElementById('newGoalSeason').value;
  const target = parseInt(document.getElementById('newGoalTarget').value);

  if (!platform || !type || !season || !target) {
    alert('لطفاً تمام فیلدها را پر کنید');
    return;
  }

  const goalData = {
    platform,
    type,
    season,
    targetCount: target
  };

  try {
    const id = await createGoal(goalData);
    goalData.id = id;
    goals.push(goalData);
    
    // پاک کردن فرم
    document.getElementById('newGoalPlatform').value = '';
    document.getElementById('newGoalType').value = '';
    document.getElementById('newGoalSeason').value = '';
    document.getElementById('newGoalTarget').value = '';

    renderGoalsModal();
    alert('✅ هدف با موفقیت ایجاد شد');
  } catch (error) {
    console.error('خطا:', error);
    alert('❌ خطا در ایجاد هدف');
  }
}

// ویرایش هدف
function editGoal(goalId) {
  const goal = goals.find(g => g.id === goalId);
  if (!goal) return;

  const newTarget = prompt(`تعداد هدف جدید برای "${goal.type}":`, goal.targetCount);
  if (newTarget === null || newTarget === '') return;

  const targetNum = parseInt(newTarget);
  if (isNaN(targetNum) || targetNum < 1) {
    alert('لطفاً عددی معتبر وارد کنید');
    return;
  }

  updateGoal(goalId, { ...goal, targetCount: targetNum });
  goal.targetCount = targetNum;
  renderGoalsModal();
  renderCalendar(); // بروزرسانی تقویم برای نمایش stats جدید
}

// تأیید حذف هدف
function deleteGoalConfirm(goalId) {
  const goal = goals.find(g => g.id === goalId);
  if (!goal) return;

  if (confirm(`آیا از حذف هدف "${goal.type}" برای ${goal.platform} در ${goal.season} مطمئن هستید?`)) {
    deleteGoal(goalId);
    goals = goals.filter(g => g.id !== goalId);
    renderGoalsModal();
  }
}

// دریافت stats برای goal
async function getGoalStats(goalId) {
  const goal = goals.find(g => g.id === goalId);
  if (!goal) return null;

  const completed = tasks.filter(t => t.goalId === goalId).length;
  return {
    goalId,
    type: goal.type,
    target: goal.targetCount,
    completed,
    isOver: completed > goal.targetCount,
    percentage: Math.round((completed / goal.targetCount) * 100)
  };
}

// دریافت stats برای platform + season
async function getPlatformSeasonStats(platform, season) {
  const platformGoals = goals.filter(g => g.platform === platform && g.season === season);
  
  const stats = [];
  for (const goal of platformGoals) {
    const goalStats = await getGoalStats(goal.id);
    if (goalStats) stats.push(goalStats);
  }

  const totalTarget = platformGoals.reduce((sum, g) => sum + g.targetCount, 0);
  const totalCompleted = stats.reduce((sum, s) => sum + s.completed, 0);

  return {
    platform,
    season,
    goals: stats,
    totalTarget,
    totalCompleted,
    totalPercentage: totalTarget > 0 ? Math.round((totalCompleted / totalTarget) * 100) : 0,
    hasOverage: stats.some(s => s.isOver)
  };
}

console.log('✅ Goals Module آماده است');
