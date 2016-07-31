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
          alert("Error [processVideoResourceFileForLinks]: Signature cipher is out of date. Please update.\n" + "Current: " + obj[i].data.swfcfg.assets.js + "\nSynced: " + config.baseJsResourceUrl)
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
