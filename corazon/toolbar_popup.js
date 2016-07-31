document.addEventListener('DOMContentLoaded', function () {
  document.getElementById("regenerateCipher").addEventListener("click", refreshYouTubeCipher)
  
  document.getElementById("playerPageLink").addEventListener("click", function() {
    chrome.tabs.create({
      url: chrome.extension.getURL("player.html"),
      active: true
    })
  })
  
})

//get configuration and initiate ajax request to get resource file
function refreshYouTubeCipher() {
  console.log("Getting configuration and initiating cipher regeneration sequence...")
  document.getElementById("regeneratingProgress").innerHTML = "Working..."
  chrome.storage.local.get(["dummyVideoId", "resourceProxy"], sendResourceFileRequest)
}

//launch ajax request to get resource file and get response
function sendResourceFileRequest(config) {
  console.log("Sending request to get dummy resource file...")
  var xhr = new XMLHttpRequest()
  var resourceUrl = config.resourceProxy + "?url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + config.dummyVideoId + "&spf=navigate")
  
  xhr.open("GET", resourceUrl, true)
  xhr.onreadystatechange = function() {
    if (xhr.readyState == 4) {
      if(xhr.status != 200) {
        alert("Error [sendResourceFileRequest]: Request failed")
        return
      }
      getBaseJsFile(config, JSON.parse(xhr.responseText))
    }
  }
  xhr.send()
}

//process resource file got from ajax request, extract base.js URL and initate
//ajax request to get it
function getBaseJsFile(config, obj) {
  console.log("Processing dummy resource to extract base.js path...")
  var baseJSUrl
  for (var i = 0, len = obj.length; i < len; i++) {
    if(obj[i] && obj[i].hasOwnProperty('data') && obj[i].data.hasOwnProperty('swfcfg')) {
      baseJSUrl = obj[i].data.swfcfg.assets.js.replace(/^\/\//, "")
      break
    }
  }
  if(!validateURL("https://" + baseJSUrl)) {
    alert("Could not get valid base.js URL. Aborting.")
    return
  }
  chrome.storage.local.set({
    "baseJsResourceUrl": "//" + baseJSUrl,
  })
  baseJSUrl = "https://" + baseJSUrl
  console.log("URL for base.js found: " + baseJSUrl + " . Launching request...")
  
  var xhr = new XMLHttpRequest()
  var resourceUrl = config.resourceProxy + "?url=" + encodeURIComponent(baseJSUrl)
  xhr.open("GET", resourceUrl, true)
  xhr.onreadystatechange = function() {
    if (xhr.readyState == 4) {
      if(xhr.status != 200) {
        alert("Error [getBaseJsFile]: Request failed")
        return
      }
      processBaseJsFileData(xhr.responseText)
    }
  }
  xhr.send()  
}

function validateURL(testURL) {
  return /^(?:(?:(?:https?|ftp):)?\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,})).?)(?::\d{2,5})?(?:[/?#]\S*)?$/i.test(testURL)
}

//process base.js content, and extract cipher function
function processBaseJsFileData(respData) {
  console.log("Processing base.js to extract cipher")
  
  //find pattern where signature calculation function is called: <>.sig||<>.s
  var match = /([a-zA-Z0-9\$]+)\.sig\|\|([a-zA-Z0-9\$]+)\(\1\.s\)/.exec(respData)
  if(!match || !(2 in match) || match[2].match(/^[a-zA-Z0-9\$]+$/) === null) {
    alert("Error [processBaseJsFileData]: Could not find signature calculation pattern")
    return
  } 
  console.log("Found cipher calculator function: " + match[2])
  
  //find definition for function traced above
  var re = new RegExp('[^A-Za-z0-9\\$]' + match[2] + '=(function\\([^)]+\\)\\{[^}]+\\})')
  match = re.exec(respData)
  var baseFunc = match[1]
  if(!(1 in match)) {
    alert("Error [processBaseJsFileData]: Could not find definition for signature calculation function")
    return
  }
  console.log("Found signature calculation function definition:", baseFunc)
  
  //find defintions for cipher function subroutines
  var signatureCipherFunctionRoutines
  eval("var signatureCipherFunction = " + baseFunc)
  try {
    signatureCipherFunction("abcd1234ABCD")
    alert("Error [processBaseJsFileData]: Did not fire exception for cipher subroutines. Something is wrong.")
    return
  } catch (e) {
    if(e.constructor.name == "ReferenceError") {
      var unknown = e.message.split(" ")[0]
      var re = new RegExp('[^A-Za-z0-9\\$]' + unknown + '=\\{')
      match = re.exec(respData)
      if(!match) {
        alert("Error [processBaseJsFileData]: Could not find definition for cipher function subroutines")
        return
      }
      
      //gather object definition
      var startMatch=match.index
      var foundBraces = 0, nestLevel=0, endMatch=startMatch, ch;
      while(nestLevel || !foundBraces) {
        ch = respData.charAt(endMatch)
        endMatch++
        if(ch == '{') {
          foundBraces = 1
          nestLevel ++
        } else if(ch == '}') {
          nestLevel --
        }
      }
      signatureCipherFunctionRoutines = respData.substring(startMatch, endMatch)
      
      console.log("Found class definition for cipher subroutines: ", signatureCipherFunctionRoutines)
    }
  }
  chrome.storage.local.set({
    "signatureCipherFunction": baseFunc,
    "signatureCipherFunctionRoutines": signatureCipherFunctionRoutines,
  })
  console.log("Updation succeeded")
  document.getElementById("regeneratingProgress").innerHTML = ""
  alert("Completed Updation of cipher.")
}
