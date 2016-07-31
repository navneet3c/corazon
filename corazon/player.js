document.addEventListener('DOMContentLoaded', function () {
  //add event listener to handle click
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    $.playlistInterface.addNewMedia(request)
    sendResponse({
      status: "ok"
    })
  })
  
  //register this tab to gather right-click events
  chrome.tabs.getCurrent(function(tab){
    chrome.storage.local.set({
      playerLiveTabId: tab.id
    })
  })
  
  //add event listener to catch new playlist item
  document.addEventListener("playlistAdd", function(e) {
    DEBUG && console.log("Received a new playlist item. Adding to display...")
    $.playlistInterface.addItem(e.detail)
  })
  
  $("#siteControlHeader").click(function() {
    if($.playlistInterface.isPlaying() == 1) {
      $.playlistInterface.stopPlayback()
      $(this).css("color", "#000")
    } else {
      $.playlistInterface.startPlayback()
      $(this).css("color", "#999")
    }
  })
  
})

