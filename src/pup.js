const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises; // Use promises for async file operations
const mysql = require('mysql2/promise'); // Use mysql2 for promises
const proxyChain = require('proxy-chain');
const os = require('os');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');


let mainWindow;
let allwindows = [];
function closeAllWindows() {
  allwindows.forEach(win => {
    if (win && !win.isDestroyed()) {
      win.close();
    }
  });
  allwindows = [];
}

// const dbConfig = {
// host: "localhost",
// user: "root",
// password: "",
// database: "traffic"
// };

const dbConfig = {
  host: "lithium.scnservers.net",
  user: "rbugtige_Traffic",
  password: "Kyppma2PHCnbZK2MGacq",
  database: "rbugtige_Traffic",
  port: "3306"
};


let con;

async function initDatabase() {
  try {
    con = await mysql.createConnection(dbConfig);

    await con.query("CREATE DATABASE IF NOT EXISTS traffic");

    await con.changeUser({ database: 'traffic' });

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS traffictable (
        id INT AUTO_INCREMENT PRIMARY KEY,
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const cookieTableQuery = `
      CREATE TABLE IF NOT EXISTS cookies (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cookie TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await con.query(createTableQuery);
    await con.query(cookieTableQuery);

  } catch (err) {
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
    const content = await fs.readFile(filePath, 'utf-8');
    const cookies = content.split('\n').reduce((acc, line) => {
      if (line && !line.startsWith('#')) {
        const parts = line.split('\t');
        if (parts.length >= 7) {
          const [domain, , path, secure, expiry, name, value] = parts;
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
    const content = await fs.readFile(filePath, 'utf-8');
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

ipcMain.on("deleteCampaign", async (event, data) => {
  try {
    const { id } = data;
    var sql = 'DELETE FROM traffictable WHERE id = ?';
    // Use a promise to handle the asynchronous query
    const result = await new Promise((resolve, reject) => {
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
    const [rows] = await con.query("SELECT * FROM traffictable");
    event.reply("reply", rows.reverse());
  } catch (err) {
  }
});


// MAIN FUNCTION


ipcMain.on('open-windows', async (event, data) => {
  try {
    const {
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
      rotate
    } = data;

    console.log('proxyFile')
    console.log(proxyFile)
    const query = `
      INSERT INTO traffictable (
        campaignName, urls, keywords, search_engines, repetitionCount, visitCountFrom, visitCountTo, count,
        from_time, to_time, scroll_duration, cookie_files, proxyFile, domain
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await con.query(query, [
      campaignName, urls.join(","), keywords.join(","), searchEngines.join(","),
      repetitionCount, visitCountFrom, visitCountTo, count, fromTime, toTime, scrollDuration,
      cookieFiles.join(",").replaceAll(/\\/g, '+'), proxyFile[0].replaceAll(/\\/g, '+'), domain
    ]);
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
      'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Mobile Safari/537.36',
    ];

    const searchUrls = {
      google: keyword => `https://www.google.com/search?q=${encodeURIComponent(keyword)}`,
      bing: keyword => `https://www.bing.com/search?q=${encodeURIComponent(keyword)}`,
      yahoo: keyword => `https://search.yahoo.com/search?p=${encodeURIComponent(keyword)}`,
      duckduckgo: keyword => `https://duckduckgo.com/?q=${encodeURIComponent(keyword)}`
    };

    const proxies = await parseProxies(proxyFile);
    let rc = 0;
    let width = 1930;
    let pr = 0;
    async function perform() {
      let visitCount = Math.floor(Math.random() * (visitCountTo - visitCountFrom + 1)) + visitCountFrom
      console.log('-=-=-=-=-=-=-=')
      console.log(visitCount)
      for (let i = 0; i < count; i++) {
        width = 1930;
        // let win = new BrowserWindow({
        //   width: 1930,
        //   height: 1080,
        //   webPreferences: {
        //     preload: path.join(__dirname, 'preload.js'),
        //     nodeIntegration: true,
        //     contextIsolation: false,
        //     devTools: true,
        //   },
        // });
        // allwindows.push(win); // Store the window reference


        const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
        const randomCookieFile = cookieFiles[Math.floor(Math.random() * cookieFiles.length)];
        const cookies = await parseCookies(randomCookieFile);
        const targetUrl = searchUrls[searchEngines[Math.floor(Math.random() * searchEngines.length)]](keywords[Math.floor(Math.random() * keywords.length)]);

        if (pr < proxies.length) {

        }
        else {
          pr = 0
        }
        const randomProxy = `http://${proxies[pr]}`;
        console.log('randomProxy')
        console.log(pr)
        pr = pr + 1
        console.log(randomProxy)

        await(async () => {
          const browser = await puppeteer.launch({
            headless: false,
            // args: ['--no-sandbox', randomProxy]
          });

          const page = await browser.newPage();
          await page.setViewport({
            width: 1920,
            height: 1080,
            deviceScaleFactor: 1,
          });        
          await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
          
          setTimeout(async () => {
            await page.evaluate((scrollSpeed, rotate, domain, urls, visitCount, scrollDuration) => {
              let direction = 1;
              let scrollHeight = document.body.scrollHeight - window.innerHeight;
              let scrollIntervalId;
              let clickCount = 0;
              let currentUrl = window.location.href;
          
              function smoothScroll() {
                let scrollY = window.scrollY;
                let newScrollY = scrollY + direction * scrollSpeed;
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
                  if (rotate == true) {
                  } else {
                    links = Array.from(links).filter(link => link.href.includes(domain));
                  }
                }
                console.log("Number of links:", links.length);
                if (links.length > 0) {
                  let randomIndex = Math.floor(Math.random() * links.length);
                  console.log("Random link index:", randomIndex);
                  let urls = JSON.parse(urls);
                  if (urls.includes(links[randomIndex].href)) {
                    links[randomIndex].click();
                  } else {
                    location.href = urls[0];
                  }
                  currentUrl = window.location.href;
                }
                else {
                  window.location.href = 'https://' + domain;
                }
              }
          
              function checkInfoDiv() {
                return document.getElementById('infoDiv0') !== null;
              }
          
              function performActions() {
                if (checkInfoDiv()) {
                  window.close(); // Close the window if the infoDiv0 is found
                  return;
                }
                startScrolling();
                setTimeout(() => {
                  stopScrolling();
                  clickRandomLink();
                  clickCount++;
                  if (clickCount < visitCount) {
                    setTimeout(() => {
                      performActions(); // Recursive call to perform actions again
                    }, 3000);
                  } else {
                    window.close(); // Close the window after completing the actions
                  }
                }, scrollDuration * 1000);
              }
          
              performActions(); // Start the actions for the first time
            }, scrollSpeed, rotate, domain, JSON.stringify(urls), visitCount, scrollDuration);
          


            await page.waitForTimeout(40000);
            await browser.close();
          }, 3000);

        })();






        // win.webContents.setUserAgent(randomUserAgent);


        // const ses = win.webContents.session;
        // for (const cookie of cookies) {
        //   await ses.cookies.set(cookie);
        // }



        // const chainedProxyUrl = await proxyChain.anonymizeProxy(randomProxy);

        // // Set proxy for this specific session
        // await ses.setProxy({ proxyRules: chainedProxyUrl });

        // win.loadURL(targetUrl);
        // // win.webContents.openDevTools()

        // let clickCount = 0;
        // win.webContents.on('did-finish-load', () => {
        //   const scrollSpeed = Math.floor(Math.random() * ((toTime * 10) - (fromTime * 10) + 1)) + (fromTime * 10);
        //   const scrollInterval = Math.floor(Math.random() * (toTime - fromTime + 1) + fromTime) * 1000;

        //   clickCount++;
        //   win.webContents.executeJavaScript(`
        //   (function() {
        //     let direction = 1;
        //     let scrollHeight = document.body.scrollHeight - window.innerHeight;
        //     let scrollIntervalId;
        //     let clickCount = 0;
        //     let currentUrl = window.location.href;

        //     function smoothScroll() {
        //       let scrollY = window.scrollY;
        //       let newScrollY = scrollY + direction * ${scrollSpeed};
        //       window.scrollTo({ top: newScrollY, behavior: 'smooth' });

        //       if (newScrollY >= scrollHeight || newScrollY <= 0) {
        //         direction *= -1;
        //       }
        //     }

        //     function startScrolling() {
        //       scrollIntervalId = setInterval(smoothScroll, 200);
        //     }

        //     function stopScrolling() {
        //       clearInterval(scrollIntervalId);
        //     }

        //     function clickRandomLink() {
        //       let links = document.querySelectorAll('a[href]');
        //       if (currentUrl.includes('google.com')) {
        //         console.log("Target URL is Google");
        //         links = document.querySelectorAll('a[href][jsname="UWckNb"]');
        //         if ('${rotate}' == 'true') {
        //         } else {
        //           links = Array.from(links).filter(link => link.href.includes('${domain}'));
        //         }
        //       }
        //       console.log("Number of links:", links.length);
        //       if (links.length > 0) {
        //         let randomIndex = Math.floor(Math.random() * links.length);
        //         console.log("Random link index:", randomIndex);
        //         let urls = ${JSON.stringify(urls)};
        //         if (urls.includes(links[randomIndex].href)) {
        //           links[randomIndex].click();
        //         } else {
        //           location.href = urls[0];
        //         }
        //         currentUrl = window.location.href;
        //       }
        //       else {
        //         window.location.href = 'https://${domain}'
        //       }
        //     }

        //     function checkInfoDiv() {
        //       return document.getElementById('infoDiv0') !== null;
        //     }

        //     function performActions() {
        //       if (checkInfoDiv()) {
        //         window.close(); // Close the window if the infoDiv0 is found
        //         return;
        //       }
        //       startScrolling();
        //       setTimeout(() => {
        //         stopScrolling();
        //         clickRandomLink();
        //         clickCount++;
        //         if (clickCount < ${visitCount}) {
        //           setTimeout(() => {
        //             performActions(); // Recursive call to perform actions again
        //           }, 3000);
        //         } else {
        //           window.close(); // Close the window after completing the actions
        //         }
        //       }, ${scrollDuration * 1000});
        //     }

        //     performActions(); // Start the actions for the first time
        //   })();
        // `);



        // });

        // win.on('closed', () => {
        //   win = null;
        // });
      }
    }
    let t = (visitCountTo * (scrollDuration + 5) + 40) * 1000;
    let mt = t;
    perform()
    for (j = 0; j < repetitionCount; j++) {
      setTimeout(
        () => {
          perform()
        },
        t
      )
      t = t + mt;
    }
  } catch (err) {
  }
});

// END MAIN FUNCTION


// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=- COOKIES COLLECTOR -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

ipcMain.on('collect-cookies', async (event, data) => {
  console.log("here");
  try {
    const {
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
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
      'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Mobile Safari/537.36',
    ];

    const searchUrls = {
      google: keyword => `https://www.google.com/search?q=${encodeURIComponent(keyword)}`,
      bing: keyword => `https://www.bing.com/search?q=${encodeURIComponent(keyword)}`,
      yahoo: keyword => `https://search.yahoo.com/search?p=${encodeURIComponent(keyword)}`,
      duckduckgo: keyword => `https://duckduckgo.com/?q=${encodeURIComponent(keyword)}`
    };

    let width = 1930;
    let windows = []; // Array to store all opened windows

    async function perform() {
      let visitCount = Math.floor(Math.random() * (visitCountTo - visitCountFrom + 1)) + visitCountFrom;
      console.log('-=-=-=-=-=-=-=');
      console.log(visitCount);
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

        let cookie = rows[Math.floor(Math.random() * rows.length - 1)];
        const ses = win.webContents.session;
        for (const cook of cookie) {
          await ses.cookies.set(cook);
        }

        const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
        win.webContents.setUserAgent(randomUserAgent);

        const targetUrl = urls.length > 0 && Math.random() > 0.5
          ? urls[Math.floor(Math.random() * urls.length)]
          : searchUrls[searchEngines[Math.floor(Math.random() * searchEngines.length)]](keywords[Math.floor(Math.random() * keywords.length)]);

        // win.loadURL(targetUrl);
        win.loadURL('https://bot.sannysoft.com/');
        // win.webContents.openDevTools();

        win.webContents.on('did-finish-load', async () => {
          const scrollSpeed = Math.floor(Math.random() * 5) + 2;
          const scrollInterval = Math.floor(Math.random() * (toTime - fromTime + 1) + fromTime) * 1000;

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
              const cookies = await win.webContents.session.cookies.get({});
              let cookieData = JSON.stringify(cookies, null, 2);
              let timestamp = new Date().toISOString().replace(/:/g, '-'); // To avoid issues with filenames

              // Get the path to the user's Downloads folder
              const downloadsPath = path.join(os.homedir(), 'Downloads');
              let filePath = path.join(downloadsPath, `cookies-${timestamp}.json`);

              await con.query("UPDATE cookies SET cookie = ? WHERE id = ?", [
                cookieData,
                randomCookieFile.id
              ]);

              fs.writeFile(filePath, cookieData, (err) => {
                if (err) {
                  console.error('Error writing to file', err);
                } else {
                  console.log('File has been written successfully');
                }
              });
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
