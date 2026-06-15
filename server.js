const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3333;

// Get local IP addresses
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  
  return addresses;
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Database setup
const dbPath = process.env.DB_PATH || path.join(__dirname, 'calendar.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err);
    process.exit(1);
  } else {
    console.log('✅ Database connected:', dbPath);
    initDatabase();
  }
});

// Initialize database tables
function initDatabase() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT,
      platform TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      tags TEXT,
      note TEXT,
      checklist TEXT,
      fileId TEXT,
      fileDeleted INTEGER DEFAULT 0,
      publishConfirmed INTEGER DEFAULT 0,
      publishedAt INTEGER,
      lastCheckTime INTEGER,
      goalId TEXT,
      createdAt INTEGER,
      updatedAt INTEGER
    )`, (err) => {
      if (err) console.error('Error creating tasks table:', err);
      else console.log('✅ Tasks table ready');
    });

    db.run(`CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      size INTEGER NOT NULL,
      data TEXT NOT NULL,
      createdAt INTEGER
    )`, (err) => {
      if (err) console.error('Error creating files table:', err);
      else console.log('✅ Files table ready');
    });

    db.run(`CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      type TEXT NOT NULL,
      season TEXT NOT NULL,
      targetCount INTEGER NOT NULL,
      createdAt INTEGER,
      updatedAt INTEGER
    )`, (err) => {
      if (err) console.error('Error creating goals table:', err);
      else console.log('✅ Goals table ready');
    });

    db.run(`CREATE TABLE IF NOT EXISTS colorSettings (
      id TEXT PRIMARY KEY,
      platformType TEXT NOT NULL UNIQUE,
      lightColor TEXT NOT NULL,
      darkColor TEXT NOT NULL,
      createdAt INTEGER,
      updatedAt INTEGER
    )`, (err) => {
      if (err) console.error('Error creating colorSettings table:', err);
      else console.log('✅ Color settings table ready');
      initDefaultColors();
    });
  });
}

// Initialize default color settings
function initDefaultColors() {
  const defaultColors = [
    { id: 'instagram-post',  platformType: 'instagram:post',  lightColor: '#b298dc', darkColor: '#a663cc' },
    { id: 'instagram-reels', platformType: 'instagram:reels', lightColor: '#9b6fd6', darkColor: '#8e4eb8' },
    { id: 'instagram-story', platformType: 'instagram:story', lightColor: '#c9b3e8', darkColor: '#c084e0' },
    { id: 'website-post',    platformType: 'website:post',    lightColor: '#90a955', darkColor: '#4f772d' },
    { id: 'messenger-post',  platformType: 'messenger:post',  lightColor: '#00a6fb', darkColor: '#006494' }
  ];

  defaultColors.forEach(color => {
    db.run(
      'INSERT OR REPLACE INTO colorSettings (id, platformType, lightColor, darkColor, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
      [color.id, color.platformType, color.lightColor, color.darkColor, Date.now(), Date.now()]
    );
  });
}

// ============ TASKS API ============

app.get('/api/tasks', (req, res) => {
  db.all('SELECT * FROM tasks ORDER BY date DESC', [], (err, rows) => {
    if (err) {
      console.error('Error fetching tasks:', err);
      return res.status(500).json({ error: err.message });
    }
    
    const tasks = rows.map(row => ({
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : [],
      checklist: row.checklist ? JSON.parse(row.checklist) : [],
      fileDeleted: Boolean(row.fileDeleted),
      publishConfirmed: Boolean(row.publishConfirmed)
    }));
    
    res.json(tasks);
  });
});

app.get('/api/tasks/:id', (req, res) => {
  db.get('SELECT * FROM tasks WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      console.error('Error fetching task:', err);
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const task = {
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : [],
      checklist: row.checklist ? JSON.parse(row.checklist) : [],
      fileDeleted: Boolean(row.fileDeleted),
      publishConfirmed: Boolean(row.publishConfirmed)
    };
    
    res.json(task);
  });
});

app.post('/api/tasks', (req, res) => {
  const task = req.body;
  const now = Date.now();
  
  const sql = `INSERT INTO tasks (
    id, title, date, time, platform, type, status,
    tags, note, checklist, fileId, fileDeleted, publishConfirmed,
    publishedAt, lastCheckTime, goalId, createdAt, updatedAt
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  
  const params = [
    task.id || Date.now().toString(),
    task.title,
    task.date,
    task.time || null,
    task.platform,
    task.type,
    task.status,
    JSON.stringify(task.tags || []),
    task.note || null,
    JSON.stringify(task.checklist || []),
    task.fileId || null,
    task.fileDeleted ? 1 : 0,
    task.publishConfirmed ? 1 : 0,
    task.publishedAt || null,
    task.lastCheckTime || null,
    task.goalId || null,
    now,
    now
  ];
  
  db.run(sql, params, function(err) {
    if (err) {
      console.error('Error creating task:', err);
      return res.status(500).json({ error: err.message });
    }
    console.log('✅ Task created:', params[0]);
    res.json({ id: params[0], message: 'Task created successfully' });
  });
});

app.put('/api/tasks/:id', (req, res) => {
  const task = req.body;
  const now = Date.now();
  
  const sql = `UPDATE tasks SET
    title = ?, date = ?, time = ?, platform = ?, type = ?,
    status = ?, tags = ?, note = ?, checklist = ?,
    fileId = ?, fileDeleted = ?, publishConfirmed = ?,
    publishedAt = ?, lastCheckTime = ?, goalId = ?, updatedAt = ?
    WHERE id = ?`;
  
  const params = [
    task.title,
    task.date,
    task.time || null,
    task.platform,
    task.type,
    task.status,
    JSON.stringify(task.tags || []),
    task.note || null,
    JSON.stringify(task.checklist || []),
    task.fileId || null,
    task.fileDeleted ? 1 : 0,
    task.publishConfirmed ? 1 : 0,
    task.publishedAt || null,
    task.lastCheckTime || null,
    task.goalId || null,
    now,
    req.params.id
  ];
  
  db.run(sql, params, function(err) {
    if (err) {
      console.error('Error updating task:', err);
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    console.log('✅ Task updated:', req.params.id);
    res.json({ message: 'Task updated successfully' });
  });
});

app.delete('/api/tasks/:id', (req, res) => {
  db.run('DELETE FROM tasks WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      console.error('Error deleting task:', err);
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    console.log('✅ Task deleted:', req.params.id);
    res.json({ message: 'Task deleted successfully' });
  });
});

// ============ FILES API ============

app.get('/api/files', (req, res) => {
  db.all('SELECT id, name, type, size, createdAt FROM files', [], (err, rows) => {
    if (err) {
      console.error('Error fetching files:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.get('/api/files/:id', (req, res) => {
  db.get('SELECT * FROM files WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      console.error('Error fetching file:', err);
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.json(row);
  });
});

app.post('/api/files', (req, res) => {
  const file = req.body;
  
  const sql = `INSERT INTO files (id, name, type, size, data, createdAt)
               VALUES (?, ?, ?, ?, ?, ?)`;
  
  const params = [
    file.id,
    file.name,
    file.type,
    file.size,
    file.data,
    Date.now()
  ];
  
  db.run(sql, params, function(err) {
    if (err) {
      console.error('Error uploading file:', err);
      return res.status(500).json({ error: err.message });
    }
    console.log('✅ File uploaded:', file.id);
    res.json({ id: file.id, message: 'File uploaded successfully' });
  });
});

app.delete('/api/files/:id', (req, res) => {
  db.run('DELETE FROM files WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      console.error('Error deleting file:', err);
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    console.log('✅ File deleted:', req.params.id);
    res.json({ message: 'File deleted successfully' });
  });
});

// ============ BACKUP & RESTORE ============

app.get('/api/backup', (req, res) => {
  db.all('SELECT * FROM tasks', [], (err, tasks) => {
    if (err) {
      console.error('Error creating backup:', err);
      return res.status(500).json({ error: err.message });
    }
    
    db.all('SELECT * FROM files', [], (err2, files) => {
      if (err2) {
        console.error('Error creating backup:', err2);
        return res.status(500).json({ error: err2.message });
      }
      
      const backup = {
        tasks: tasks.map(row => ({
          ...row,
          tags: row.tags ? JSON.parse(row.tags) : [],
          checklist: row.checklist ? JSON.parse(row.checklist) : [],
          fileDeleted: Boolean(row.fileDeleted),
          publishConfirmed: Boolean(row.publishConfirmed)
        })),
        files: files,
        exportedAt: Date.now()
      };
      
      console.log('✅ Backup created');
      res.json(backup);
    });
  });
});

app.post('/api/restore', (req, res) => {
  const { tasks, files } = req.body;
  
  db.serialize(() => {
    db.run('DELETE FROM tasks', (err) => {
      if (err) {
        console.error('Error clearing tasks:', err);
        return res.status(500).json({ error: err.message });
      }
      
      db.run('DELETE FROM files', (err2) => {
        if (err2) {
          console.error('Error clearing files:', err2);
          return res.status(500).json({ error: err2.message });
        }
        
        const taskStmt = db.prepare(`INSERT INTO tasks (
          id, title, date, time, platform, type, status,
          tags, note, checklist, fileId, fileDeleted, publishConfirmed,
          publishedAt, lastCheckTime, goalId, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        
        tasks.forEach(task => {
          taskStmt.run([
            task.id,
            task.title,
            task.date,
            task.time || null,
            task.platform,
            task.type,
            task.status,
            JSON.stringify(task.tags || []),
            task.note || null,
            JSON.stringify(task.checklist || []),
            task.fileId || null,
            task.fileDeleted ? 1 : 0,
            task.publishConfirmed ? 1 : 0,
            task.publishedAt || null,
            task.lastCheckTime || null,
            task.goalId || null,
            task.createdAt || Date.now(),
            task.updatedAt || Date.now()
          ]);
        });
        
        taskStmt.finalize();
        
        if (files && files.length > 0) {
          const fileStmt = db.prepare(`INSERT INTO files (id, name, type, size, data, createdAt)
                                        VALUES (?, ?, ?, ?, ?, ?)`);
          
          files.forEach(file => {
            fileStmt.run([
              file.id,
              file.name,
              file.type,
              file.size,
              file.data,
              file.createdAt
            ]);
          });
          
          fileStmt.finalize();
        }
        
        console.log('✅ Backup restored');
        res.json({ 
          message: 'Backup restored successfully',
          tasksRestored: tasks.length,
          filesRestored: files ? files.length : 0
        });
      });
    });
  });
});

// ============ STATS ============

app.get('/api/stats', (req, res) => {
  const stats = {};
  
  db.get('SELECT COUNT(*) as total FROM tasks', [], (err, row) => {
    stats.totalTasks = row ? row.total : 0;
    
    db.get('SELECT COUNT(*) as total FROM tasks WHERE status = "published"', [], (err, row) => {
      stats.publishedTasks = row ? row.total : 0;
      
      db.get('SELECT COUNT(*) as total FROM files', [], (err, row) => {
        stats.totalFiles = row ? row.total : 0;
        
        db.get('SELECT SUM(size) as total FROM files', [], (err, row) => {
          stats.totalStorageBytes = row && row.total ? row.total : 0;
          res.json(stats);
        });
      });
    });
  });
});

// ============ GOALS API ============

app.get('/api/goals', (req, res) => {
  db.all('SELECT * FROM goals ORDER BY platform, season, type', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// دریافت یک goal با stats آن
app.get('/api/goals/:id', (req, res) => {
  db.get('SELECT * FROM goals WHERE id = ?', [req.params.id], (err, goal) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    
    // محاسبه تعداد tasks متصل
    db.get('SELECT COUNT(*) as count FROM tasks WHERE goalId = ?', [req.params.id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const stats = {
        target: goal.targetCount,
        completed: row ? row.count : 0,
        isOver: (row ? row.count : 0) > goal.targetCount
      };
      
      res.json({
        ...goal,
        stats
      });
    });
  });
});

app.post('/api/goals', (req, res) => {
  const goal = req.body;
  const now = Date.now();
  const id = goal.id || Date.now().toString();

  const sql = `INSERT INTO goals (id, platform, type, season, targetCount, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?)`;
  
  const params = [
    id,
    goal.platform,
    goal.type,
    goal.season,
    goal.targetCount || 0,
    now,
    now
  ];

  db.run(sql, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    console.log('✅ Goal created:', id);
    res.json({ id, message: 'Goal created' });
  });
});

app.put('/api/goals/:id', (req, res) => {
  const goal = req.body;
  const now = Date.now();

  // فقط targetCount را تغییر می‌دهیم
  const sql = `UPDATE goals SET targetCount = ?, updatedAt = ? WHERE id = ?`;
  
  const params = [
    goal.targetCount,
    now,
    req.params.id
  ];

  db.run(sql, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Goal not found' });
    console.log('✅ Goal updated:', req.params.id);
    res.json({ message: 'Goal updated' });
  });
});

app.delete('/api/goals/:id', (req, res) => {
  // حذف goal و قطع اتصال tasks
  db.run('UPDATE tasks SET goalId = NULL WHERE goalId = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.run('DELETE FROM goals WHERE id = ?', [req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      console.log('✅ Goal deleted:', req.params.id);
      res.json({ message: 'Goal deleted' });
    });
  });
});

// دریافت stats برای تمام goals یک پلتفرم و فصل
app.get('/api/goals/stats/by-platform', (req, res) => {
  const { platform, season } = req.query;
  
  if (!platform || !season) {
    return res.status(400).json({ error: 'platform and season are required' });
  }

  db.all(
    `SELECT g.id, g.platform, g.season, g.type, g.targetCount, 
            (SELECT COUNT(*) FROM tasks WHERE goalId = g.id) as completed
     FROM goals g
     WHERE g.platform = ? AND g.season = ?
     ORDER BY g.type`,
    [platform, season],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const stats = rows.map(row => ({
        goalId: row.id,
        type: row.type,
        target: row.targetCount,
        completed: row.completed || 0,
        isOver: (row.completed || 0) > row.targetCount
      }));
      
      res.json({
        platform,
        season,
        goals: stats
      });
    }
  );
});

// ============ COLOR SETTINGS ============

app.get('/api/color-settings', (req, res) => {
  db.all('SELECT * FROM colorSettings', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.put('/api/color-settings/:id', (req, res) => {
  const { lightColor, darkColor } = req.body;
  const now = Date.now();

  const sql = `UPDATE colorSettings SET lightColor = ?, darkColor = ?, updatedAt = ? WHERE id = ?`;
  
  db.run(sql, [lightColor, darkColor, now, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Color updated' });
  });
});

app.post('/api/color-settings/reset', (req, res) => {
  const defaultColors = [
    { id: 'instagram-post',  platformType: 'instagram:post',  lightColor: '#b298dc', darkColor: '#a663cc' },
    { id: 'instagram-reels', platformType: 'instagram:reels', lightColor: '#9b6fd6', darkColor: '#8e4eb8' },
    { id: 'instagram-story', platformType: 'instagram:story', lightColor: '#c9b3e8', darkColor: '#c084e0' },
    { id: 'website-post',    platformType: 'website:post',    lightColor: '#90a955', darkColor: '#4f772d' },
    { id: 'messenger-post',  platformType: 'messenger:post',  lightColor: '#00a6fb', darkColor: '#006494' }
  ];

  const now = Date.now();
  defaultColors.forEach(color => {
    db.run(
      'UPDATE colorSettings SET lightColor = ?, darkColor = ?, updatedAt = ? WHERE id = ?',
      [color.lightColor, color.darkColor, now, color.id]
    );
  });

  res.json({ message: 'Colors reset to defaults' });
});

// ============ SERVER INFO ============

app.get('/api/server-info', (req, res) => {
  const ips = getLocalIPs();
  res.json({
    port: PORT,
    localIPs: ips,
    urls: ips.map(ip => `http://${ip}:${PORT}`)
  });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIPs();
  
  console.log('\n' + '='.repeat(60));
  console.log('🚀 سرور با موفقیت راه‌اندازی شد!');
  console.log('='.repeat(60));
  console.log('\n📍 آدرس‌های دسترسی:\n');
  console.log(`   🏠 دسترسی محلی:      http://localhost:${PORT}`);
  
  if (ips.length > 0) {
    console.log(`\n   📱 دسترسی از شبکه:`);
    ips.forEach(ip => {
      console.log(`      → http://${ip}:${PORT}`);
    });
  } else {
    console.log('\n   ⚠️  آدرس شبکه یافت نشد');
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('💡 نکات:');
  console.log('   • برای توقف سرور: Ctrl+C');
  console.log('   • برای رفرش خودکار: npm run dev');
  console.log('   • دیتابیس: calendar.db');
  console.log('='.repeat(60) + '\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⏹️  در حال بستن سرور...');
  
  server.close(() => {
    console.log('✅ سرور بسته شد');
    
    db.close((err) => {
      if (err) {
        console.error('❌ خطا در بستن دیتابیس:', err);
        process.exit(1);
      } else {
        console.log('✅ دیتابیس بسته شد');
        process.exit(0);
      }
    });
  });
});

process.on('uncaughtException', (err) => {
  console.error('❌ خطای پیش‌بینی نشده:', err);
  process.exit(1);
});
