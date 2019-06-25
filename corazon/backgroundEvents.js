//Add click event listener
chrome.contextMenus.onClicked.addListener(addToPlaylistHandler)

//Set up properties at install time.
chrome.runtime.onInstalled.addListener(function() {
  console.log("Installing Corazon...")
  
  //add context menu
  chrome.contextMenus.create({
    title: "Add to Corazon playlist",
    id: "addToPlaylistContextMenuItem",
    contexts: ["link", "page"],
    documentUrlPatterns: ["https://www.youtube.com/*"],
    targetUrlPatterns: ["https://www.youtube.com/watch?*"]
  })
  
  //set default config variables
  chrome.storage.local.set({
    dummyVideoId: "aSVpBqOsC7o", //to be used for scraping base.js
    resourceProxy: "http://corazon-yt.rf.gd/proxy.php",
  })
})

//The context menu onClicked callback handler
function addToPlaylistHandler(info) {
  var videoUrlObj = document.createElement('a')
  videoUrlObj.href = info.linkUrl || info.pageUrl
  var videoId = videoUrlObj.search.match(/\bv=([a-zA-Z0-9-_]+)/)
  if(videoId.length != 2) {
    alert("Malformed URL: "+info.linkUrl+"\nCould not get Video ID.")
    return
  }
  
  videoId = videoId[1]
  dispatchAudioStreamsToPlayerPage({
    mediaId: videoId
  })
}

//send message to player tab to update media
function dispatchAudioStreamsToPlayerPage(msg) {
  console.log("Dispatching event data to player page...")
  
  chrome.storage.local.get(["playerLiveTabId"], function(config){
    if(config.playerLiveTabId) {
      chrome.tabs.sendMessage(config.playerLiveTabId, msg, function(resp) {
        if(!resp) {
          alert("Error: Please start Corazon player first.")
          return
        }
      })
      //sendStreamMessageToPlayer(config.playerLiveTabId, msg)
    } else {
      alert("Error: Please start Corazon player first.")
      return
    }
  })
}
