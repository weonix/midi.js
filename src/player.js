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
  player.minLookAheadTime = 0.5;

  var queuedTime //
  var startTime = 0 // to measure time elapse
  var noteRegistrar = {} // get event for requested note
    var noteOffRegistrar = {}
  var onMidiEvent // listener


  // var data = {
  //   channel: channel,
  //   note: note,
  //   now: currentTime,
  //   end: player.endTime,
  //   message: message,
  //   velocity: velocity,
  //   rawData: eventObj.rawData
  // }
  player.start = player.resume = function (onsuccess) {
    if (player.currentTime < -1) {
      player.currentTime = -1
    }
    for (const api in root.API) {
      if(root.API[api].avaliable){
        root.API[api].api.recordCtxStartTime();
      }
    }
    var ctx = player.getContext();
    player.ctxStartTime = ctx.currentTime;
    player.playingStartTime = player.currentTime;
    player.eventPosition = 0;
    //startAudio(player.currentTime, null, onsuccess)
    player.scheduleLoop();
  }

  var stopAudio = function () {
    player.playing = false
    player.restart += player.getAudioContextPlaytime();

    // stop the audio, and intervals
    // while (eventQueue.length) {
    //   let o = eventQueue.pop()
    //   window.clearInterval(o.interval)
    //   if (!o.source) continue // is not webaudio
    //   if (typeof (o.source) === 'number') {
    //     window.clearTimeout(o.source)
    //   } else { // webaudio
    //     o.source.disconnect(0)
    //   }
    // }

    // run callback to cancel any notes still playing
    for (var key in noteRegistrar) {
      let o = noteRegistrar[key]
      //console.log(o, "off");
      //root.noteOff(o, o.channel, o.note, 0);
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
      root.stopAllNotes(player.minLookAheadTime);
    }

    clearInterval(loopHandler);
    // reset noteRegistrar
    noteRegistrar = {}
  }

  player.getAudioContextPlaytime = function () {
    let ctx = player.getContext();
    var ctxTime = ctx == null ? 0 : ctx.currentTime;
    return ctxTime - player.ctxStartTime + player.playingStartTime / 1000;
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


  player.getContext = function () {
    if (root.API.WebAudio.avaliable) {
      return root.WebAudio.getContext()
    } else {
      return { get currentTime(){return window.performance.now() / 1000}}
    }
    //return player.ctx
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

  player.loadMidiFile = async function () { //onsuccess, onprogress, onerror
    try {
      // console.log(MidiFile(player.currentData), new Replayer(MidiFile(player.currentData), player.timeWarp, null, player.BPM))
      player.replayer = new Replayer(MidiFile(player.currentData), player.timeWarp, null, player.BPM)
      player.data = player.replayer.getData()
      player.endTime = getLength()
      // /
      // root.loadPlugin({
      //   // instruments: player.getFileInstruments(),
      //   onsuccess: onsuccess,
      //   onprogress: onprogress,
      //   onerror: onerror
      // })
    } catch (event) {
      console.error(event)
      onerror && onerror(event)
    }
  }

  player.loadFile = async function (file) { // onsuccess, onprogress, onerror)
    player.stop()
    if (file.indexOf('base64,') !== -1) {
      var data = window.atob(file.split(',')[1])
      player.currentData = data
      await player.loadMidiFile()
    } else {
      await new Promise((resolve, reject)=>{
        var fetch = new window.XMLHttpRequest()
        fetch.open('GET', file)
        fetch.overrideMimeType('text/plain; charset=x-user-defined')
        fetch.onreadystatechange = async function () {
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
              await player.loadMidiFile()
              resolve();
            } else {
              reject();
            }
          }
        }
        fetch.send()
      });
      
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

  //var eventQueue = [] // hold events to be triggered

  // var scheduleTracking = function (channel, note, currentTime, wait, message, velocity, eventObj) {
  //   var wait = wait;
  //   return setTimeout(function () {
  //     var data = {
  //       channel: channel,
  //       note: note,
  //       now: currentTime,
  //       end: player.endTime,
  //       message: message,
  //       velocity: velocity,
  //       rawData: eventObj.rawData
  //     }
  //     //
  //     if (message === 128) {
  //       delete noteRegistrar[note]
  //     } else {
  //       noteRegistrar[note] = data
  //     }
  //     if (onMidiEvent) {
  //       onMidiEvent(data)
  //     }
  //     player.currentTime = currentTime
  //     // /
  //     eventQueue.shift()
  //     // /
  //     // var allowedTimeStep = 2;
  //     // for (const iterator of eventQueue) {
        
  //     // }
  //     if (eventQueue.length < 10) {
  //       startAudio(queuedTime, true)
  //     } else if (player.getAudioContextPlaytime() >= (queuedTime / 1000) - player.minLookAheadTime && queuedTime < player.endTime) { // grab next sequence
  //       startAudio(queuedTime, true)
  //     }
  //   }, wait)
  // }

  var loopHandler;
  player.scheduleLoop = function() {
    var currentTime;
    if (!player.replayer) {
      return
    }
      
    //if (!fromCache) {
    if (typeof currentTime === 'undefined') {
      currentTime = player.restart
    }
    // /
    player.playing && stopAudio()
    player.playing = true
    player.data = player.replayer.getData()
    player.endTime = getLength()
    //}

    queuedTime = player.currentTime;

    player.eventPosition = 0;

    let lastLoopTime = player.currentTime;

    loopHandler = setInterval(function () {

      if (queuedTime < player.endTime) { // grab next sequence
        // /
        var note
        var offset = 0
        var messages = 0
        var data = player.data
        var length = data.length

        var dt =  player.currentTime - lastLoopTime;
        lastLoopTime = player.currentTime;
        player.currentTime = player.getAudioContextPlaytime() * 1000;


        //console.log("========", currentTime, queuedTime, "===========");

        for (var n = player.eventPosition; n < length; n++) {
          var obj = data[n];
          
          //console.log("-", obj, (currentTime / 1000) - player.minLookAheadTime, player.getAudioContextPlaytime());
          startTime = currentTime;
          //stop queueing if look ahead is exceeded
          if ((queuedTime / 1000) - player.minLookAheadTime > ( player.getAudioContextPlaytime())){
              break;
          }

          //move currentEvent time and event position, include events before playback begin time
          currentTime += obj[1]
          
          player.eventPosition += 1;

          //console.log(currentTime, queuedTime);
          if (currentTime < queuedTime + obj[1]) {
            continue;
          }

          //move queue time if we start starting to process new incoming events
          queuedTime += obj[1]
          
          //handle or queue the event
          var event = obj[0].event;
          if (event.type !== 'channel') {
            continue;
          }

          var channelId = event.channel
          var channel = root.channels[channelId]
          var delay = ((currentTime - player.playingStartTime + player.startDelay) / 1000);

          //console.log("-", obj[0].event.channel, obj[1], event.subtype, delay);
          

          //console.log(ctx.currentTime, player.ctxStartTime, currentTime, foffset);
          //console.log("event scheduled", obj, delay, ctx.currentTime);

          switch (event.subtype) {
            case 'controller':
              root.setController(event, channelId, event.controllerType, event.value, delay)
              break
            case 'programChange':
              if(!player.OverrideProgramChanges){
                root.programChange(event, channelId, event.programNumber, delay)
              }
              break
            case 'pitchBend':
              root.pitchBend(event, channelId, event.value, delay)
              break
            case 'noteOn':
              if (channel.mute) break
              note = event.noteNumber + (player.MIDIOffset || 0)
              root.noteOn(event, channelId, note, event.velocity, delay);
              var key = channelId + " " + note + " " + delay;
              noteRegistrar[key] = {
                  channel: channelId,
                  note: note,
                  now: currentTime,
                  end: player.endTime,
                  message: 144,
                  velocity: event.velocity,
                  rawData: event.rawData
              }
              messages++
              break
            case 'noteOff':
              //if (channel.mute) break
              note = event.noteNumber + (player.MIDIOffset || 0)
              root.noteOff(event, channelId, note, delay);
              var key = channelId + " " + note + " " + delay;
              noteOffRegistrar[key] = {
                channel: channelId,
                note: note,
                now: currentTime,
                end: player.endTime,
                message: 128,
                velocity: event.velocity,
                rawData: event.rawData
              }
              break
            default:
              break
          }
        }
      }


      for (const note in noteOffRegistrar) {
        // if(!noteRegistrar[note]){
        //     console.log(noteOffRegistrar[note])
        //     console.log(noteRegistrar)
        // }
        if(noteOffRegistrar[note].now <= player.getAudioContextPlaytime() * 1000){
          for (const noteOn in noteRegistrar) {
            if(noteRegistrar[noteOn].note == noteOffRegistrar[note].note){
              console.log("time off", noteRegistrar[noteOn])
              delete noteRegistrar[noteOn];
              delete noteOffRegistrar[note];
              break;
            }
          }
        }
      }

      for (const api in root.API) {
        if(root.API[api].avaliable && root.API[api].api.onLoopCallBack){
          root.API[api].api.onLoopCallBack(dt);
        }
      }
    }, 5)
  }

  root.setChannelMute = function (channelId, isMuted, delay) {
    var channel = root.channels[channelId]
    if (delay) {
      return setTimeout(function () {
        channel.mute = isMuted
      }, delay)
    } else {
      channel.mute = isMuted
    }
    
  }

  // var startAudio = function (currentTime, fromCache, onsuccess) {
  //   if (!player.replayer) {
  //     return
  //   }
  //   if (!fromCache) {
  //     if (typeof currentTime === 'undefined') {
  //       currentTime = player.restart
  //     }
  //     // /
  //     player.playing && stopAudio()
  //     player.playing = true
  //     player.data = player.replayer.getData()
  //     player.endTime = getLength()
  //   }
  //   // /
  //   var note
  //   var offset = 0
  //   var messages = 0
  //   var data = player.data
  //   var ctx = player.getContext()
  //   var length = data.length

  //   //console.log("========", currentTime, "===========", length, messages, eventQueue);
  //   //
  //   queuedTime = 0.5
  //   // /
  //   // var interval = eventQueue[0] && eventQueue[0].interval || 0
  //   var foffset = currentTime - player.currentTime
  //   // /
  //   // if (root.api !== 'webaudio') { // set currentTime on ctx
  //   //   var now = getNow()
  //   //   __now = __now || now
  //   //   ctx.currentTime = (now - __now) / 1000
  //   // }
  //   // /
   
  //   startTime = currentTime;
  //   // player.playingStartTime = Date.now() - startTime * 10;
  //   // /
  //   //console.log(data);
  //   var allowedTimeStep = 3; //player.eventPosition
  //   for (var n = 0; n < length && allowedTimeStep > 0; n++) {
  //     var obj = data[n];
  //     //console.log("-", obj);
  //     // console.log(currentTime, queuedTime, obj[0], obj[0].event);
  //     //console.log(queuedTime, obj[1], offset);
  //     // if (player.getAudioContextPlaytime() >= (queuedTime / 1000) - player.minLookAheadTime){
  //     //   break;
  //     // }
  //     //player.eventPosition += 1;
      
  //     queuedTime += obj[1]
  //     if ((queuedTime) <= currentTime) {
  //       offset = queuedTime;
  //       //console.log("in", currentTime, queuedTime, obj[1], obj[0].event);
  //       if (currentTime > 0.5) {
  //            //console.log("in", currentTime, queuedTime, obj[1], obj[0].event);
  //           continue;
  //       }
  //     }

  //     if(obj[1] > 0){
  //       allowedTimeStep -= 1;
  //     }
  //     //console.log("!!", currentTime, queuedTime, offset);
  //     // /
  //     currentTime = queuedTime - offset;
  //     // /
  //     var event = obj[0].event;
  //     if (event.type !== 'channel') {
  //       continue;
  //     }

     
  //     // /
  //     var channelId = event.channel
  //     var channel = root.channels[channelId]
  //     var delay = player.ctxStartTime + ((currentTime + startTime - player.playingStartTime + player.startDelay) / 1000)

  //     var scheduleWait = delay - ctx.currentTime / 1000;
  //     //console.log(ctx.currentTime, player.ctxStartTime, currentTime, foffset);
  //     //console.log("event", obj, delay, ctx.currentTime, allowedTimeStep);

      

  //     var queueTime = queuedTime - offset + player.startDelay
  //     switch (event.subtype) {
  //       case 'controller':
  //         root.setController(event, channelId, event.controllerType, event.value, delay)
  //         break
  //       case 'programChange':
  //         if(!player.OverrideProgramChanges){
  //           //console.log(event);
  //            root.programChange(event, channelId, event.programNumber, delay)
  //         }
  //         break
  //       case 'pitchBend':
  //         root.pitchBend(event, channelId, event.value, delay)
  //         break
  //       case 'noteOn':
  //         if (channel.mute) break
  //         note = event.noteNumber + (player.MIDIOffset || 0)
  //         //console.log(channelId, note, event.velocity, delay);
  //         eventQueue.push({
  //           event: event,
  //           time: queueTime,
  //           source: root.noteOn(event, channelId, note, event.velocity, delay),
  //           interval: scheduleTracking(event, channelId, note, queuedTime + player.startDelay, scheduleWait, 144, event.velocity, event)
  //         })
  //         messages++
  //         break
  //       case 'noteOff':
  //         if (channel.mute) break
  //         note = event.noteNumber + (player.MIDIOffset || 0)
  //         //console.log(note, player.MIDIOffset, event.noteNumber);
  //         eventQueue.push({
  //           event: event,
  //           time: queueTime,
  //           source: root.noteOff(event, channelId, note, delay),
  //           interval: scheduleTracking(event, channelId, note, queuedTime, scheduleWait, 128, 0, event)
  //         })
  //         break
  //       default:
  //         break
  //     }
  //   }
  //   // /
  //   onsuccess && onsuccess(eventQueue)
  // }

})()
