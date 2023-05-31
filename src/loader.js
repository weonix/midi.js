/*
  ----------------------------------------------------------
  root.Plugin : 0.3.4 : 2015-03-26
  ----------------------------------------------------------
  https://github.com/mudcube/root.js
  ----------------------------------------------------------
  Inspired by javax.sound.midi (albeit a super simple version):
    http://docs.oracle.com/javase/6/docs/api/javax/sound/midi/package-summary.html
  ----------------------------------------------------------
  Technologies
  ----------------------------------------------------------
    Web MIDI API - no native support yet (jazzplugin)
    Web Audio API - firefox 25+, chrome 10+, safari 6+, opera 15+
    HTML5 Audio Tag - ie 9+, firefox 3.5+, chrome 4+, safari 4+, opera 9.5+, ios 4+, android 2.3+
  ----------------------------------------------------------
*/

import { audioDetect, loadScript, request } from './utils'
import root from './root'

root.Soundfont = {}
root.DEBUG = true
root.USE_XHR = true
root.soundfontUrl = './soundfont/'

/*
  root.loadPlugin({
    onsuccess: function() { },
    onprogress: function(state, percent) { },
    targetFormat: 'mp3', // optionally can force to use MP3 (for instance on mobile networks)
    instrument: 'acoustic_grand_piano', // or 1 (default)
    instruments: [ 'acoustic_grand_piano', 'acoustic_guitar_nylon' ] // or multiple instruments
  })
*/

root.loadPlugin = async function (opts) {
  if (typeof opts === 'function') {
    opts = {onsuccess: opts}
  }

  root.soundfontUrl = opts.soundfontUrl || root.soundfontUrl

  // / Detect the best type of audio to use
  await new Promise(resolve => {
    audioDetect( async function (supports) {
      var hash = window.location.hash
      var api = ''
      var success = false;

      //console.log(supports);

      // / use the most appropriate plugin if not specified
      // if (supports[opts.api]) {
      //   api = opts.api
      // } 
      // if (supports[hash.substr(1)]) {
      //   api = hash.substr(1)
      // } 
      // if (supports.webmidi) {
      //   api = 'webmidi'
      // } 
      // if (window.AudioContext) { // Chrome
      //   api = 'webaudio'
      // } 
      // if (window.Audio) { // Firefox
      //   api = 'audiotag'
      // }

    // if (connect[api]) {
        // / use audio/ogg when supported
      let audioFormat
      if (opts.targetFormat) {
        audioFormat = opts.targetFormat
      } else { // use best quality
        audioFormat = supports['audio/ogg'] ? 'ogg' : 'mp3'
      }

      // / load the specified plugin
      root.__api = api
      root.__audioFormat = audioFormat
      root.supports = supports
      root.loadResource(opts)
    // }

      //connect[root.__api](opts)
      var list = [];

      if (supports.webmidi) {
        api = 'webmidi'
        list.push(connect['webmidi'](opts));
      } 
      if (window.AudioContext) { // Chrome
        api = 'webaudio'
        list.push(connect['webaudio'](opts));
      } 
      // if (window.Audio) { // Firefox
      //   api = 'audiotag'
      //   list.push(connect['audiotag'](opts));
      // }

      for (const item of list) {
        await item;
      }
      resolve();
    })
  });
}

/*
  root.loadResource({
    onsuccess: function() { },
    onprogress: function(state, percent) { },
    instrument: 'banjo'
  })
*/

root.loadResource = function (opts) {
  var instruments = opts.instruments || opts.instrument || 'acoustic_grand_piano'
  // /
  if (typeof instruments !== 'object') {
    if (instruments || instruments === 0) {
      instruments = [instruments]
    } else {
      instruments = []
    }
  }
  // / convert numeric ids into strings
  for (var i = 0; i < instruments.length; i++) {
    var instrument = instruments[i]
    if (instrument === +instrument) { // is numeric
      if (root.GM.byId[instrument]) {
        instruments[i] = root.GM.byId[instrument].id
      }
    }
  }
  // /
  opts.format = root.__audioFormat
  opts.instruments = instruments
  // /

}

var connect = {
  webmidi: async function (opts) {
    // cant wait for this to be standardized!
    await root.WebMIDI.connect(opts)
  },
  audiotag: function (opts) {
    // works ok, kinda like a drunken tuna fish, across the board
    // http://caniuse.com/audio
    requestQueue(opts, 'AudioTag')
  },
  webaudio: async function (opts) {
    // works awesome! safari, chrome and firefox support
    // http://caniuse.com/web-audio
    
     await new Promise((resolve, reject)=>{
        requestQueue(opts, 'WebAudio', resolve)
     });

  }
}

var requestQueue = function (opts, context, onFinish) {
  var audioFormat = opts.format
  var instruments = opts.instruments
  var onprogress = opts.onprogress
  var onerror = opts.onerror
  // /
  var length = instruments.length
  var pending = length
  var waitForEnd = async function () {
    if (!--pending) {
      onprogress && onprogress('load', 1.0)
      //console.log("waitForEnd1");
      await root[context].connect(opts)
      //console.log("waitForEnd2");
      onFinish();
    }
  }
  // /
  for (var i = 0; i < length; i++) {
    var instrumentId = instruments[i]
    if (root.Soundfont[instrumentId]) { // already loaded
      waitForEnd()
    } else { // needs to be requested
      sendRequest(instruments[i], audioFormat, function (evt, progress) {
        var fileProgress = progress / length
        var queueProgress = (length - pending) / length
        onprogress && onprogress('load', fileProgress + queueProgress, instrumentId)
      }, function () {
        waitForEnd()
      }, onerror)
    }
  }
}

var sendRequest = function (instrumentId, audioFormat, onprogress, onsuccess, onerror) {
  var soundfontPath = root.soundfontUrl + instrumentId + '-' + audioFormat + '.js'
  if (root.USE_XHR) {
    request({
      url: soundfontPath,
      format: 'text',
      onerror: onerror,
      onprogress: onprogress,
      onsuccess: function (event, responseText) {
        var script = document.createElement('script')
        script.language = 'javascript'
        script.type = 'text/javascript'
        script.text = responseText
        document.body.appendChild(script)
        onsuccess()
      }
    })
  } else {
    loadScript.add({
      url: soundfontPath,
      verify: 'root.Soundfont["' + instrumentId + '"]',
      onerror: onerror,
      onsuccess: function () {
        onsuccess()
      }
    })
  }
}

root.setDefaultPlugin = function (midi) {
  // for (var key in midi) {
  //   root[key] = midi[key]
  // }
}
