console.log('Popup script loaded');

let lockTime = 300; // 默认锁定时间为5分钟
let lastOpenTime = Date.now();

function truncateSiteName(siteName, maxLength) {
  if (siteName.length > maxLength) {
    return siteName.substring(0, maxLength) + '...';
  }
  return siteName;
}

function updateUrlList() {
  const urlList = document.getElementById('urlList');
  const urlCount = document.getElementById('urlCount'); // 获取网址数量显示元素
  if (!urlList) return;
  const scrollTop = urlList.scrollTop;
  const scrollLeft = urlList.scrollLeft;
  urlList.innerHTML = '';
  chrome.storage.local.get({urls: [], globalInterval: ''}, function(result) {
    const urls = result.urls;
    const globalInterval = result.globalInterval;
    
    console.log('All stored URLs:', urls);
    
    if (urls.length === 0) {
      urlList.innerHTML = '<p>暂无添加的网址</p>';
      urlCount.innerText = '网址数量: 0'; // 更新网址数量
    } else {
      const uniqueUrls = Array.from(new Set(urls.map(item => item.url))).map(url => {
        return urls.find(item => item.url === url);
      });
      uniqueUrls.forEach(function(item, index) {
        console.log('Processing URL:', item.url, 'Site name:', item.siteName);
        const urlItem = document.createElement('div');
        urlItem.className = 'item';
        const truncatedSiteName = truncateSiteName(item.siteName || '未知网站', 30); // 设置最大字符数为50
        urlItem.innerHTML = `
          <a class="link" href="${item.url}" target="_blank">
            <img class="favicon" src="https://www.google.com/s2/favicons?domain=${item.url}" alt="favicon">
            <span class="title" style="color: white;">${truncatedSiteName}</span>
          </a>
          <span class="delete-url" data-index="${index}" style="color: red; cursor: pointer; margin-left: 10px;">X</span>
          <span class="url">${item.url}</span>
        `;
        urlList.appendChild(urlItem);
      });
      urlCount.innerText = `网址数量: ${uniqueUrls.length}`; // 更新网址数量
    }
    urlList.scrollTop = scrollTop;
    urlList.scrollLeft = scrollLeft;
  });
}

function fetchSiteNameFromHistory(url, callback) {
  console.log('Fetching site name for:', url);
  chrome.history.search({text: '', maxResults: 5000}, function(historyItems) {
    console.log('Total history items:', historyItems.length);
    const historyItem = historyItems.find(item => item.url.includes(url));
    console.log('Matching history item:', historyItem);
    if (historyItem && historyItem.title) {
      console.log('Site name found:', historyItem.title);
      callback(historyItem.title);
    } else {
      console.log('Site name not found, using default');
      callback('未知网站');
    }
  });
}

function updateSiteNames(callback) {
  chrome.storage.local.get({urls: []}, function(result) {
    const urls = result.urls;
    let updatedCount = 0;

    urls.forEach((item, index) => {
      if (item.siteName === '未知网站') {
        fetchSiteNameFromHistory(item.url, function(siteName) {
          urls[index].siteName = siteName;
          updatedCount++;
          if (updatedCount === urls.length) {
            chrome.storage.local.set({urls: urls}, function() {
              updateUrlList();
              if (callback) callback();
            });
          }
        });
      } else {
        updatedCount++;
        if (updatedCount === urls.length) {
          chrome.storage.local.set({urls: urls}, function() {
            updateUrlList();
            if (callback) callback();
          });
        }
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', function() {
  initializePopup();
  
  const lockIcon = document.getElementById('lockIcon');
  if (lockIcon) {
    lockIcon.addEventListener('click', function() {
      chrome.storage.local.get(['password', 'passwordHint'], function(result) {
        if (result.password === undefined) {
          const password = prompt('请设置密码（可以为空）:');
          if (password !== null) {
            const passwordHint = prompt('请设置密码提示词:');
            chrome.storage.local.set({password: password, passwordHint: passwordHint, locked: true}, function() {
              showLockScreen();
            });
          }
        } else {
          chrome.storage.local.set({locked: true}, function() {
            showLockScreen();
          });
        }
      });
    });
  }

  const unlockArrow = document.getElementById('unlockArrow');
  if (unlockArrow) {
    unlockArrow.addEventListener('click', function() {
      unlock();
    });
  }

  const clearRangeSelect = document.getElementById('clearRange');
  if (clearRangeSelect) {
    chrome.storage.local.get({clearRange: 'hour'}, function(result) {
      clearRangeSelect.value = result.clearRange;
    });

    clearRangeSelect.addEventListener('change', function() {
      saveClearRange(clearRangeSelect.value);
    });
  }

  const globalIntervalInput = document.getElementById('globalInterval');
  if (globalIntervalInput) {
    chrome.storage.local.get({globalInterval: ''}, function(result) {
      globalIntervalInput.value = result.globalInterval;
    });

    globalIntervalInput.addEventListener('change', function() {
      saveGlobalInterval(globalIntervalInput.value);
    });
  }

  const lockTimeInput = document.getElementById('lockTimeInput');
  if (lockTimeInput) {
    chrome.storage.local.get({lockTime: 5}, function(result) {
      lockTimeInput.value = result.lockTime;
    });

    lockTimeInput.addEventListener('change', function() {
      const newLockTime = parseInt(lockTimeInput.value);
      if (newLockTime && newLockTime > 0) {
        chrome.storage.local.set({lockTime: newLockTime}, function() {
          console.log('锁定时间已更新为:', newLockTime, '分钟');
        });
      } else {
        alert('请输入有效的锁定时间');
        chrome.storage.local.get({lockTime: 5}, function(result) {
          lockTimeInput.value = result.lockTime;
        });
      }
    });
  }

  // 为整个插件界面添加事件监听器
  document.getElementById('mainContainer').addEventListener('click', checkLockStatus);
  document.getElementById('mainContainer').addEventListener('keypress', checkLockStatus);
  
  // 当插件打开时，重置计时器并设置 isPopupOpen 为 true
  checkLockStatus();
});

const urlInput = document.getElementById('url');
if (urlInput) {
  urlInput.addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
      const url = document.getElementById('url').value;
      if (url) {
        chrome.storage.local.get({urls: [], globalInterval: ''}, function(result) {
          const urls = result.urls;
          const globalInterval = result.globalInterval;
          if (!urls.some(item => item.url === url)) {
            console.log('Adding new URL:', url);
            fetchSiteNameFromHistory(url, function(siteName) {
              console.log('Fetched site name:', siteName);
              urls.push({
                url: url,
                siteName: siteName
              });
              chrome.storage.local.set({urls: urls}, function() {
                console.log('URL added to storage');
                updateUrlList();
                checkLockStatus();
                document.getElementById('url').value = '';
                if (globalInterval) {
                  chrome.runtime.sendMessage({
                    action: "updateAlarm",
                    url: url,
                    scheduled: true,
                    interval: globalInterval
                  });
                }
              });
            });
          } else {
            alert('该网址已存在');
          }
        });
      } else {
        alert('请输入网址');
      }
    }
  });
}

const urlList = document.getElementById('urlList');
if (urlList) {
  urlList.addEventListener('click', function(event) {
    if (event.target.classList.contains('delete-url')) {
      event.stopPropagation(); // 阻止事件冒泡，防止点击删除按钮时打开链接
      const index = event.target.getAttribute('data-index');
      chrome.storage.local.get({urls: []}, function(result) {
        const urls = result.urls;
        urls.splice(index, 1);
        chrome.storage.local.set({urls: urls}, function() {
          updateUrlList();
          checkLockStatus();
        });
      });
    } else if (event.target.tagName === 'SPAN' && event.target.title) {
      const url = event.target.title;
      fetchSiteNameFromHistory(url, function(siteName) {
        chrome.storage.local.get({urls: []}, function(result) {
          const urls = result.urls;
          const index = urls.findIndex(item => item.url === url);
          if (index !== -1) {
            urls[index].siteName = siteName;
            chrome.storage.local.set({urls: urls}, function() {
              updateUrlList();
            });
          }
        });
      });
    }
  });
}

const manualClearButton = document.getElementById('manualClear');
if (manualClearButton) {
  manualClearButton.addEventListener('click', function() {
    updateSiteNames(function() {
      const range = document.getElementById('clearRange').value;
      saveClearRange(range);
      let startTime;
      const now = new Date().getTime();
      switch(range) {
        case 'hour':
          startTime = now - 60 * 60 * 1000;
          break;
        case 'day':
          startTime = now - 24 * 60 * 60 * 1000;
          break;
        case 'week':
          startTime = now - 7 * 24 * 60 * 60 * 1000;
          break;
        case 'all':
          startTime = 0;
          break;
      }
      chrome.storage.local.get({urls: []}, function(result) {
        const baseDomains = result.urls.map(item => {
          const hostname = new URL(item.url).hostname;
          const parts = hostname.split('.');
          return parts.slice(parts.length - 2).join('.'); // 获取一级域名
        });

        chrome.history.search({text: '', startTime: startTime, endTime: now}, function(historyItems) {
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
            addLog(`手动清理：已清理${getRangeText(range)}的历史记录，共${clearedCount}条`);
            playSound();
            showClearResult(clearedCount, range);
            checkLockStatus();
          }).catch(error => {
            console.error(`清理 ${url} 的历史记录时出错:`, error);
          });
        });
      });
    });
  });
}

function saveGlobalInterval(interval) {
  chrome.storage.local.set({globalInterval: interval}, function() {
    if (interval && interval > 0) {
      chrome.storage.local.set({globalAutoClean: true});
      updateAllAlarms(interval);
    } else {
      chrome.storage.local.set({globalAutoClean: false});
      updateAllAlarms(null);
    }
  });
}

function updateAllAlarms(interval) {
  chrome.storage.local.get({urls: [], clearRange: 'hour'}, function(result) {
    const urls = result.urls;
    const clearRange = result.clearRange;
    let isLogAdded = false; // 添加标志位

    urls.forEach(function(item, index) {
      chrome.runtime.sendMessage({
        action: "updateAlarm",
        url: item.url,
        scheduled: interval ? true : false,
        interval: interval,
        clearRange: clearRange
      }, function(response) {
        if (!isLogAdded && response && response.clearedCount !== undefined) {
          addLog(`自动清理：已清理${getRangeText(clearRange)}的历史记录，共${response.clearedCount}条`);
          isLogAdded = true; // 设置标志位为 true
        }
        // 确保在最后一个 URL 处理完后更新 URL 列表
        if (index === urls.length - 1) {
          updateUrlList();
        }
      });
    });
  });
}

const unlockPasswordInput = document.getElementById('unlockPassword');
if (unlockPasswordInput) {
  unlockPasswordInput.addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
      unlock();
    }
  });
}

const changePasswordButton = document.getElementById('changePassword');
if (changePasswordButton) {
  changePasswordButton.addEventListener('click', function() {
    const oldPassword = prompt('请输入旧密码:');
    chrome.storage.local.get(['password'], function(result) {
      if (oldPassword === result.password) {
        const newPassword = prompt('请输入新密码:');
        const newPasswordHint = prompt('请输入新密码提示词:');
        chrome.storage.local.set({password: newPassword, passwordHint: newPasswordHint}, function() {
          alert('密码已修改');
        });
      } else {
        alert('旧密码错误');
      }
    });
  });
}

const forgotPasswordButton = document.getElementById('forgotPassword');
if (forgotPasswordButton) {
  forgotPasswordButton.addEventListener('click', function() {
    chrome.storage.local.get(['passwordHint'], function(result) {
      alert('密码提示词: ' + result.passwordHint);
    });
  });
}

const exportSettingsButton = document.getElementById('exportSettings');
if (exportSettingsButton) {
  exportSettingsButton.addEventListener('click', function() {
    chrome.storage.local.get(null, function(items) {
      const blob = new Blob([JSON.stringify(items)], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({
        url: url,
        filename: 'history_cleaner_settings.json'
      });
    });
  });
}

const importSettingsButton = document.getElementById('importSettings');
if (importSettingsButton) {
  importSettingsButton.addEventListener('click', function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = function(event) {
      const file = event.target.files[0];
      const reader = new FileReader();
      reader.onload = function(e) {
        const settings = JSON.parse(e.target.result);
        chrome.storage.local.set(settings, function() {
          alert('设置已导入');
          updateUrlList();
        });
      };
      reader.readAsText(file);
    };
    input.click();
  });
}

const viewLogsButton = document.getElementById('viewLogs');
if (viewLogsButton) {
  viewLogsButton.addEventListener('click', function() {
    document.getElementById('mainContainer').style.display = 'none';
    document.getElementById('logsContainer').style.display = 'block';
    displayLogs();
  });
}

const closeLogsButton = document.getElementById('closeLogs');
if (closeLogsButton) {
  closeLogsButton.addEventListener('click', function() {
    document.getElementById('logsContainer').style.display = 'none';
    document.getElementById('mainContainer').style.display = 'block';
  });
}

const clearLogsButton = document.getElementById('clearLogs');
if (clearLogsButton) {
  clearLogsButton.addEventListener('click', function() {
    chrome.storage.local.set({logs: []}, function() {
      displayLogs();
      playSound();
    });
  });
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

function displayLogs() {
  chrome.storage.local.get({logs: []}, function(result) {
    const logsElement = document.getElementById('logs');
    if (!logsElement) return;
    const totalClearedCount = result.logs.reduce((count, log) => {
      const match = log.match(/共(\d+)条/);
      return match ? count + parseInt(match[1], 10) : count;
    }, 0);
    logsElement.innerHTML = result.logs.map(log => 
      `<div>${log}</div>`
    ).join('');
    const logsTitle = document.querySelector('#logsContainer h2');
    if (logsTitle) {
      logsTitle.innerHTML = `<span class="large-text">清理日志</span> - 共清理${totalClearedCount}条`;
    }
  });
}

function playSound() {
  const audio = document.getElementById('clearSound');
  if (audio) {
    audio.play().then(() => {
      console.log('Sound played successfully');
    }).catch(error => {
      console.error('Error playing sound:', error);
    });
  } else {
    console.error('Audio element not found');
  }
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

updateUrlList();

function updateLockState() {
  chrome.storage.local.get({locked: false}, function(result) {
    const locked = result.locked;
    if (locked) {
      showLockScreen();
    } else {
      hideLockScreen();
    }
  });
}

function showLockScreen() {
  const unlockPasswordInput = document.getElementById('unlockPassword');
  if (unlockPasswordInput) {
    unlockPasswordInput.value = '';
  }
  const mainContainer = document.getElementById('mainContainer');
  if (mainContainer) {
    mainContainer.style.display = 'none';
  }
  const lockScreen = document.getElementById('lockScreen');
  if (lockScreen) {
    lockScreen.style.display = 'block';
    lockScreen.style.height = '200px';
  }
}

function hideLockScreen() {
  const mainContainer = document.getElementById('mainContainer');
  if (mainContainer) {
    mainContainer.style.display = 'block';
  }
  const lockScreen = document.getElementById('lockScreen');
  if (lockScreen) {
    lockScreen.style.display = 'none';
  }
}

function checkLockStatus() {
  chrome.storage.local.get(['locked', 'password', 'lastOpenTime', 'lockTime'], function(result) {
    if (result.locked) {
      showLockScreen();
    } else if (result.password !== undefined) {
      const currentTime = Date.now();
      const elapsedTime = (currentTime - result.lastOpenTime) / 60000; // 转换为分钟
      if (elapsedTime >= result.lockTime) {
        chrome.storage.local.set({locked: true}, function() {
          showLockScreen();
        });
      } else {
        hideLockScreen();
        resetActivityTimer();
      }
    } else {
      hideLockScreen();
      resetActivityTimer();
    }
  });
}

function resetActivityTimer() {
  const currentTime = Date.now();
  chrome.storage.local.set({lastOpenTime: currentTime}, function() {
    console.log('重置活动计时器，新的最后打开时间：', new Date(currentTime));
  });
}

function unlock() {
  const password = document.getElementById('unlockPassword').value;
  chrome.storage.local.get(['password'], function(result) {
    if (password === result.password || result.password === undefined) {
      chrome.storage.local.set({locked: false}, function() {
        hideLockScreen();
        resetActivityTimer();
      });
    } else {
      alert('密码错误');
    }
  });
}

function saveClearRange(range) {
  chrome.storage.local.set({clearRange: range}, function() {
    console.log('清理时间范围已保存:', range);
  });
}

function showClearResult(clearedCount, range) {
  const clearResult = document.getElementById('clearResult');
  clearResult.innerText = `已清理${getRangeText(range)}的历史记录，共${clearedCount}条`;
  clearResult.style.display = 'block';

  // 隐藏清理结果信息，假设5秒后隐藏
  setTimeout(() => {
    clearResult.style.display = 'none';
  }, 5000);
}

function initializePopup() {
  chrome.storage.local.get(['lockTime', 'locked', 'lastOpenTime', 'shouldLock'], function(result) {
    lockTime = result.lockTime || 300;
    lastOpenTime = result.lastOpenTime || Date.now();
    const lockTimeInput = document.getElementById('lockTimeInput');
    if (lockTimeInput) {
      lockTimeInput.value = lockTime;
    }
    
    // 首先检查是否应该锁定
    checkLockStatus();
  });
}

// 当插件关闭时，通知后台脚本
window.addEventListener('unload', function() {
  console.log('弹出窗口关闭，发送 popupClosed 消息');
  const currentTime = Date.now();
  const usedTime = currentTime - lastOpenTime;
  chrome.runtime.sendMessage({
    action: "popupClosed", 
    usedTime: usedTime, 
    lockTime: lockTime
  }, function(response) {
    if (chrome.runtime.lastError) {
      console.error('发送 popupClosed 消息时出错:', chrome.runtime.lastError);
    } else if (response && response.success) {
      console.log('成功发送 popupClosed 消息');
    }
  });
});

// 添加这个函数来处理插件锁定
function handleLockPlugin() {
  console.log('收到锁定插件的消息，显示锁定屏幕');
  showLockScreen();
}

// 确保这个监听器被正确添加
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('popup.js 收到消息：', request);
  if (request.action === "lockPlugin") {
    handleLockPlugin();
    sendResponse({success: true});
  }
  return true; // 保持消息通道开放
});

