// Background service worker for UI Clone Studio
// Handles inter-tab communication and storage

chrome.runtime.onInstalled.addListener(() => {
  console.log('UI Clone Studio installed');
});

// Forward messages between content scripts and popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'SECTION_CAPTURED') {
    // Store temporarily so popup can read when it opens
    chrome.storage.session.set({ lastCapture: msg.data }, () => {
      // Broadcast to any open popup
      chrome.runtime.sendMessage(msg).catch(() => {
        // Popup might not be open — that's fine, data is in storage
      });
    });
  }
  return false;
});
