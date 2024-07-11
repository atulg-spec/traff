const { app, BrowserWindow } = require('electron');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

puppeteer.use(StealthPlugin());

let mainWindow;
let browsers = [];

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1536,
        height: 864,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    mainWindow.loadFile('frontend/index.html');

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

async function getIPAddress() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch (error) {
        console.error('Error fetching IP address:', error);
        return '0.0.0.0';
    }
}

function extractProxyDetails(inputString) {
    const [proxyUsername, proxyPassword, proxyUrl] = inputString.match(/([^:]+):([^@]+)@(.+)/).slice(1);
    return { proxyUrl: `http://${proxyUrl}`, proxyUsername, proxyPassword };
}

function getProxy(proxies) {
    const proxy = proxies[Math.floor(Math.random() * proxies.length)];
    return extractProxyDetails(proxy);
}

function closeAllWindows() {
    browsers.forEach(browser => browser.close().catch(err => console.log('Error closing browser:', err)));
    browsers = [];
}

async function fetchDataAndInteract(data) {
    try {
        const proxyData = getProxy(data.proxies);
        const { proxyUrl, proxyUsername, proxyPassword } = proxyData;
        console.log(data)
        const pathToExtension = path.resolve(data['extension_path']);
        const browser = await puppeteer.launch({
            headless: false,
            devtools: false,
            args: [
                '--no-sandbox',
                `--proxy-server=${proxyUrl}`,
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                `--disable-extensions-except=${pathToExtension}`,
                `--load-extension=${pathToExtension}`,            
                '--no-experiments',
                '--disable-infobars',
                '--proxy-bypass-list=<-loopback>',
                '--window-position=0,0',
                '--disable-accelerated-2d-canvas',
            ],
            env: {
                TZ: data['time_zone'],
                ...process.env
            },
        });

        browsers.push(browser);
        const page = await browser.newPage();
        await page.authenticate({ username: proxyUsername, password: proxyPassword });
        let randomAgents = data['user_agents'][Math.floor(Math.random() * data['user_agents'].length)]
        console.log('randomAgents')
        console.log(randomAgents)
        await page.setUserAgent(randomAgents);
        await page.emulateTimezone(data.time_zone);
        const urllist = data.urls;
        async function performActions() {
            await page.goto(urllist[Math.floor(Math.random() * urllist.length)], { waitUntil: 'domcontentloaded' });
            await page.evaluate((data) => {
                const maxClicks = data.visit_count_to - data.visit_count_from;
                let clickCount = 0;
                async function scrollDown() {
                    const distance = 100;
                    const interval = 200;
                    while (window.scrollY + window.innerHeight < document.body.scrollHeight) {
                        window.scrollBy(0, distance);
                        await new Promise(resolve => setTimeout(resolve, interval));
                    }
                }
                async function scrollToTop() {
                    const distance = 100;
                    const interval = 200;
                    while (window.scrollY > 0) {
                        window.scrollBy(0, -distance);
                        await new Promise(resolve => setTimeout(resolve, interval));
                    }
                }
                async function clickRandomLink() {
                    let links = Array.from(document.querySelectorAll('a[href]'));
                    if (window.location.href.includes('google.com')) {
                        links = Array.from(document.querySelectorAll('a[href][jsname="UWckNb"]')).filter(link => data.rotate !== 'true' ? link.href.includes(data.domain_name) : true);
                    }
                    if (links.length > 0) {
                        links[Math.floor(Math.random() * links.length)].click();
                    } else {
                        window.location.href = `https://${data.domain_name}`;
                    }
                }

                async function performActions() {
                    await scrollDown();
                    await scrollToTop();

                    if (clickCount < maxClicks) {
                        clickRandomLink();
                        clickCount++;
                        setTimeout(performActions, data.scroll_duration * 1000);
                    } else {
                        window.close();
                    }
                }

                performActions();
            }, data);

        }

        performActions();

        setTimeout(closeAllWindows, (data.visit_count_to * data.scroll_duration * 1000) + (data.visit_count_to * 10000));
    } catch (error) {
        console.error('Puppeteer Error:', error);
    }
}

async function getTask() {
    const userIP = await getIPAddress();
    const url = `https://protraffic.pythonanywhere.com/api/getcampaigns/${userIP}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Error fetching tasks:', error);
        return null;
    }
}

async function checkTasks() {
    const data = await getTask();
    if (data && data.status) {
        for (let i = 0; i < data.data.count; i++) {
            fetchDataAndInteract(data.data);
        }
    }
}

app.on('ready', () => {
    createWindow();
    setInterval(() => {
        if (browsers.length === 0) checkTasks();
    }, 10000);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (mainWindow === null) createWindow();
});
