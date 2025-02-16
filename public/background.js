chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'openSidebar',
        title: 'Chat with Page',
        contexts: ['all']
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'openSidebar') {
        chrome.sidePanel.open({ windowId: tab.windowId });
    }
});
