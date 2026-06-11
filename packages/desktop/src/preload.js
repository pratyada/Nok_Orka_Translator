const { contextBridge, ipcRenderer, desktopCapturer } = require("electron");

// Expose safe APIs to the renderer process
contextBridge.exposeInMainWorld("orkaDesktop", {
  platform: process.platform,
  isDesktop: true,

  // Get system audio stream (captures what you hear from speakers)
  getSystemAudioStream: async () => {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 0, height: 0 },
    });

    // Return the first screen source ID — the renderer will use it
    // with getUserMedia to capture system audio
    if (sources.length > 0) {
      return sources[0].id;
    }
    return null;
  },

  // Settings persistence
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
});
