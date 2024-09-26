let lastClearTime = {};

chrome.runtime.onInstalled.addListener(function() {
  console.log('扩展已安装或更新,正在初始化...');
  initializeAlarms();
});

chrome.alarms.onAlarm.addListener(function(alarm) {
  console.log('触发报警:', alarm.name);
  if (alarm.name.startsWith('clearHistory_')) {
    const url = alarm.name.split('_')[1];
    const now = Date.now();
    if (!lastClearTime[url] || now - lastClearTime[url] > 60000) { // 60秒内不重复清理
      clearHistoryForUrl(url);
      lastClearTime[url] = now;
    }
  }
});

function initializeAlarms() {
  chrome.storage.local.get({urls: [], globalAutoClean: false, globalInterval: ''}, function(result) {
    const urls = result.urls;
    const globalAutoClean = result.globalAutoClean;
    const globalInterval = result.globalInterval;
    
    urls.forEach(function(item) {
      if (globalAutoClean) {
        createAlarmForUrl(item.url, globalInterval);
        clearHistoryForUrl(item.url); // 立即执行清理任务
      } else if (item.scheduled && item.interval) {
        createAlarmForUrl(item.url, item.interval);
        clearHistoryForUrl(item.url); // 立即执行清理任务
      }
    });
  });
}

function createAlarmForUrl(url, interval) {
  const alarmName = `clearHistory_${url}`;
  chrome.alarms.create(alarmName, {periodInMinutes: parseInt(interval)});
  console.log(`为 ${url} 创建了报警,间隔为 ${interval} 分钟`);
}

function clearAlarmForUrl(url) {
  const alarmName = `clearHistory_${url}`;
  chrome.alarms.clear(alarmName, function(wasCleared) {
    console.log(`报警 ${alarmName} 已${wasCleared ? '清除' : '未找到'}`);
  });
}

function clearHistoryForUrl(url) {
  chrome.storage.local.get({clearRange: 'hour', urls: []}, function(result) {
    const clearRange = result.clearRange;
    
    // 提取网址列表中的一级域名
    const baseDomains = result.urls.map(item => {
      const hostname = new URL(item.url).hostname;
      const parts = hostname.split('.');
      return parts.slice(parts.length - 2).join('.'); // 获取一级域名
    });

    const startTime = getStartTime(clearRange);
    const endTime = Date.now();
    
    chrome.history.search({text: '', startTime: startTime, endTime: endTime}, function(historyItems) {
      const filteredItems = historyItems.filter(item => {
        const historyDomain = new URL(item.url).hostname; // 获取历史记录的域名
        const parts = historyDomain.split('.');
        const historyBaseDomain = parts.slice(parts.length - 2).join('.'); // 获取历史记录的一级域名
        return baseDomains.includes(historyBaseDomain); // 检查历史记录的一级域名是否在网址列表中
      });
      
      const clearedCount = filteredItems.length;
      if (clearedCount === 0) {
        return; // 如果清理的记录数量为0，则不记录日志
      }
      
      const deletePromises = filteredItems.map(item => new Promise((resolve, reject) => {
        chrome.history.deleteUrl({url: item.url}, function() {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      }));
      
      Promise.all(deletePromises).then(() => {
        console.log(`已清理 ${url} 的历史记录`);
        addLog(`自动清理：已清理${getRangeText(clearRange)}的历史记录，共${clearedCount}条`);
      }).catch(error => {
        console.error(`清理 ${url} 的历史记录时出错:`, error);
      });
    });
  });
}

function getRangeText(range) {
  switch(range) {
    case 'hour':
      return '最近1小时';
    case 'day':
      return '最近24小时';
    case 'week':
      return '最近7天';
    case 'all':
      return '全部历史';
    default:
      return range;
  }
}

function getStartTime(range) {
  const now = Date.now();
  switch(range) {
    case 'hour':
      return now - 60 * 60 * 1000;
    case 'day':
      return now - 24 * 60 * 60 * 1000;
    case 'week':
      return now - 7 * 24 * 60 * 60 * 1000;
    case 'all':
      return 0;
    default:
      return now;
  }
}

function addLog(message) {
  const now = new Date();
  const formattedDate = `${now.getFullYear()}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
  const logMessage = `${formattedDate}: ${message}`;
  
  chrome.storage.local.get({logs: []}, function(result) {
    const logs = result.logs;
    logs.push(logMessage);
    if (logs.length > 100) logs.shift();
    chrome.storage.local.set({logs: logs});
  });
}
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "updateAlarm") {
    if (request.scheduled && request.interval) {
      createAlarmForUrl(request.url, request.interval);
    } else {
      clearAlarmForUrl(request.url);
    }
    sendResponse({success: true});
  }
});

chrome.runtime.onStartup.addListener(function() {
  console.log('扩展启动，正在初始化报警...');
  initializeAlarms();
  
  // 在浏览器启动时检查是否已设置密码（包括空密码），如果已设置则锁定插件
  chrome.storage.local.get(['password'], function(result) {
    if (result.password !== undefined) {
      chrome.storage.local.set({locked: true, shouldLock: true}, function() {
        console.log('浏览器启动，插件已设置为锁定状态');
      });
    } else {
      console.log('浏览器启动，未设置密码，插件保持解锁状态');
      chrome.storage.local.set({locked: false, shouldLock: false});
    }
  });
});

let isPopupOpen = false;
let lockTime = 300; // 默认锁定时间为5分钟
let lastOpenTime = Date.now();

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('收到消息：', request);
  if (request.action === "checkLockStatus") {
    const currentTime = Date.now();
    const usedTime = currentTime - request.lastOpenTime;
    if (usedTime >= request.lockTime * 1000) {
      console.log('上次使用时间超过锁定时间，应该锁定插件');
      chrome.storage.local.set({shouldLock: true});
      sendResponse({shouldLock: true});
    } else {
      console.log('上次使用时间未超过锁定时间，不锁定插件');
      chrome.storage.local.set({shouldLock: false});
      sendResponse({shouldLock: false});
    }
  } else if (request.action === "resetLockTimer") {
    isPopupOpen = true;
    lockTime = request.lockTime;
    lastOpenTime = request.lastOpenTime;
    chrome.storage.local.set({lastOpenTime: lastOpenTime, shouldLock: false}, function() {
      console.log('重置锁定状态，新的锁定时间：', lockTime, '最后打开时间：', new Date(lastOpenTime));
      sendResponse({success: true});
    });
  } else if (request.action === "popupClosed") {
    isPopupOpen = false;
    const currentTime = Date.now();
    const usedTime = currentTime - lastOpenTime;
    console.log('弹出窗口关闭，使用时间：', usedTime, '毫秒，锁定时间：', lockTime * 1000, '毫秒');
    if (usedTime >= lockTime * 1000) {
      console.log('使用时间超过锁定时间，下次打开时将锁定插件');
      chrome.storage.local.set({shouldLock: true});
    } else {
      console.log('使用时间未超过锁定时间，不锁定插件');
      chrome.storage.local.set({shouldLock: false, lastOpenTime: lastOpenTime});
    }
    sendResponse({success: true});
  }
  return true; // 保持消息通道开放
});

function startLockTimer() {
  clearTimeout(lockTimer);
  console.log('开始锁定计时器，锁定时间：', lockTime);
  lockTimer = setTimeout(function() {
    console.log('锁定时间到，准备锁定插件');
    lockPlugin();
  }, lockTime * 1000);
}

function lockPlugin() {
  chrome.storage.local.get(['password'], function(result) {
    if (result.password !== undefined) {
      chrome.storage.local.set({locked: true, shouldLock: false}, function() {
        console.log('插件已锁定');
        chrome.runtime.sendMessage({action: "lockPlugin"}, function(response) {
          if (chrome.runtime.lastError) {
            console.error('发送锁定消息时出错:', chrome.runtime.lastError);
          } else {
            console.log('成功发送锁定消息');
          }
        });
      });
    } else {
      console.log('未设置密码，不锁定插件');
    }
  });
}

// 移除之前的 startLockTimer 和 checkLockStatus 函数

chrome.runtime.onStartup.addListener(function() {
  chrome.storage.local.get(['lockTime', 'lastOpenTime', 'shouldLock'], function(result) {
    lockTime = result.lockTime || 300;
    lastOpenTime = result.lastOpenTime || Date.now();
    shouldLock = result.shouldLock || false;
    console.log('扩展启动，锁定时间：', lockTime, '最后打开时间：', new Date(lastOpenTime), '是否应该锁定：', shouldLock);
  });
});

// ... 其他代码保持不变 ...
