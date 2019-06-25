$(function(){
  /*
   * Base classes
   */
  var MyBaseModel = Backbone.Model.extend({
    sync: function(a) {
      //snubbing notification sync
    },
  })
  
  /*
   * Notification management:
   * $.notificationInterface.pushNotification() to display
   * $.notificationInterface.releaseNotification() to cancel
   */

  //notification model
  var Notification = MyBaseModel.extend({
    defaults: function() {
      return {
        message: "Null Notification",
        messageType: "neutral",
        timeout: 10000
      }
    },
  })
  
  //notification collection
  var NotificationList = Backbone.Collection.extend({
    model: Notification,
  })
  var Notifications = new NotificationList
  
  //single notification view
  var NotificationView = Backbone.View.extend({
    notificationTemplate: _.template($('#notification-template').html()),
    events: {
      "click .notification-item": "remove",
    },
    initialize: function() {
      this.listenTo(Notifications, 'remove', this.clear)
    },
    render: function() {
      this.$el.html(this.notificationTemplate(this.model.attributes))
      return this
    },
    clear: function(data) {
      if(this.model == data) {
        this.remove()
      }
    }
  })
  
  //notification handler
  var NotificationManager = Backbone.View.extend({
    initialize: function() {
      this.listenTo(Notifications, 'add', this.displayNotification)
      this.wrapper = $("#notification-wrapper")
    },
    displayNotification: function(data) {
      var view = new NotificationView({model: data})
      this.wrapper.append(view.render().el)
      
      if(data.attributes.timeout > 0) {
        setTimeout(function() {
          Notifications.remove(view.model.cid)
        }, data.attributes.timeout)
      }
    },
    pushNotification: function(data) {
      var item = Notifications.create({
        message: data.message,
        messageType: data.messageType,
        timeout: data.timeout,
      })
      return item.cid
    },
    releaseNotification: function(id) {
      Notifications.remove(id)
    },
  })
  var notificationInterface = new NotificationManager
  $.notificationInterface = {}
  $.notificationInterface.pushNotification = notificationInterface.pushNotification
  $.notificationInterface.releaseNotification = notificationInterface.releaseNotification
  
  /*
   * Playlist management:
   */
  
  //model for each song item
  var MediaItem = MyBaseModel.extend({
    defaults: function() {
      return {
        mediaId: "",
        thumbnail: "http://img.youtube.com/vi/null.jpg",
        title: "No Title",
        duration: 0,
        loaded: 0,
        size: "--",
        codec: "--",
        selectedStream: "--",
        downLink: "",
        order: 0,
        streams: [],
      }
    },
    loadSongData: function() {
      $.notificationInterface.pushNotification({
        message: "Loading song streams for '" + this.attributes.mediaId + "'...",
      })
      
      //add event listener to catch the links when processed
      var obj = this //required for closure
      var processedLinksEventListener = function(e) {
          DEBUG && console.log("Received media links for " + obj.attributes.mediaId + ". Passing on for playback...")
          document.removeEventListener("mediaLinks_" + obj.attributes.mediaId, processedLinksEventListener)
          
          if(e.detail.mediaId != obj.attributes.mediaId) {
            console.log("Received ID: ", e.detail.mediaId, "Expected: ", obj.attributes.mediaId)
            alert("Incorrect mediaID reception. Check the coherency")
          }
          obj.set({
            streams: e.detail.streams,
            loaded: 1,
          })
      }
      document.addEventListener("mediaLinks_" + this.attributes.mediaId, processedLinksEventListener)
      //start the scrape
      updateNewVideoDataFromId(this.attributes.mediaId, true)
    },
    saveLocal: function(data) {
      var manifest = chrome.runtime.getManifest()
      data.version = manifest.version
      
      chrome.storage.local.set({
        ["mediaEntry_" + data.mediaId]: data
      })
      $.notificationInterface.pushNotification({
        message: "Added metadata for video '" + data.mediaId + "' to playlist.",
        messageType: "good"
      })
    },
    destroy: function(options) {
      var title = this.attributes.title
      chrome.storage.local.remove("mediaEntry_" + this.attributes.mediaId)
      $.notificationInterface.pushNotification({
        message: "Removed '" + title + "' from playlist.",
      })
      Backbone.Model.prototype.destroy.apply(this, options)
    }
  })
  
  //song collection
  var SongPlaylist = Backbone.Collection.extend({
    model: MediaItem,
    fetch: function(){
      $.notificationInterface.pushNotification({
        message: "Restoring playlist...",
      })
      var obj = this //this may cause coherency issues. OK for now
      chrome.storage.local.get(function(items){
        for(var item in items) {
          if(!item.startsWith("mediaEntry_")) {
            continue
          }
          obj.create(items[item])
        }
        $.notificationInterface.pushNotification({
          message: "Playlist built.",
          messageType: "good"
        })
      })
    },
    initialize: function() {
      this.listenTo(this, 'playing', this.trackPlayback)
      this.listenTo(this, 'ended', this.changeTrack)
    },
    trackPlayback: function(data) {
      this.currentPlayingItem = data
    },
    changeTrack: function() {
      var nextPlayingItem, candidate
      if(this.currentPlayingItem) {
        candidate = this.indexOf(this.currentPlayingItem) + 1
      } else {
        candidate = 0
      }
      nextPlayingItem = this.at(candidate) || this.at(0)
      this.trigger("play", {mediaId: nextPlayingItem.attributes.mediaId})
    },
    startPlayback: function() {
      if(!this.currentPlayingItem) {
        this.currentPlayingItem = this.at(0)
      }
      this.trigger("play", {mediaId: this.currentPlayingItem.attributes.mediaId})
    },
    stopPlayback: function() {
      $.notificationInterface.pushNotification({
        message: "Stopping all playback.",
      })
      this.trigger("pause", {mediaId: this.currentPlayingItem.attributes.mediaId})
    }
  })
  var Songs = new SongPlaylist
  
  //single song view
  var SongView = Backbone.View.extend({
    tagName: "li",
    songTemplate: _.template($('#audio-item-template').html()),
    events: {
      "change .song-format-select": "updateMediaSource",
      "click .song-remove-link": "removeSong",
    },
    initialize: function() {
      this.listenTo(Songs, 'remove', this.clear)
      this.listenTo(Songs, 'change', this.modelChangeListener)
      this.listenTo(Songs, 'play', this.startPlayback)
      this.listenTo(Songs, 'pause', this.stopPlayback)
    },
    render: function() {
      this.$el.html(this.songTemplate(this.model.attributes))
      return this
    },
    updateRenderDependencies: function() {
      this.audioElement = $("#mediaId-" + this.model.attributes.mediaId + "-player")[0]
      this.audioElement.src = "https://sample-videos.com/audio/mp3/crowd-cheering.mp3"
      this.audioElement.onplay = this.launchPlayback
      this.audioElement.onended = this.announceEnd
    },
    updateMediaSource: function(event) {
      var idx = (event? parseInt(event.target.value): 0)
      var stream = this.model.attributes.streams[idx]
      
      this.model.attributes.size = stream.fileSize
      this.model.attributes.codec = stream.audioCodecs
      this.model.attributes.downLink = stream.audioUrl
      this.model.attributes.selectedStream = idx
      this.render()
      this.updateRenderDependencies()
      
      var format = stream.audioMIME + ';codecs="' + stream.audioCodecs + '"'
      if(!this.audioElement.canPlayType(format)) {
        alert("Selected audio type " + format + " is not supported by the browser.")
        return
      }
      this.audioElement.src = stream.audioUrl + "&ratebypass=yes"
      this.launchPlayback()
    },
    modelChangeListener: function(item) {
      if(item == this.model) {
        this.updateMediaSource()
      }
    },
    launchPlayback: function() {
      var mediaId = this.dataset? this.dataset.mediaId: this.model.attributes.mediaId
      Songs.trigger("play", {"mediaId": mediaId})
    },
    announceEnd: function() {
      Songs.trigger("ended", {mediaId: this.dataset.mediaId})
    },
    startPlayback: function(data) {
      if(data.mediaId != this.model.attributes.mediaId) {
        this.stopPlayback()
        return
      }
      if(this.model.attributes.loaded) {
        if(this.audioElement.paused) {
          this.audioElement.play()
          $.notificationInterface.pushNotification({
            message: "Now playing: " + this.model.attributes.title,
            messageType: "good"
          })
        }
        Songs.trigger('playing', this.model)
      } else {
        this.model.loadSongData()
      }
    },
    stopPlayback: function(data) {
      this.audioElement.pause()
    },
    removeSong: function(event) {
      event.preventDefault()
      this.model.destroy()
    },
    clear: function(data) {
      if(this.model == data) {
        this.remove()
      }
    }
  })
  
  //playlist handler
  var PlaylistManager = Backbone.View.extend({
    initialize: function() {
      this.listenTo(Songs, 'add', this.displayNewPlaylistItem)
      this.wrapper = $("#songs-list")
      this.playingNow = -1
      
      Songs.fetch()
    },
    displayNewPlaylistItem: function(data) {
      var view = new SongView({model: data})
      this.wrapper.append(view.render().el)
      view.updateRenderDependencies()
    },
    addItem: function(data) { //save new playlist item lo localstorage
      var item = Songs.create(data)
      item.saveLocal(data)
    },
    removeItem: function(id) {
      Songs.remove(id)
    },
    startPlayback: function() {
      this.playingNow = 1
      Songs.startPlayback()
    },
    stopPlayback: function() {
      this.playingNow = -1
      Songs.stopPlayback()
    },
    isPlaying: function() {
      return this.playingNow
    },
    addNewMedia: function(obj) {
      chrome.storage.local.get("mediaEntry_" + obj.mediaId, function(item){
        var manifest = chrome.runtime.getManifest()
        item = item["mediaEntry_" + obj.mediaId]
        if(!item || (item.version != manifest.version)) {
          $.notificationInterface.pushNotification({
            message: "Processing media from '" + obj.mediaId + "'...",
          })
          updateNewVideoDataFromId(obj.mediaId, false)
        } else {
          $.notificationInterface.pushNotification({
            message: "Video '" + obj.mediaId + "' is already added to playlist",
            messageType: "good"
          })
        }
      })
    },
  })
  
  var playlistInterface = new PlaylistManager
  $.playlistInterface = {}
  $.playlistInterface.addItem = playlistInterface.addItem
  $.playlistInterface.addNewMedia = playlistInterface.addNewMedia
  $.playlistInterface.removeItem = playlistInterface.removeItem
  $.playlistInterface.startPlayback = playlistInterface.startPlayback
  $.playlistInterface.stopPlayback = playlistInterface.stopPlayback
  $.playlistInterface.isPlaying = playlistInterface.isPlaying

})
