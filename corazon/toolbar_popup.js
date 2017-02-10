document.addEventListener('DOMContentLoaded', function () {
  document.getElementById("playerPageLink").addEventListener("click", function() {
    chrome.tabs.create({
      url: chrome.extension.getURL("player.html"),
      active: true
    })
  })
  
})

