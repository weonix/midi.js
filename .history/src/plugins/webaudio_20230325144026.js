/*
  ----------------------------------------------------------
  Web Audio API - OGG or MPEG Soundbank
  ----------------------------------------------------------
  http://webaudio.github.io/web-audio-api/
  ----------------------------------------------------------
*/
import root from '../root'

// REF: http://stackoverflow.com/questions/21797299/convert-base64-string-to-arraybuffer
function base64ToArrayBuffer (base64) {
  var binaryString = window.atob(base64)
  var len = binaryString.length
  var bytes = new Uint8Array(len)
  for (var i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}

window.AudioContext && (function () {
  // var audioContext = null // new AudioContext()
  var useStreamingBuffer = false // !!audioContext.createMediaElementSource
  var midi = root.WebAudio = { api: 'webaudio' }
  var ctx // audio context
  var sources = {}
  var effects = {}
  var masterVolume = 127
  var audioBuffers = {}
  // /
  midi.audioBuffers = audioBuffers
  midi.send = function (data, delay) {}
  midi.setController = function (channelId, type, value, delay) {}

  midi.setVolume = function (channelId, volume, delay) {
    if (delay) {
      setTimeout(function () {
        masterVolume = volume
      }, delay * 1000)
    } else {
      masterVolume = volume
    }
  }

  midi.programChange = function (channelId, program, delay) {
    //      if (delay) {
    //        return setTimeout(function() {
    //          var channel = root.channels[channelId]
    //          channel.instrument = program
    //        }, delay)
    //      } else {
    var channel = root.channels[channelId]
    channel.instrument = program
  //      }
  }

  midi.pitchBend = function (channelId, program, delay) {
    //      if (delay) {
    //        setTimeout(function() {
    //          var channel = root.channels[channelId]
    //          channel.pitchBend = program
    //        }, delay)
    //      } else {
    var channel = root.channels[channelId]
    channel.pitchBend = program
  //      }
  }

  midi.noteOn = function (channelId, noteId, velocity, delay) {
    delay = delay || 0

    // / check whether the note exists
    var channel = root.channels[channelId]
    var instrument = channel.instrument
    var bufferId = instrument + '' + noteId
    var buffer = audioBuffers[bufferId]
    if (!buffer) {
              console.log(midi.GM.byId[instrument].id, instrument, channelId)
      return
    }

    // / convert relative delay to absolute delay
    if (delay < ctx.currentTime) {
      delay += ctx.currentTime
    }

    // / create audio buffer
    var source
    if (useStreamingBuffer) {
      source = ctx.createMediaElementSource(buffer)
    } else { // XMLHTTP buffer
      source = ctx.createBufferSource()
      source.buffer = buffer
    }

    // / add effects to buffer
    if (effects) {
      var chain = source
      for (var key in effects) {
        chain.connect(effects[key].input)
        chain = effects[key]
      }
    }

    // / add gain + pitchShift
    var gain = (velocity / 127) * (masterVolume / 127) * 2 - 1
    source.connect(ctx.destination)
    source.playbackRate.value = 1 // pitch shift
    source.gainNode = ctx.createGain() // gain
    source.gainNode.connect(ctx.destination)
    source.gainNode.gain.value = Math.min(1.0, Math.max(-1.0, gain))
    source.connect(source.gainNode)
    // /
    if (useStreamingBuffer) {
      if (delay) {
        return setTimeout(function () {
          buffer.currentTime = 0
          buffer.play()
        }, delay * 1000)
      } else {
        buffer.currentTime = 0
        buffer.play()
      }
    } else {
      source.start(delay || 0)
    }
    // /
    sources[channelId + '' + noteId] = source
    // /
    return source
  }

  midi.noteOff = function (channelId, noteId, delay) {
    delay = delay || 0

    // / check whether the note exists
    var channel = root.channels[channelId]
    var instrument = channel.instrument
    var bufferId = instrument + '' + noteId
    var buffer = audioBuffers[bufferId]
    if (buffer) {
      if (delay < ctx.currentTime) {
        delay += ctx.currentTime
      }
      // /
      var source = sources[channelId + '' + noteId]
      if (source) {
        if (source.gainNode) {
          // @Miranet: 'the values of 0.2 and 0.3 could of course be used as
          // a 'release' parameter for ADSR like time settings.'
          // add { 'metadata': { release: 0.3 } } to soundfont files
          var gain = source.gainNode.gain
          gain.linearRampToValueAtTime(gain.value, delay)
          gain.linearRampToValueAtTime(-1.0, delay + 0.3)
        }
        // /
        if (useStreamingBuffer) {
          if (delay) {
            setTimeout(function () {
              buffer.pause()
            }, delay * 1000)
          } else {
            buffer.pause()
          }
        } else {
          if (source.noteOff) {
            source.noteOff(delay + 0.5)
          } else {
            source.stop(delay + 0.5)
          }
        }
        // /
        delete sources[channelId + '' + noteId]
        // /
        return source
      }
    }
  }

  midi.chordOn = function (channel, chord, velocity, delay) {
    var res = {}
    for (var n = 0, note, len = chord.length; n < len; n++) {
      res[note = chord[n]] = midi.noteOn(channel, note, velocity, delay)
    }
    return res
  }

  midi.chordOff = function (channel, chord, delay) {
    var res = {}
    for (var n = 0, note, len = chord.length; n < len; n++) {
      res[note = chord[n]] = midi.noteOff(channel, note, delay)
    }
    return res
  }

  midi.stopAllNotes = function () {
    for (var sid in sources) {
      var delay = 0
      if (delay < ctx.currentTime) {
        delay += ctx.currentTime
      }
      var source = sources[sid]
      source.gain.linearRampToValueAtTime(1, delay)
      source.gain.linearRampToValueAtTime(0, delay + 0.3)
      if (source.noteOff) { // old api
        source.noteOff(delay + 0.3)
      } else { // new api
        source.stop(delay + 0.3)
      }
      delete sources[sid]
    }
  }

  midi.setEffects = function (list) {
    if (ctx.tunajs) {
      for (var n = 0; n < list.length; n++) {
        var data = list[n]
        var effect = new ctx.tunajs[data.type](data)
        effect.connect(ctx.destination)
        effects[data.type] = effect
      }
    } else {
      return console.log('Effects module not installed.')
    }
  }

  midi.connect = function (opts) {
    root.setDefaultPlugin(midi)
    midi.setContext(ctx || createAudioContext(), opts.onsuccess)
  }

  midi.getContext = function () {
    return ctx
  }

  midi.setContext = function (newCtx, onload, onprogress, onerror) {
    ctx = newCtx

    // / tuna.js effects module - https://github.com/Dinahmoe/tuna
    if (typeof window.Tuna !== 'undefined' && !ctx.tunajs) {
      ctx.tunajs = new window.Tuna(ctx)
    }

    // / loading audio files
    var urls = []
    var notes = root.keyToNote
    for (let key in notes) urls.push(key)
    // /
    var waitForEnd = function (instrument) {
      for (let key in bufferPending) { // has pending items
        if (bufferPending[key]) return
      }
      // /
      if (onload) { // run onload once
        onload()
        onload = null
      }
    }
    // /
    var requestAudio = function (soundfont, instrumentId, index, key) {
      var url = soundfont[key]
      if (url) {
        bufferPending[instrumentId]++
        loadAudio(url, function (buffer) {
          buffer.id = key
          var noteId = root.keyToNote[key]
          audioBuffers[instrumentId + '' + noteId] = buffer
          // /
          if (--bufferPending[instrumentId] === 0) {
            // var percent = index / 87
            //              console.log(midi.GM.byId[instrumentId], 'processing: ', percent)
            soundfont.isLoaded = true
            waitForEnd(instrument)
          }
        }, function (err) {
          console.error(err)
        })
      }
    }
    // /
    var bufferPending = {}
    for (var instrument in root.Soundfont) {
      var soundfont = root.Soundfont[instrument]
      if (soundfont.isLoaded) {
        continue
      }
      // /
      var synth = root.GM.byName[instrument]
      var instrumentId = synth.number
      // /
      bufferPending[instrumentId] = 0
      // /
      for (let index = 0; index < urls.length; index++) {
        let key = urls[index]
        requestAudio(soundfont, instrumentId, index, key)
      }
    }
    // /
    setTimeout(waitForEnd, 1)
  }

  /* Load audio file: streaming | base64 | arraybuffer
  ---------------------------------------------------------------------- */
  function loadAudio (url, onload, onerror) {
    if (useStreamingBuffer) {
      var audio = new window.Audio()
      audio.src = url
      audio.controls = false
      audio.autoplay = false
      audio.preload = false
      audio.addEventListener('canplay', function () {
        onload && onload(audio)
      })
      audio.addEventListener('error', function (err) {
        onerror && onerror(err)
      })
      document.body.appendChild(audio)
    } else if (url.indexOf('data:audio') === 0) { // Base64 string
      var base64 = url.split(',')[1]
      var buffer = base64ToArrayBuffer(base64)
      ctx.decodeAudioData(buffer, onload, onerror)
    } else { // XMLHTTP buffer
      var request = new window.XMLHttpRequest()
      request.open('GET', url, true)
      request.responseType = 'arraybuffer'
      request.onload = function () {
        ctx.decodeAudioData(request.response, onload, onerror)
      }
      request.send()
    }
  }

  function createAudioContext () {
    return new (window.AudioContext || window.webkitAudioContext)()
  }
})()
