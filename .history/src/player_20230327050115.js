/*
  ----------------------------------------------------------
  midi.Player : 0.3.1 : 2015-03-26
  ----------------------------------------------------------
  https://github.com/mudcube/midi.js
  ----------------------------------------------------------
*/

import { MidiFile, Replayer } from './jasmid'
import root from './root'

(function () {
  root.Player = {}
  const player = root.Player
  player.currentTime = 0
  player.endTime = 0
  player.restart = 0
  player.playing = false
  player.timeWarp = 1
  player.startDelay = 0
  player.BPM = 120
  player.OverrideProgramChanges = false
  player.playingStartTime = 0;
  player.ctxStartTime = 0;
  player.lastCallbackTime = 0;

  player.start = player.resume = function (onsuccess) {
    if (player.currentTime < -1) {
      player.currentTime = -1
    }
    let ctx = player.getContext();
    player.ctxStartTime = ctx.currentTime;
    player.playingStartTime = player.currentTime;
    startAudio(player.currentTime, null, onsuccess)
  }

  player.getAudioContextPlaytime = function () {
    let ctx = player.getContext();
    return ctx.currentTime - player.ctxStartTime + this.playingStartTime / 1000;
  }

  player.pause = function () {
    var tmp = player.restart
    stopAudio()
    player.restart = tmp
  }

  player.stop = function () {
    stopAudio()
    player.restart = 0
    player.currentTime = 0
  }

  player.addListener = function (onsuccess) {
    onMidiEvent = onsuccess
  }

  player.removeListener = function () {
    onMidiEvent = undefined
  }

  player.clearAnimation = function () {
    if (player.animationFrameId) {
      window.cancelAnimationFrame(player.animationFrameId)
    }
  }

  player.setAnimation = function (callback) {
    var currentTime = 0
    var tOurTime = 0
    var tTheirTime = 0
    //
    player.clearAnimation()
    // /
    var frame = function () {
      player.animationFrameId = window.requestAnimationFrame(frame)
      // /
      if (player.endTime === 0) {
        return
      }
      if (player.playing) {
        currentTime = (tTheirTime === player.currentTime) ? tOurTime - Date.now() : 0
        if (player.currentTime === 0) {
          currentTime = 0
        } else {
          currentTime = player.currentTime - currentTime
        }
        if (tTheirTime !== player.currentTime) {
          tOurTime = Date.now()
          tTheirTime = player.currentTime
        }
      } else { // paused
        currentTime = player.currentTime
        tOurTime = Date.now();
        tTheirTime = player.currentTime;
      }
      // /
      // if (currentTime == 0 && player.playing) currentTime = ((Date.now() - player.ctxStartTime * 10) - player.playingStartTime) / 100 * MIDI.Player.BPM;

      var endTime = player.endTime
      // var percent = currentTime / endTime
      var t1 = currentTime / 1000;
      var t2 = endTime / 1000;
      // /
      if (t2 - t1 < -1.0) {
        return
      } else {
        callback({
          now: t1,
          end: t2,
          events: noteRegistrar
        })
      }
      player.lastCallbackTime = currentTime;

      if (currentTime > endTime) {
        stopAudio();
        if (typeof player.onEnd != 'undefined') player.onEnd();
      }
    }
    // /
    window.requestAnimationFrame(frame)
  }

  // helpers

  player.loadMidiFile = function (onsuccess, onprogress, onerror) {
    try {
      // console.log(MidiFile(player.currentData), new Replayer(MidiFile(player.currentData), player.timeWarp, null, player.BPM))
      player.replayer = new Replayer(MidiFile(player.currentData), player.timeWarp, null, player.BPM)
      player.data = player.replayer.getData()
      player.endTime = getLength()
      // /
      root.loadPlugin({
        // instruments: player.getFileInstruments(),
        onsuccess: onsuccess,
        onprogress: onprogress,
        onerror: onerror
      })
    } catch (event) {
      console.error(event)
      onerror && onerror(event)
    }
  }

  player.loadFile = function (file, onsuccess, onprogress, onerror) {
    player.stop()
    if (file.indexOf('base64,') !== -1) {
      var data = window.atob(file.split(',')[1])
      player.currentData = data
      player.loadMidiFile(onsuccess, onprogress, onerror)
    } else {
      var fetch = new window.XMLHttpRequest()
      fetch.open('GET', file)
      fetch.overrideMimeType('text/plain; charset=x-user-defined')
      fetch.onreadystatechange = function () {
        if (this.readyState === 4) {
          if (this.status === 200) {
            var t = this.responseText || ''
            var ff = []
            var mx = t.length
            var scc = String.fromCharCode
            for (var z = 0; z < mx; z++) {
              ff[z] = scc(t.charCodeAt(z) & 255)
            }
            // /
            var data = ff.join('')
            player.currentData = data
            player.loadMidiFile(onsuccess, onprogress, onerror)
          } else {
            onerror && onerror('Unable to load MIDI file')
          }
        }
      }
      fetch.send()
    }
  }

  player.getFileInstruments = function () {
    var instruments = {}
    var programs = {}
    for (var n = 0; n < player.data.length; n++) {
      var event = player.data[n][0].event
      if (event.type !== 'channel') {
        continue
      }
      var channel = event.channel
      switch (event.subtype) {
        case 'controller':
          //        console.log(event.channel, root.defineControl[event.controllerType], event.value)
          break
        case 'programChange':
          programs[channel] = event.programNumber
          break
        case 'noteOn':
          var program = programs[channel]
          var gm = root.GM.byId[isFinite(program) ? program : channel]
          instruments[gm.id] = true
          break
      }
    }
    var ret = []
    for (var key in instruments) {
      ret.push(key)
    }
    return ret
  }

  // Playing the audio

  var eventQueue = [] // hold events to be triggered
  var queuedTime //
  var startTime = 0 // to measure time elapse
  var noteRegistrar = {} // get event for requested note
  var onMidiEvent // listener
  var scheduleTracking = function (channel, note, currentTime, offset, message, velocity, eventObj) {
    var wait = currentTime - offset;
    return setTimeout(function () {
      var data = {
        channel: channel,
        note: note,
        now: currentTime,
        end: player.endTime,
        message: message,
        velocity: velocity,
        rawData: eventObj.rawData
      }
      //
      if (message === 128) {
        delete noteRegistrar[note]
      } else {
        noteRegistrar[note] = data
      }
      if (onMidiEvent) {
        onMidiEvent(data)
      }
      player.currentTime = currentTime
      // /
      eventQueue.shift()
      console.log(eventQueue, wait, player.getAudioContextPlaytime(), (queuedTime / 1000) - 1);
      // /
      if (eventQueue.length < 5) {
        startAudio(queuedTime, true)
      } else if (player.getAudioContextPlaytime() >= (queuedTime / 1000) - 1 && queuedTime < player.endTime) { // grab next sequence
        startAudio(queuedTime, true)
      }
    }, currentTime - offset)
  }

  player.getContext = function () {
    if (root.api === 'webaudio') {
      return root.WebAudio.getContext()
    } else {
      player.ctx = { get currentTime(){return window.performance.now() / 1000}}
    }
    return player.ctx
  }

  var getLength = function () {
    var data = player.data
    var length = data.length
    var totalTime = 0.5
    for (var n = 0; n < length; n++) {
      totalTime += data[n][1]
    }
    return totalTime
  }

  var __now
  var getNow = function () {
    if (window.performance && window.performance.now) {
      return window.performance.now()
    } else {
      return Date.now()
    }
  }

  var startAudio = function (currentTime, fromCache, onsuccess) {
    if (!player.replayer) {
      return
    }
    if (!fromCache) {
      if (typeof currentTime === 'undefined') {
        currentTime = player.restart
      }
      // /
      player.playing && stopAudio()
      player.playing = true
      player.data = player.replayer.getData()
      player.endTime = getLength()
    }
    // /
    var note
    var offset = 0
    var messages = 0
    var data = player.data
    var ctx = player.getContext()
    var length = data.length

    //console.log("========", currentTime, "===========", length, messages, eventQueue);
    //
    queuedTime = 0.5
    // /
    // var interval = eventQueue[0] && eventQueue[0].interval || 0
    var foffset = currentTime - player.currentTime
    // /
    // if (root.api !== 'webaudio') { // set currentTime on ctx
    //   var now = getNow()
    //   __now = __now || now
    //   ctx.currentTime = (now - __now) / 1000
    // }
    // /
   
    startTime = currentTime;
    // player.playingStartTime = Date.now() - startTime * 10;
    // /
    //console.log(data);
    for (var n = 0; n < length && messages < 5; n++) {
      var obj = data[n];
      //console.log("-", obj);
      // console.log(currentTime, queuedTime, obj[0], obj[0].event);
      //console.log(queuedTime, obj[1], offset);

      queuedTime += obj[1]
      if ((queuedTime) <= currentTime) {
        offset = queuedTime;
        //console.log("in", currentTime, queuedTime, obj[1], obj[0].event);
        if (currentTime > 0.5 || obj[0].event.type !== 'channel') {
             //console.log("in", currentTime, queuedTime, obj[1], obj[0].event);
            continue;
        }
      }
      //console.log("!!", currentTime, queuedTime, offset);
      // /
      currentTime = queuedTime - offset;
      // /
      var event = obj[0].event;
      if (event.type !== 'channel') {
        continue;
      }

     
      // /
      var channelId = event.channel
      var channel = root.channels[channelId]
      //var delay2 = ctx.currentTime + ((currentTime + foffset + player.startDelay) / 1000)
      var delay = player.ctxStartTime + ((currentTime + startTime - player.playingStartTime + player.startDelay) / 1000)

      scheduel = delay - ctx.currentTime ;
      //console.log(ctx.currentTime, player.ctxStartTime, currentTime, foffset);
      console.log("event", obj, delay);

      var queueTime = queuedTime - offset + player.startDelay
      switch (event.subtype) {
        case 'controller':
          root.setController(event, channelId, event.controllerType, event.value, delay)
          break
        case 'programChange':
          if(!player.OverrideProgramChanges){
            //console.log(event);
             root.programChange(event, channelId, event.programNumber, delay)
          }
          break
        case 'pitchBend':
          root.pitchBend(event, channelId, event.value, delay)
          break
        case 'noteOn':
          if (channel.mute) break
          note = event.noteNumber + (player.MIDIOffset || 0)
          //console.log(channelId, note, event.velocity, delay);
          eventQueue.push({
            event: event,
            time: queueTime,
            source: root.noteOn(event, channelId, note, event.velocity, delay),
            interval: scheduleTracking(event, channelId, note, queuedTime + player.startDelay, offset - foffset, 144, event.velocity, event)
          })
          messages++
          break
        case 'noteOff':
          if (channel.mute) break
          note = event.noteNumber + (player.MIDIOffset || 0)
          //console.log(note, player.MIDIOffset, event.noteNumber);
          eventQueue.push({
            event: event,
            time: queueTime,
            source: root.noteOff(event, channelId, note, delay),
            interval: scheduleTracking(event, channelId, note, queuedTime, offset - foffset, 128, 0, event)
          })
          break
        default:
          break
      }
    }
    // /
    onsuccess && onsuccess(eventQueue)
  }

  var stopAudio = function () {
    var ctx = player.getContext()
    player.playing = false
    player.restart += (ctx.currentTime - startTime) * 1000
    // stop the audio, and intervals
    while (eventQueue.length) {
      let o = eventQueue.pop()
      window.clearInterval(o.interval)
      if (!o.source) continue // is not webaudio
      if (typeof (o.source) === 'number') {
        window.clearTimeout(o.source)
      } else { // webaudio
        o.source.disconnect(0)
      }
    }
    // run callback to cancel any notes still playing
    for (var key in noteRegistrar) {
      let o = noteRegistrar[key]
      if (noteRegistrar[key].message === 144 && onMidiEvent) {
        const endPlaybackMidiData = [128 ,o.note, o.velocity]
        onMidiEvent({
          channel: o.channel,
          note: o.note,
          now: o.now,
          end: o.end,
          message: 128,
          velocity: o.velocity,
          rawData: endPlaybackMidiData
        });
      }
    }

    if(root.stopAllNotes){
      root.stopAllNotes();
    }
    // reset noteRegistrar
    noteRegistrar = {}
  }
})()
