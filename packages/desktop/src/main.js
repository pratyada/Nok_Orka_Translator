const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, dialog } = require("electron");
const path = require("path");
const { fork } = require("child_process");
const fs = require("fs");

let mainWindow = null;
let tray = null;
let serverProcess = null;

const SERVER_PORT = 3001;
const IS_DEV = !app.isPackaged;

function getResourcePath(...segments) {
  if (IS_DEV) {
    return path.join(__dirname, "..", "..", "..", ...segments);
  }
  return path.join(process.resourcesPath, ...segments);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 750,
    minHeight: 550,
    title: "Nokia Orka Translator",
    backgroundColor: "#ffffff",
    icon: path.join(__dirname, "..", "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: "default",
    autoHideMenuBar: true,
  });

  // Grant permissions for system audio capture (desktopCapturer)
  mainWindow.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const allowed = ["media", "audioCapture", "desktopCapture", "screen"];
      callback(allowed.includes(permission));
    },
  );

  // Handle display-media request for system audio
  mainWindow.webContents.session.setDisplayMediaRequestHandler(
    (request, callback) => {
      // Auto-grant screen capture for system audio (no picker needed)
      const { desktopCapturer: dc } = require("electron");
      dc.getSources({ types: ["screen"] }).then((sources) => {
        if (sources.length > 0) {
          callback({ video: sources[0], audio: "loopback" });
        } else {
          callback({});
        }
      });
    },
  );

  if (IS_DEV) {
    mainWindow.loadURL("http://localhost:3000");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    // Production: load the built React app served by our embedded server
    // Wait for server to be ready, then load
    waitForServer().then(() => {
      mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);
    });
  }

  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function waitForServer(retries = 120) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      const http = require("http");
      const req = http.get(`http://localhost:${SERVER_PORT}/health`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          retry();
        }
      });
      req.on("error", retry);
      req.setTimeout(1000, retry);

      function retry() {
        attempts++;
        if (attempts >= retries) {
          reject(new Error("Server failed to start"));
        } else {
          setTimeout(check, 500);
        }
      }
    };
    check();
  });
}

function startServer() {
  if (IS_DEV) {
    console.log("[desktop] Dev mode — start server separately with: npm run dev:server");
    return;
  }

  // In production, the server is bundled in resources/server/
  const serverEntry = getResourcePath("server", "server.js");

  if (!fs.existsSync(serverEntry)) {
    console.error("[desktop] Server not found at:", serverEntry);
    dialog.showErrorBox(
      "Server Error",
      `Cannot find server at: ${serverEntry}\n\nPlease reinstall the application.`,
    );
    return;
  }

  console.log("[desktop] Starting embedded server:", serverEntry);

  // Read .env from app directory if it exists
  const envPath = path.join(path.dirname(app.getPath("exe")), ".env");
  const appDataEnv = path.join(app.getPath("userData"), ".env");

  let envVars = { ...process.env, PORT: String(SERVER_PORT), NODE_ENV: "production" };

  // Try to load .env from next to the exe, then from appData
  for (const p of [envPath, appDataEnv]) {
    if (fs.existsSync(p)) {
      console.log("[desktop] Loading env from:", p);
      const content = fs.readFileSync(p, "utf-8");
      for (const line of content.split("\n")) {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) {
          envVars[match[1].trim()] = match[2].trim();
        }
      }
      break;
    }
  }

  serverProcess = fork(serverEntry, [], {
    env: envVars,
    stdio: "pipe",
    silent: true,
  });

  serverProcess.stdout?.on("data", (data) => {
    console.log(`[server] ${data.toString().trim()}`);
  });

  serverProcess.stderr?.on("data", (data) => {
    console.error(`[server] ${data.toString().trim()}`);
  });

  serverProcess.on("exit", (code) => {
    console.log(`[server] exited with code ${code}`);
    if (code !== 0 && !app.isQuitting) {
      dialog.showErrorBox("Server Error", "The translation server crashed. Please restart the app.");
    }
  });
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}

function createTray() {
  // Nokia blue 16x16 icon
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buf[i * 4] = 18;     // R (Nokia blue)
    buf[i * 4 + 1] = 65; // G
    buf[i * 4 + 2] = 145; // B
    buf[i * 4 + 3] = 255; // A
  }
  const icon = nativeImage.createFromBuffer(buf, { width: size, height: size });

  tray = new Tray(icon);
  tray.setToolTip("Nokia Orka Translator");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show Orka Translator",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.isQuitting = true;
        stopServer();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// Single instance
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    startServer();
    createWindow();
    createTray();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      stopServer();
      app.quit();
    }
  });

  app.on("activate", () => {
    if (mainWindow === null) createWindow();
    else mainWindow.show();
  });

  app.on("before-quit", () => {
    app.isQuitting = true;
    stopServer();
  });
}
