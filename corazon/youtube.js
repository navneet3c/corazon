var DEBUG = 0

//get configuration and initiate ajax request to get resource file
function updateNewVideoDataFromId(videoId, scrapeLinks) {
  DEBUG && console.log("Getting configuration and initiating video scraping sequence...")
  chrome.storage.local.get(["resourceProxy", "signatureCipherFunction", "signatureCipherFunctionRoutines", "baseJsResourceUrl"], function(config){
    sendVideoResourceFileRequest(config, videoId, scrapeLinks)
  })
}

//launch ajax request to get resource file and get response
function sendVideoResourceFileRequest(config, videoId, scrapeLinks) {
  DEBUG && console.log("Sending request to get video resource file...")
  var xhr = new XMLHttpRequest()
  var resourceUrl = config.resourceProxy + "?url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + videoId + "&spf=navigate")
  var processingRoutine = (scrapeLinks? processVideoResourceFileForLinks: processVideoResourceFileForMetadata)
  
  xhr.open("GET", resourceUrl, true)
  xhr.onreadystatechange = function() {
    if (xhr.readyState == 4) {
      if(xhr.status != 200) {
        $.notificationInterface.pushNotification({
          message: "Error [sendVideoResourceFileRequest]: Request failed",
          messageType: "bad"
        })
        return
      }
      processingRoutine(config, JSON.parse(xhr.responseText), videoId)
    }
  }
  xhr.send()
}

//process resource file got from ajax request, extract video info
function processVideoResourceFileForMetadata(config, obj, videoId) {
  DEBUG && console.log("Processing video resource to extract metadata...")
  
  var resourceObj = {
    thumbnail: "https://i.ytimg.com/vi/" + videoId + "/default.jpg",
    mediaId: videoId
  }
  
  for (var i = 0, len = obj.length; i < len; i++) { 
    if(obj[i] && obj[i].hasOwnProperty('title')) {
      resourceObj.title = obj[i].title
    }
    if(obj[i] && obj[i].hasOwnProperty('data') && obj[i].data.hasOwnProperty('swfcfg')) {
      try {
        resourceObj.duration = parseInt(obj[i].data.swfcfg.args.length_seconds)
      } catch(err) {
        console.log('Error [processVideoResourceFileForMetadata]: Could not get source URL object, API may have changes.')
        console.log("Error: ", err)
        return
      }
    }
  }
  
  resourceObj.duration = padToTwoDigits(Math.round(resourceObj.duration/60)) + ":" + padToTwoDigits(resourceObj.duration % 60)
  
  var event = new CustomEvent("playlistAdd", {
    detail: resourceObj
  })
  DEBUG && console.log('Dispatching event with the processed metadata.')
  document.dispatchEvent(event)
}
function padToTwoDigits(number) {
  if (number<=99) { number = ("00"+number).slice(-2); }
  return number;
}

//process resource file got from ajax request, extract download URLs
function processVideoResourceFileForLinks(config, obj, videoId) {
  DEBUG && console.log("Processing video resource to extract download links...")
  
  var urlSource
  var resourceObj = {
    mediaId: videoId
  }
  
  for (var i = 0, len = obj.length; i < len; i++) { 
    if(obj[i] && obj[i].hasOwnProperty('data') && obj[i].data.hasOwnProperty('swfcfg')) {
      try {
        //check if cipher is out of date
        if(obj[i].data.swfcfg.assets.js != config.baseJsResourceUrl) {
          console.log("[processVideoResourceFileForLinks]: Signature cipher is out of date. Updating...\n" + "Current: " + obj[i].data.swfcfg.assets.js + "\nSynced: " + config.baseJsResourceUrl)
          refreshYouTubeCipher()
          document.addEventListener("cipherGenerationDone", function(e) {
            updateNewVideoDataFromId(videoId, true)
            e.srcElement.removeEventListener("cipherGenerationDone", arguments.callee)
          }, true)
          return
        }
        urlSource = obj[i].data.swfcfg.args.adaptive_fmts
      } catch(err) {
        console.log('Error [processVideoResourceFileForLinks]: Could not get source URL object, API may have changes.')
        console.log("Error: ", err)
        return
      }
    }
  }
  if(!urlSource) {
    $.notificationInterface.pushNotification({
      message: "Error [processVideoResourceFileForLinks]: Could not parse URLs for this video. Aborting.",
      messageType: "bad"
    })
    return
  }
  
  //process download links one by one
  var audioStreams = []
  urlSource = urlSource.split(',')
  if(!urlSource.length) {
    alert("Error [processVideoResourceFileForLinks]: No comma separated video formats found. Something is wrong.\n URL Source: " + urlSource)
    return
  }
  for (var i = 0, len = urlSource.length; i < len; i++) { 
    var audioStream = processMediaFormats(config, urlSource[i])
    if(!audioStream) {
      continue
    }
    audioStreams.push(audioStream)
  }
  if(!audioStreams) {
    alert("Error [processVideoResourceFileForLinks]: No audio stream available")
    return
  }
  audioStreams.reverse()
  resourceObj.streams = audioStreams
  
  var event = new CustomEvent("mediaLinks_" + videoId, {
    detail: resourceObj
  })
  DEBUG && console.log('Dispatching event with the processed links.')
  document.dispatchEvent(event)
}

//process each hunk of link and extract attributes
function processMediaFormats(config, blob) {
  var formatAttributes = blob.split('&').sort()
  if(!formatAttributes.length) {
    alert("Error [processMediaFormats]: No '&' separated format attributes found. Something is wrong.\n URL Sourcettributes: " + formatAttributes)
    return
  }
  
  var returnObject = {}
  var mediaUrl, signature, signature_new
  for (var j = 0, len_j = formatAttributes.length; j < len_j; j++) { 
    var temp = formatAttributes[j].split('=')
    if(temp[0] == "type") {
      var formatType = decodeURIComponent(temp[1])
      if(!formatType.startsWith("audio")) {
        return
      }
      formatType = formatType.split(';')
      returnObject.audioMIME = formatType[0]
      returnObject.audioFormat = formatType[0].split('/')[1]
      returnObject.audioCodecs = formatType[1].split('"')[1]
    } else if(temp[0] == "bitrate") {
      returnObject.audioBitrate = Math.round(temp[1]/1024) + "kbps"
    } else if(temp[0] == "clen") {
      temp[1] = temp[1] / 1024 //in kilobytes
      returnObject.fileSize = (Math.round(temp[1]*100/1024) / 100) + "MB"
    } else if(temp[0] == "url") {
      mediaUrl = decodeURIComponent(temp[1])
      
      //already signed URL
      var match = /signature=([^&]+)/.exec(mediaUrl)
      if(match && (1 in match)) {
        signature = match[1]
      }
    } else if(temp[0] == "sig" || temp[0] == "s") {
      //need to calculate signature
      signature_new = temp[1]
      try {
        eval(config.signatureCipherFunctionRoutines)
        eval("var cipherTransformFunction = " + config.signatureCipherFunction)
        
        signature_new = cipherTransformFunction(signature_new)
      } catch(e) {
        console.log("Error: ", e)
        alert("Error [processMediaFormats]: Error while patching signature.")
        return
      }
    }
  }
  if(!mediaUrl || (!signature && !signature_new)) {
    alert("Error [processMediaFormats]: Required video attributes not found. Something is wrong.\n URL Sourcettributes: " + formatAttributes)
    return
  }
  if(signature_new) {
    mediaUrl = mediaUrl + "&signature=" + signature_new
  }
  returnObject.audioUrl = mediaUrl
  return returnObject
}

//get configuration and initiate ajax request to get resource file
function refreshYouTubeCipher() {
  console.log("Getting configuration and initiating cipher regeneration sequence...")
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
      baseJSUrl = obj[i].data.swfcfg.assets.js
      break
    }
  }
  if(!validateURL("https://www.youtube.com" + baseJSUrl)) {
    alert("Could not get valid base.js URL. Aborting.")
    return
  }
  chrome.storage.local.set({
    "baseJsResourceUrl": baseJSUrl,
  })
  baseJSUrl = "https://www.youtube.com" + baseJSUrl
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
  
  var attemptSucceeded = 0
  var foundData, match
  
  //find pattern where signature calculation function is called
  
  //pattern: .set("signature",<>(?.s))
  match = /\.set\(\"signature\",([a-zA-Z0-9_\$]+)\([a-zA-Z0-9_\$]+.s\)\)/.exec(respData)
  if(!match || !(1 in match) || match[1].match(/^[a-zA-Z0-9_\$]+$/) === null) {
  } else {
    foundData = match[1]
    attemptSucceeded = 1;
  }
  if(!attemptSucceeded) {
    //pattern: <>.sig||<>.s
    match = /([a-zA-Z0-9_\$]+)\.sig\|\|([a-zA-Z0-9_\$]+)\(\1\.s\)/.exec(respData)
    if(!match || !(2 in match) || match[2].match(/^[a-zA-Z0-9_\$]+$/) === null) {
    } else {
      foundData = match[2]
      attemptSucceeded = 1;
    }
  }
  if(!attemptSucceeded) {
    //pattern: "signature":"sig"
    match = /\"signature\"\:\"sig\"[^=]*=([a-zA-Z0-9_\$]+)/.exec(respData)
    if(!match || !(1 in match) || match[1].match(/^[a-zA-Z0-9_\$]+$/) === null) {
    } else {
      foundData = match[1]
      attemptSucceeded = 1;
    }
  }
  
  
  if(attemptSucceeded) {
    console.log("Found cipher calculator function: " + foundData)
  } else {
    alert("Error [processBaseJsFileData]: Could not find signature calculation pattern")
    return
  }
  
  //find definition for function traced above
  foundData = foundData.replace("$", "\\$")
  var re = new RegExp('[^A-Za-z0-9_\\$]' + foundData + '=(function\\([^)]+\\)\\{[^}]+\\})')
  match = re.exec(respData)
  if(!(1 in match)) {
    alert("Error [processBaseJsFileData]: Could not find definition for signature calculation function")
    return
  }
  var baseFunc = match[1]
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
      unknown = unknown.replace("$", "\\$")
      var re = new RegExp('[^A-Za-z0-9_\\$]' + unknown + '=\\{')
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
  var event = new Event('cipherGenerationDone')
  document.dispatchEvent(event)
  console.log("Updation succeeded")
}
