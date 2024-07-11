let { app, BrowserWindow, session, ipcMain } = require('electron');
let path = require('path');
let fs = require('fs').promises; // Use promises for async file operations
let mysql = require('mysql2/promise'); // Use mysql2 for promises
let proxyChain = require('proxy-chain');
const fetch = require('node-fetch');
const HttpsProxyAgent = require('https-proxy-agent');

function parseProxyAddress(proxyAddress) {
  const [ip, port] = proxyAddress.split(':');
  return {
    ip: ip,
    port: parseInt(port, 10)
  };
}



let mainWindow;
let allwindows = [];
function closeAllWindows() {
  allwindows.forEach(win => {
    if (win && !win.isDestroyed()) {
      win.close();
    }
  });
  allwindows = [];
  mainWindow.close();
}


async function getIPAddress() {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    // document.getElementById('ip-address').textContent = data.ip;
    console.log(data.ip)
    return data.ip
  } catch (error) {
    console.error('Error fetching IP address:', error);
    // document.getElementById('ip-address').textContent = 'Error fetching IP address';
    return '0.0.0.0'
  }
}

// let dbConfig = {
//   host: "localhost",
//   user: "root",
//   password: "",
//   database: "traffic"
// };


let dbConfig = {
  host: "lithium.scnservers.net",
  user: "rbugtige_Traffic",
  password: "Kyppma2PHCnbZK2MGacq",
  database: "rbugtige_Traffic",
  port: "3306"
};


async function initDatabase() {
  try {
    con = await mysql.createConnection(dbConfig);

    await con.query("CREATE DATABASE IF NOT EXISTS traffic");

    await con.changeUser({ database: 'traffic' });

    let createTableQuery = `
      CREATE TABLE IF NOT EXISTS Traffic_Campaigns (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user TEXT,
        campaignName TEXT,
        domain TEXT,
        urls TEXT,
        keywords TEXT,
        search_engines TEXT,
        repetitionCount INT,
        visitCountFrom INT,
        visitCountTo INT,
        count INT,
        from_time INT,
        to_time INT,
        scroll_duration INT,
        cookie_files TEXT,
        proxyFile TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `;

    let cookieTableQuery = `
      CREATE TABLE IF NOT EXISTS cookies (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cookie TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `;

    let licenseTableQuery = `
      CREATE TABLE IF NOT EXISTS licenses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        license_key TEXT
      )
    `;

    let tasksTableQuery = `
      CREATE TABLE IF NOT EXISTS tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user TEXT,
        campaignId INT,
        task TEXT,
        status TEXT,
        response TEXT,
        schedule TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `;

    await con.query(tasksTableQuery);
    await con.query(createTableQuery);
    await con.query(cookieTableQuery);
    await con.query(licenseTableQuery);
    console.log("Connected");
  } catch (err) {
    console.log("Connection error");
    console.log(err);
  }
}


// Function to extract cookies from the content
async function cookieExtract(content) {
  try {
    // Parse the content as JSON
    const cookies = JSON.parse(content);
    // Map to the desired format
    const formattedCookies = cookies.map(cookie => ({
      url: `http${cookie.secure ? 's' : ''}://${cookie.domain.startsWith('.') ? 'www' : ''}${cookie.domain}${cookie.path}`,
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      secure: cookie.secure,
      expirationDate: cookie.expirationDate
    }));
    return formattedCookies;
  } catch (err) {
    console.error('Error extracting cookies:', err);
    return [];
  }
}


async function parseCookies(filePath) {
  try {
    if (filePath.includes("+")) {
      filePath = filePath.replaceAll('+', '\\\\');
    }
    else {
      filePath = filePath.replace(/\\/g, '\\\\');
    }
    let content = await fs.readFile(filePath, 'utf-8');
    let cookies = content.split('\n').reduce((acc, line) => {
      if (line && !line.startsWith('#')) {
        let parts = line.split('\t');
        if (parts.length >= 7) {
          let [domain, , path, secure, expiry, name, value] = parts;
          acc.push({
            url: `http${secure === 'TRUE' ? 's' : ''}://${domain.startsWith('.') ? 'www' : ''}${domain}${path}`,
            name,
            value,
            domain,
            path,
            secure: secure === 'TRUE',
            expirationDate: parseInt(expiry)
          });
        }
      }
      return acc;
    }, []);
    return cookies;
  } catch (error) {
    return [];
  }
}

async function parseProxies(filePath) {
  console.log(filePath)
  try {
    if (filePath[0].includes("+")) {
      filePath = filePath[0].replaceAll('+', '\\\\');
    }
    else {
      filePath = filePath[0].replace(/\\/g, '\\\\');
    }
    console.log('filePath')
    console.log(filePath)
    let content = await fs.readFile(filePath, 'utf-8');
    return content.split('\n').map(line => line.trim()).filter(line => line);
  } catch (error) {
    return [];
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      devTools: true,
    },
  });

  mainWindow.loadFile('frontend/index.html');

  // mainWindow.webContents.openDevTools()

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  createMainWindow();
  initDatabase();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (!mainWindow) {
    createMainWindow();
  }
});
const storage = require('electron-json-storage');

ipcMain.on("signIn", async (event, data) => {
  console.log('signin');
  try {
    let { key } = data;
    // Use a promise to handle the asynchronous query
    let [rows] = await con.query("SELECT * FROM licenses");
    for (let i = 0; i < rows.length; i++) {
      if (key == rows[i]['license_key']) {
        console.log(key);
        // Store the key in electron-json-storage
        storage.set('key', key, (error) => {
          if (error) {
            console.error(error);
            // event.reply("reply", false);
          } else {
            event.reply("reply", true);
            console.log('Key stored in electron-json-storage successfully');
          }
        });
      }
    }
    event.reply("reply", false);
  } catch (error) {
    console.error(error);
    event.reply("reply", false);
  }
});

ipcMain.on('validate', async (event) => {
  console.log('validating');
  // Check if the key exists in electron-json-storage
  storage.get('key', (error, data) => {
    if (error) {
      console.error(error);
      event.reply("reply", false);
    } else {
      if (data && data.key) {
        event.reply("reply", true);
        console.log('Key found in electron-json-storage');
      } else {
        event.reply("reply", false);
        console.log('Key not found in electron-json-storage');
      }
    }
  });
});

ipcMain.on('create-task', async (event, data) => {
  try {
    console.log('task creating')
    let {
      user,
      campaignId,
      task,
      schedule
    } = data;
    console.log(data)
    let query = `
      INSERT INTO tasks (
        user ,campaignId, task, status, schedule
      ) VALUES (?, ?, ?, ?, ?)
    `;
    let [taskidget] = await con.query(query, [
      user, campaignId, task, 'pending', schedule
    ]);
    console.log('taskidget')
    console.log(taskidget)
    if (task == "view") {
      event.reply("create-task-reply", taskidget.insertId);
    }
  }
  catch (err) {

  }
})

ipcMain.on("tasks_history", async (event) => {
  try {
    let query = `
    SELECT * 
    FROM tasks 
    WHERE task = 'start' 
  `;

    let [rows] = await con.query(query);
    event.reply("tasks_reply", rows.reverse());
  } catch (err) {
    console.log(err)
  }
});

ipcMain.on("admin_history", async (event) => {
  try {

    let [rows] = await con.query("SELECT * FROM Traffic_Campaigns");
    event.reply("reply", rows.reverse());
  } catch (err) {
    console.log(err)
  }
});

ipcMain.on("deleteTask", async (event, data) => {
  try {
    let { id } = data;
    var sql = 'DELETE FROM tasks WHERE id = ?';
    // Use a promise to handle the asynchronous query
    let result = await new Promise((resolve, reject) => {
      con.query(sql, [id], (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
    console.log("Number of records deleted: " + result.affectedRows);
  } catch (er) {
    console.log("Unexpected Error:", er);
  }
});

async function startCampaign(campaignId, taskId) {
  let [rows] = await con.query("SELECT * FROM Traffic_Campaigns WHERE id = ?", [campaignId]);
  await con.query("UPDATE tasks SET status = 'success' WHERE id = ?", [taskId]);
  return rows[0];
}

async function adminStopCampaign(taskId) {
  await con.query("UPDATE tasks SET status = 'success' WHERE id = ?", [taskId]);
  // return rows[0];
}

async function adminViewCampaign(taskId) {
  await con.query("UPDATE tasks SET status = 'success' WHERE id = ?", [taskId]);
  let profiles = allwindows.length;
  let active = false;
  if (profiles > 0) {
    active = true;
  }
  let response = `{ "profiles": ${profiles}, "active": ${active} }`
  await con.query("UPDATE tasks SET response = ? WHERE id = ?", [response, taskId]);
  return response;
}

ipcMain.on("admin-view-call", async (event, data) => {
  try {
    let { id } = data;
    console.log('admin-view-call')
    console.log(id)
    let [rows] = await con.query("SELECT * FROM tasks WHERE id = ?", [id]);
    console.log('rows')
    console.log(rows)
    console.log(rows[0]['response'])
    event.reply("admin-view", rows[0].response);
  } catch (er) {
    console.log("Unexpected Error:", er);
  }
})
ipcMain.on("check-tasks", async (event) => {
  try {
    console.log('checking');
    let user = await getIPAddress();
    let query = `
  SELECT * 
  FROM tasks 
  WHERE user = ? 
    AND status = 'pending' 
    AND schedule < NOW()
`;

    let [rows] = await con.query(query, [user]);
    rows = rows.reverse()
    console.log(rows)
    // Send the result back to the renderer process
    for (let i = 0; i < rows.length; i++) {
      if (rows[i]['task'] == 'start') {
        let data = await startCampaign(rows[i]['campaignId'], rows[i]['id']);
        event.reply("admin-start", data);
      }
      else if (rows[i]['task'] == 'stop') {
        await adminStopCampaign(rows[i]['id']);
        event.reply("admin-stop");
      }
      else if (rows[i]['task'] == 'view') {
        let response = await adminViewCampaign(rows[i]['id']);
        // event.reply("admin-view", response);
      }
    }
  } catch (err) {
    console.log(err);
    // Send an error response back to the renderer process
    event.reply("tasks-error", err.message);
  }
});

ipcMain.on("deleteCampaign", async (event, data) => {
  try {
    let { id } = data;
    var sql = 'DELETE FROM Traffic_Campaigns WHERE id = ?';
    // Use a promise to handle the asynchronous query
    let result = await new Promise((resolve, reject) => {
      con.query(sql, [id], (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
    console.log("Number of records deleted: " + result.affectedRows);
  } catch (er) {
    console.log("Unexpected Error:", er);
  }
});


ipcMain.on("upload-cookies", async (event, data) => {
  console.log(done)
});



ipcMain.on("history", async (event) => {
  try {
    user = await getIPAddress()
    const [rows] = await con.query("SELECT * FROM Traffic_Campaigns WHERE user = ?", [user]);
    event.reply("reply", rows.reverse());
  } catch (err) {
  }
});




async function getProxyIPAddress(proxy) {
  try {
    let agent = new HttpsProxyAgent(proxy);
    const response = await fetch('https://api.ipify.org?format=json', { agent });
    const data = await response.json();
    console.log(data.ip);
    return data.ip;
  } catch (error) {
    console.error('Error fetching IP address:', error);
    return '0.0.0.0';
  }
}

async function getGeolocation(ip, proxy) {
  let agent = new HttpsProxyAgent(proxy);
  const response = await fetch(`https://ipinfo.io/${ip}/json`, {agent});
  const data = await response.json();
  return data;
}



ipcMain.on('open-windows', async (event, data) => {
  try {
    let {
      campaignName,
      urls,
      keywords,
      searchEngines,
      repetitionCount,
      visitCountFrom,
      visitCountTo,
      count,
      fromTime,
      toTime,
      scrollDuration,
      cookieFiles,
      proxyFile,
      domain,
      rotate,
      noCookie
    } = data;

    console.log('noCookie')
    console.log(noCookie)
    console.log('proxyFile');
    console.log(proxyFile);
    let query = `
      INSERT INTO Traffic_Campaigns (
        user ,campaignName, urls, keywords, search_engines, repetitionCount, visitCountFrom, visitCountTo, count,
        from_time, to_time, scroll_duration, cookie_files, proxyFile, domain
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    user = await getIPAddress()
    await con.query(query, [
      user, campaignName, urls.join(","), keywords.join(","), searchEngines.join(","),
      repetitionCount, visitCountFrom, visitCountTo, count, fromTime, toTime, scrollDuration,
      cookieFiles.join(",").replaceAll(/\\/g, '+'), proxyFile[0].replaceAll(/\\/g, '+'), domain
    ]);

    let userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.207 Safari/537.36',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.36',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.37',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.38',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.39',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.40',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.41',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.42',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.43',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.44',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.45',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.46',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.47',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.48',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.49',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.50',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.51',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.52',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.53',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.54',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.55',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.56',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.57',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.58',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.59',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.60',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.61',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.62',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.63',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.64',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.65',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.66',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.67',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.68',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.69',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.70',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.71',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.72',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.73',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.74',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.75',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.76',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.77',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.78',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.79',
      // 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.80'
    ];


    let searchUrls = {
      google: keyword => `https://www.google.com/search?q=${encodeURIComponent(keyword)}`,
      bing: keyword => `https://www.bing.com/search?q=${encodeURIComponent(keyword)}`,
      yahoo: keyword => `https://search.yahoo.com/search?p=${encodeURIComponent(keyword)}`,
      duckduckgo: keyword => `https://duckduckgo.com/?q=${encodeURIComponent(keyword)}`
    };

    let proxies = await parseProxies(proxyFile);
    let pr = 0;

    async function perform(j) {
      let visitCount = Math.floor(Math.random() * (visitCountTo - visitCountFrom + 1)) + visitCountFrom;
      console.log('-=-=-=-=-=-=-=');
      console.log(visitCount);
      for (let i = 0; i < count; i++) {
        let partitionName = `persist:window${i}-${Date.now()}`; // Create a unique partition name
        let customSession = session.fromPartition(partitionName); // Create a unique session for each window

        // Set the proxy for this session
        if (pr * j >= proxies.length) {
          pr = 0;
        }
        let randomProxy = `http://${proxies[pr * j]}`;
        pr += 1;
        let chainedProxyUrl = await proxyChain.anonymizeProxy(randomProxy);
        console.log('chainedProxyUrl');
        console.log(chainedProxyUrl);

        await customSession.setProxy({ proxyRules: chainedProxyUrl });
        let ip = await getProxyIPAddress(chainedProxyUrl)
        let geo = await getGeolocation(ip,chainedProxyUrl);
        console.log('geo')
        console.log(geo)
        console.log(geo.timezone)

        process.env.TZ = geo.timezone; // Set the desired timezone
        process.env.LANG = 'en-GB,en-US;q=0.9,en;q=0.8';    // Set the desired language
        app.commandLine.appendSwitch('lang', 'en-US'); // Example: English (United States)
        // Example of using Intl API for date formatting
        const date = new Date();
        const formattedDate = new Intl.DateTimeFormat('en-US').format(date);
        console.log(formattedDate); // Outputs formatted date in 'MM/DD/YYYY' format
        
        // Example of using Intl API for number formatting
        const number = 123456.78;
        const formattedNumber = new Intl.NumberFormat('en-US').format(number);
        console.log(formattedNumber); // Outputs formatted number with thousands separator and decimal point according to locale
        

        let win = new BrowserWindow({
          width: 1930,
          height: 1080,
          webPreferences: {
            // parent: mainWindow,
            // preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: true,
            devTools: true,
            session: customSession, // Use the custom session for this window
            allowLegacyTLS: true,
            webRTCIPHandlingPolicy: 'default_public_interface_only', // Disable non-proxied UDP for WebRTC
            disableNonProxiedUdp: false, // Ensure non-proxied UDP is disabled
            userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.207 Safari/537.36'
          },
        });


        allwindows.push(win); // Store the window reference

        let randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
        // win.webContents.setUserAgent(randomUserAgent);

        if (cookieFiles.length <= 1) {
          if (noCookie) { }
          else {
            let [rows] = await con.query("SELECT * FROM cookies");
            let randomCookie = rows[Math.floor(Math.random() * rows.length)]
            // let Kookie = await cookieExtract(randomCookie['cookie'])
            let Kookie = randomCookie
            if (Kookie) {
              for (let cookie = 0; cookie < Kookie.length; cookie++) {
                try {
                  await customSession.cookies.set(Kookie[cookie]);
                } catch (err) {
                  console.error('Error setting cookie:', err, cookie);
                }
              }
              id = randomCookie['id']
              // Use a promise to handle the asynchronous query
              let deleteQuery = `DELETE FROM cookies WHERE id = ?`;
              await con.query(deleteQuery, [id]);
            }
          }
        }
        let randomCookieFile = cookieFiles[Math.floor(Math.random() * cookieFiles.length)];
        let cookies = await parseCookies(randomCookieFile);

        for (let cookie of cookies) {
          await customSession.cookies.set(cookie);
        }

        let targetUrl = searchUrls[searchEngines[Math.floor(Math.random() * searchEngines.length)]](keywords[Math.floor(Math.random() * keywords.length)]);

        win.loadURL(targetUrl);
        // win.webContents.openDevTools()

        let clickCount = 0;
        win.webContents.on('did-finish-load', () => {
          let scrollSpeed = Math.floor(Math.random() * ((toTime * 10) - (fromTime * 10) + 1)) + (fromTime * 10);
          let scrollInterval = Math.floor(Math.random() * (toTime - fromTime + 1) + fromTime) * 1000;

          clickCount++;
          win.webContents.executeJavaScript(`
            (async function() {
                let direction = 1;
                let scrollHeight = document.body.scrollHeight - window.innerHeight;
                let scrollIntervalId;
                let clickCount = 0;
                let currentUrl = window.location.href;
                
                async function getIpAddress() {
                    const response = await fetch('https://api.ipify.org?format=json');
                    const data = await response.json();
                    return data.ip;
                }
                    
                
                async function getGeolocation(ip) {
                    const response = await fetch(\`https://ipapi.co/\${ip}/json/\`);
                    const data = await response.json();
                    return data;
                }
                
                async function setGeolocation() {
                    const ip = await getIpAddress();
                    const geoData = ${JSON.stringify(geo)}
                    console.log('geoData')
                    console.log(geoData)
                    console.log(geoData.region)
                    console.log('IP Address:', ip);
                    console.log('Geolocation:', geoData);
                }
                
                function smoothScroll() {
                    let scrollY = window.scrollY;
                    let newScrollY = scrollY + direction * ${scrollSpeed};
                    window.scrollTo({ top: newScrollY, behavior: 'smooth' });
                    
                    if (newScrollY >= scrollHeight || newScrollY <= 0) {
                        direction *= -1;
                    }
                }
                
                function startScrolling() {
                    scrollIntervalId = setInterval(smoothScroll, 200);
                }
                
                function stopScrolling() {
                    clearInterval(scrollIntervalId);
                }
                
                function clickRandomLink() {
                    let links = document.querySelectorAll('a[href]');
                    if (currentUrl.includes('google.com')) {
                        console.log("Target URL is Google");
                        links = document.querySelectorAll('a[href][jsname="UWckNb"]');
                        if ('${rotate}' == 'true') {
                        } else {
                            links = Array.from(links).filter(link => link.href.includes('${domain}'));
                        }
                    }
                    console.log("Number of links:", links.length);
                    if (links.length > 0) {
                        let randomIndex = Math.floor(Math.random() * links.length);
                        console.log("Random link index:", randomIndex);
                        let urls = ${JSON.stringify(urls)};
                        if (urls.includes(links[randomIndex].href)) {
                            links[randomIndex].click();
                        } else {
                            location.href = urls[Math.floor(Math.random() * urls.length)];
                        }
                        currentUrl = window.location.href;
                    }
                    else {
                        window.location.href = 'https://${domain}';
                    }
                }
                
                function checkInfoDiv() {
                    return document.getElementById('infoDiv0') !== null;
                }
                
                async function performActions() {
                    await setGeolocation(); // Get and set the geolocation before starting actions
                    

                    // Overwriting the RTCPeerConnection object
                    if (window.RTCPeerConnection) {
                        window.RTCPeerConnection = function() {
                            throw new Error("WebRTC is disabled");
                        };
                    }
                    
                    // Overwriting the getUserMedia function
                    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                        navigator.mediaDevices.getUserMedia = function() {
                            return Promise.reject(new Error("getUserMedia is disabled"));
                        };
                    }

                    if (checkInfoDiv()) {
                        window.close(); // Close the window if the infoDiv0 is found
                        return;
                    }
                    // startScrolling();
                    setTimeout(() => {
                        stopScrolling();
                        clickRandomLink();
                        clickCount++;
                        if (clickCount < ${visitCount}) {
                            setTimeout(() => {
                                performActions(); // Recursive call to perform actions again
                            }, 3000);
                        } else {
                            window.close(); // Close the window after completing the actions
                        }
                    }, ${scrollDuration * 1000});
                }
                
                performActions(); // Start the actions for the first time
            })();
            `);
                  
        });

        win.on('closed', () => {
          win = null;
        });
      }
    }

    let t = (visitCountTo * (scrollDuration + 5) + 40) * 1000;
    let mt = t;
    await perform(1);
    for (let j = 0; j < repetitionCount; j++) {
      setTimeout(
        async () => {
          allwindows.forEach(win => {
            win.close();
          });
          await perform(j + 1);
          console.log('performing')
        },
        t
      );
      t += mt;
    }
  } catch (err) {
    console.error(err);
  }
});


// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=- COOKIES COLLECTOR -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

ipcMain.on('collect-cookies', async (event, data) => {
  console.log("here");
  try {
    let {
      urls,
      keywords,
      searchEngines,
      repetitionCount,
      visitCountFrom,
      visitCountTo,
      count,
      fromTime,
      toTime,
      scrollDuration,
    } = data;

    let [rows] = await con.query("SELECT * FROM cookies");
    rows = rows.reverse();
    let userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
      'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Mobile Safari/537.36',
    ];

    let searchUrls = {
      google: keyword => `https://www.google.com/search?q=${encodeURIComponent(keyword)}`,
      bing: keyword => `https://www.bing.com/search?q=${encodeURIComponent(keyword)}`,
      yahoo: keyword => `https://search.yahoo.com/search?p=${encodeURIComponent(keyword)}`,
      duckduckgo: keyword => `https://duckduckgo.com/?q=${encodeURIComponent(keyword)}`
    };

    let width = 1930;
    let windows = []; // Array to store all opened windows

    async function perform() {
      let visitCount = Math.floor(Math.random() * (visitCountTo - visitCountFrom + 1)) + visitCountFrom;
      for (let i = 0; i < count; i++) {
        width = width - 10;
        let win = new BrowserWindow({
          width: 1930,
          height: 1080,
          webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: false,
            devTools: true,
          },
        });
        allwindows.push(win); // Store the window reference

        let randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
        win.webContents.setUserAgent(randomUserAgent);

        let targetUrl = urls.length > 0 && Math.random() > 0.5
          ? urls[Math.floor(Math.random() * urls.length)]
          : searchUrls[searchEngines[Math.floor(Math.random() * searchEngines.length)]](keywords[Math.floor(Math.random() * keywords.length)]);

        win.loadURL(targetUrl);
        // win.loadURL('https://bot.sannysoft.com/');
        // win.webContents.openDevTools();

        win.webContents.on('did-finish-load', async () => {
          let scrollSpeed = Math.floor(Math.random() * 5) + 2;
          let scrollInterval = Math.floor(Math.random() * (toTime - fromTime + 1) + fromTime) * 1000;

          win.webContents.executeJavaScript(`
            (function() {
              let direction = 1;
              let scrollHeight = document.body.scrollHeight - window.innerHeight;
              let scrollIntervalId;
              let clickCount = 0;
              let currentUrl = window.location.href;

              function smoothScroll() {
                let scrollY = window.scrollY;
                let newScrollY = scrollY + direction * ${scrollSpeed};
                window.scrollTo({ top: newScrollY, behavior: 'smooth' });

                if (newScrollY >= scrollHeight || newScrollY <= 0) {
                  direction *= -1;
                }
              }

              function startScrolling() {
                scrollIntervalId = setInterval(smoothScroll, 100);
              }

              function stopScrolling() {
                clearInterval(scrollIntervalId);
              }

              function clickRandomLink() {
                window.scrollTo({
                  top: 0,
                  behavior: 'smooth'
                });
                let links = document.querySelectorAll('a[href]');
                if (currentUrl.includes('google.com')) {
                  console.log("Target URL is Google");
                  links = document.querySelectorAll('a[href][jsname="UWckNb"]');
                }
                console.log("Number of links:", links.length);
                if (links.length > 0) {
                  let randomIndex = Math.floor(Math.random() * links.length);
                  console.log("Random link index:", randomIndex);
                  links[randomIndex].click();
                  currentUrl = window.location.href;
                }
              }

              function performActions() {
                startScrolling();
                setTimeout(() => {
                  stopScrolling();
                  clickRandomLink();
                  clickCount++;
                  if (clickCount < ${visitCount}) {
                    setTimeout(() => {
                      performActions(); // Recursive call to perform actions again
                    }, 3000);
                  } else {
                    window.close(); // Close the window after completing the actions
                  }
                }, ${scrollDuration * 1000});
              }

              performActions(); // Start the actions for the first time
            })();
          `);

          // Retrieve and save cookies after all actions are performed
          setTimeout(async () => {
            try {
              let cookies = await win.webContents.session.cookies.get({});
              let cookieData = JSON.stringify(cookies, null, 2);
              console.log(cookieData)
              try {
                let query = `
                  INSERT INTO cookies (
                    cookie
                  ) VALUES (?)
                `;
                await con.query(query, [
                  cookieData
                ]);
              }
              catch (err) {

              }
            } catch (error) {
              console.error('Error getting cookies', error);
            }
          }, (scrollDuration + 10) * 1000);

        });

        win.on('closed', () => {
          // Remove the window from the array when it's closed
          windows = windows.filter(w => w !== win);
        });
      }
    }

    let t = (visitCountTo * (scrollDuration + 5) + 60) * 1000;
    let mt = t;
    perform();
    for (let j = 0; j < repetitionCount; j++) {
      setTimeout(() => {
        perform();
      }, t);
      t = t + mt;
    }

    // Expose the closeAllWindows function globally or attach it to some event as needed

  } catch (err) {
    console.error("Error:", err);
  }
});


// CLOSE ALL WINDOWS
ipcMain.on('close-all-windows', () => {
  closeAllWindows()
});