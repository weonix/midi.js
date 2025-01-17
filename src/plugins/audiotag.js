/*
  ----------------------------------------------------------------------
  AudioTag <audio> - OGG or MPEG Soundbank
  ----------------------------------------------------------------------
  http://dev.w3.org/html5/spec/Overview.html#the-audio-element
  ----------------------------------------------------------------------
*/
import root from '../root'

window.Audio && (function () {
  var midi = root.AudioTag = { api: 'audiotag' }
  var noteToKey = {}
  var volume = 127 // floating point
  var bufferNid = -1 // current channel
  var audioBuffers = [] // the audio channels
  var notesOn = [] // instrumentId + noteId that is currently playing in each 'channel', for routing noteOff/chordOff calls
  var notes = {} // the piano keys
  for (let nid = 0; nid < 12; nid++) {
    audioBuffers[nid] = new window.Audio()
  }

  var playChannel = function (channel, note) {
    if (!root.channels[channel]) return
    var instrument = root.channels[channel].instrument
    var instrumentId = root.GM.byId[instrument].id
    note = notes[note]
    if (note) {
      var instrumentNoteId = instrumentId + '' + note.id
      var nid = (bufferNid + 1) % audioBuffers.length
      var audio = audioBuffers[nid]
      notesOn[ nid ] = instrumentNoteId
      if (!root.Soundfont[instrumentId]) {
        if (root.DEBUG) {
          console.log('404', instrumentId)
        }
        return
      }
      audio.src = root.Soundfont[instrumentId][note.id]
      audio.volume = volume / 127
      audio.play()
      bufferNid = nid
    }
  }

  var stopChannel = function (channel, note) {
    if (!root.channels[channel]) return
    var instrument = root.channels[channel].instrument
    var instrumentId = root.GM.byId[instrument].id
    note = notes[note]
    if (note) {
      var instrumentNoteId = instrumentId + '' + note.id
      for (var i = 0, len = audioBuffers.length; i < len; i++) {
        var nid = (i + bufferNid + 1) % len
        var cId = notesOn[nid]
        if (cId && cId === instrumentNoteId) {
          audioBuffers[nid].pause()
          notesOn[nid] = null
          return
        }
      }
    }
  }

  midi.audioBuffers = audioBuffers
  midi.send = function (data, delay) {}
  midi.setController = function (event, channel, type, value, delay) {}
  midi.setVolume = function (channel, n) {
    volume = n // - should be channel specific volume
  }

  midi.programChange = function (event, channel, program) {
    root.channels[channel].instrument = program
  }

  midi.pitchBend = function (event, channel, program, delay) {}

  midi.noteOn = function (event, channel, note, velocity, delay) {
    var id = noteToKey[note]
    if (!notes[id]) return
    if (delay) {
      return setTimeout(function () {
        playChannel(channel, id)
      }, delay * 1000)
    } else {
      playChannel(channel, id)
    }
  }

  midi.noteOff = function (event, channel, note, delay) {
    //      var id = noteToKey[note]
    //      if (!notes[id]) return
    //      if (delay) {
    //        return setTimeout(function() {
    //          stopChannel(channel, id)
    //        }, delay * 1000)
    //      } else {
    //        stopChannel(channel, id)
    //      }
  }

  midi.chordOn = function (channel, chord, velocity, delay) {
    for (var idx = 0; idx < chord.length; idx++) {
      var n = chord[idx]
      var id = noteToKey[n]
      if (!notes[id]) continue
      if (delay) {
        return setTimeout(function () {
          playChannel(channel, id)
        }, delay * 1000)
      } else {
        playChannel(channel, id)
      }
    }
  }

  midi.chordOff = function (event, channel, chord, delay) {
    for (var idx = 0; idx < chord.length; idx++) {
      var n = chord[idx]
      var id = noteToKey[n]
      if (!notes[id]) continue
      if (delay) {
        return setTimeout(function () {
          stopChannel(channel, id)
        }, delay * 1000)
      } else {
        stopChannel(channel, id)
      }
    }
  }

  midi.stopAllNotes = function (delay, lookAhead) {
    for (var nid = 0, length = audioBuffers.length; nid < length; nid++) {
      audioBuffers[nid].pause()
    }
  }

  midi.connect = async function (opts) {
    root.setDefaultPlugin(midi)
    // /
    for (var key in root.keyToNote) {
      noteToKey[root.keyToNote[key]] = key
      notes[key] = {id: key}
    }
  }
})()
