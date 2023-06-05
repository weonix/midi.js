/*
  ----------------------------------------------------------
  midi.Player : 0.3.1 : 2015-03-26
  ----------------------------------------------------------
  https://github.com/mudcube/midi.js
  ----------------------------------------------------------
*/

import { MidiFile, Replayer } from './jasmid'
import root from './root'
import { setPreciseInterval, clearPreciseInterval } from 'precise-interval';

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
  player.TimeSignitures = null
  player.OverrideProgramChanges = false
  player.playingStartTime = 0;
  player.ctxStartTime = 0;
  player.lastCallbackTime = 0;
  player.minLookAheadTime = 0.5;
  player.useMetronome = false;
  player.queuedTime  = 0//
  player.currentProcessedEventTime = 0//

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

    player.insideLoop = false;
    // if (player.loopStart !== undefined) {
    //   if(player.currentTime < player.loopStart * 1000 || player.currentTime > player.loopEnd * 1000){
    //     player.currentTime = player.loopStart * 1000;
    //   }
    // }
    //startAudio(player.currentTime, null, onsuccess)
    if(player.playing){
      stopAudio()
    }
    player.scheduleLoop();
  }

  player.startAudio = (startTime, ctxDelay = 0) => {
    player.playingStartTime = player.currentTime = startTime;
    for (const api in root.API) {
      if (root.API[api].avaliable) {
        root.API[api].api.recordCtxStartTime(ctxDelay);
      }
    }
    for (const channelId in root.channels) {
      let channel = root.channels[channelId];
      let status = 0xc0 & channel;
      root.programChange(
        {
          type: 'channel',
          channel: channelId,
          subtype: 'programChange',
          programNumber: channel.instrument,
          rawData:[status, channel.instrument]
        },
        channelId, channel.instrument, 0
      )
    }
    
    var ctx = player.getContext();
    player.ctxStartTime = ctx.currentTime + ctxDelay;
   
    player.eventPosition = 0;
        //if (!fromCache) {
    //if (typeof player.currentProcessedEventTime === 'undefined') {
    player.currentProcessedEventTime = 0
    //console.log(player.restart, player.currentProcessedEventTime, startTime)
    //}
    // /stopAudio()
    player.playing = true
    player.data = player.replayer.getData()
    player.endTime = getLength()
    //}
    player.queuedTime = player.currentTime;
    player.eventPosition = 0;
  }

  var stopAudio = function () {
    player.playing = false
    player.restart += player.getDisplayedAudioContextPlaytime();

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
    var delay = ( (player.currentProcessedEventTime - player.playingStartTime + player.startDelay) / 1000);
    // run callback to cancel any notes still playing
    for (var key in noteRegistrar) {
      let o = noteRegistrar[key]
      //console.log(o, "off");
      //root.noteOff(o, o.channel, o.note, 0);
      if (noteRegistrar[key].message === 144 && onMidiEvent) {
        const endPlaybackMidiData = [128 ,o.note, o.velocity]
        let event = {
          channel: o.channel,
          note: o.note,
          now: o.now,
          end: o.end,
          message: 128,
          velocity: o.velocity,
          rawData: endPlaybackMidiData
        }
        onMidiEvent(event);
        root.noteOff(event, o.channel, o.note, delay);
      }
      
    }


    if(root.stopAllNotes){
      root.stopAllNotes(delay, player.minLookAheadTime, true);
    }

    clearPreciseInterval(loopHandler);
    // reset noteRegistrar
    noteRegistrar = {}
  }

  player.getAudioContextPlaytime = function () {
    let ctx = player.getContext();
    var ctxTime = ctx == null ? window.performance.now() / 1000 : ctx.currentTime;
    return ctxTime - player.ctxStartTime + player.playingStartTime / 1000;
  }

  player.getDisplayedAudioContextPlaytime = function () {
    let time = player.getAudioContextPlaytime();
    if(player.insideLoop){
      if(player.loopStart !== undefined && player.loopEnd > player.loopStart){
        let loopDuration = player.loopEnd - player.loopStart;
        while(time < player.loopStart){
          time += loopDuration;
        }
        
        if(time >= player.loopEnd){
          time = player.loopStart + time % loopDuration;
        }
      }
    }
    return time;
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

  player.setOnLoopRestartedListener = function (onLoopRestarted) {
    player.onLoopRestarted = onLoopRestarted
  }

  player.removeOnLoopRestartedListener = function () {
    player.onLoopRestarted = undefined
  }

  player.setLoop = function (start, end) {
    player.loopStart = start;
    player.loopEnd = end;
    console.log(start, end)
    console.trace()
  }

  player.cancelLoop = function () {
    player.loopStart = undefined;
    player.loopEnd = undefined;
    //console.log("cancelLoop")
  }

  player.getContext = function () {
    if (root.API.WebAudio.enabled && root.API.WebAudio.avaliable && root.WebAudio.getContext()) {
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

  var loopHandler;
  player.scheduleLoop = function() {

    if (!player.replayer) {
      return
    }
      
    player.startAudio(player.currentTime);

    let lastLoopTime = player.currentTime;

    let hasLooped = false

    //console.log(player.data);

    loopHandler = setPreciseInterval(function () {
      if (player.queuedTime < player.endTime) { // grab next sequence
        // /
        var note
        var offset = 0
        var messages = 0
        var data = player.data
        var length = data.length

        var dt =  player.currentTime - lastLoopTime;
        lastLoopTime = player.currentTime;
        player.currentTime = player.getAudioContextPlaytime() * 1000;

        
        //console.log("========", player.currentProcessedEventTime, player.queuedTime, "===========");

        for (var n = player.eventPosition; n < length; n++) {
          var obj = data[n];
          
          //console.log("-", obj, ( player.queuedTime / 1000) - player.minLookAheadTime, player.getAudioContextPlaytime());
          //stop queueing if look ahead is exceeded
          if ((player.queuedTime / 1000) - player.minLookAheadTime > ( player.getAudioContextPlaytime())){
              break;
          }

         

          //move currentEvent time and event position, include events before playback begin time
          player.currentProcessedEventTime += obj[1]
          
          player.eventPosition += 1;

          // var tooEarly = player.currentProcessedEventTime < player.queuedTime;
          // console.log(n, player.currentProcessedEventTime, player.queuedTime, obj, player.currentProcessedEventTime + obj[1], tooEarly);

          // if (tooEarly) { // + obj[1]
          //   console.log(n, player.currentProcessedEventTime, player.queuedTime, obj, player.currentProcessedEventTime + obj[1], tooEarly)
          //   continue;
          // }

          if(player.currentProcessedEventTime < player.queuedTime){
            continue
          }

          // if (player.currentProcessedEventTime < player.playingStartTime) {
          //   continue;
          // }


          // console.log(obj[0], "ok");

          //move queue time if we start starting to process new incoming events
          //player.queuedTime += obj[1]

          player.queuedTime = player.currentProcessedEventTime

          if(player.loopEnd != undefined){
            let ctxTime = player.getAudioContextPlaytime()
            if(ctxTime < player.loopEnd && ctxTime > player.loopStart){
              player.insideLoop = true
            }
          }

          //goes back to loop start when loop end is exceeded
          if (player.insideLoop && player.loopEnd != undefined){
            if(player.queuedTime >= player.loopEnd * 1000 || player.queuedTime < player.loopStart * 1000){
              const delay = player.queuedTime / 1000 - player.getAudioContextPlaytime();
              const stopNoteDelay = (player.loopEnd * 1000 - player.playingStartTime + player.startDelay) / 1000
              root.stopAllNotes(stopNoteDelay, 0)

              noteOffRegistrar["stopAllNotes"] = {
                now: player.queuedTime,
                loopStart: player.loopStart * 1000,
                loopEnd: player.loopEnd * 1000,
                ctxTime: player.ctxStartTime + delay,
              }

              //console.log("before looped", delay, player.queuedTime, player.loopStart * 1000, player.playingStartTime)

              //console.log(player.getAudioContextPlaytime(), player.queuedTime, "loop", player.loopStart * 1000, player.loopEnd * 1000, delay)
              player.startAudio(player.loopStart * 1000, delay);
              hasLooped  = true

              if(player.onLoopRestarted){
                player.onLoopRestarted.call(root)
              }

              //console.log("LOOPED", delay, player.queuedTime, player.loopStart * 1000, player.playingStartTime)

              break;
            }
          }

          if(obj[0].type == 'metronomeEvent'){
            if(player.useMetronome){
              var delay = ((player.currentProcessedEventTime - player.playingStartTime + player.startDelay) / 1000);
              if(obj[0].metronomeEventsType == "light"){
                root.noteOn({}, 'metronome', 100, 60, delay);
              }
              else{
                root.noteOn({}, 'metronome', 88, 110, delay);
              }
            }
            messages++
            continue;
          }
          
          //handle or queue the event
          var event = obj[0].event;
          if (event.type !== 'channel') {
            continue;
          }

          var channelId = event.channel
          var channel = root.channels[channelId]
          var delay = ( (player.currentProcessedEventTime - player.playingStartTime + player.startDelay) / 1000);

          //console.log("-", obj[0].event.channel, obj[1], event.subtype, delay);
          

          //console.log(ctx.currentTime, player.ctxStartTime, player.currentProcessedEventTime, foffset);
         //console.log("event scheduled", obj, delay);

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
              event.rawData[1] = note
              root.noteOn(event, channelId, note, event.velocity, delay);
              var key = channelId + " " + note + " " + delay;
              noteRegistrar[key] = {
                  channel: channelId,
                  note: note,
                  now: player.currentProcessedEventTime,
                  ctxTime: player.ctxStartTime + delay,
                  end: player.endTime,
                  message: 144,
                  velocity: event.velocity,
                  rawData: event.rawData,
                  track: event.track,
              }
              messages++
              break
            case 'noteOff':
              //if (channel.mute) break
              note = event.noteNumber + (player.MIDIOffset || 0)
              event.rawData[1] = note
              root.noteOff(event, channelId, note, delay);
              var key = channelId + " " + note + " " + delay;
              noteOffRegistrar[key] = {
                channel: channelId,
                note: note,
                now: player.currentProcessedEventTime,
                ctxTime: player.ctxStartTime + delay,
                end: player.endTime,
                message: 128,
                velocity: event.velocity,
                rawData: event.rawData,
                track: event.track,
              }
              break
            default:
              break
          }
        }
      }

      const currentTime =  player.getContext().currentTime;
      //console.log(currentTime)
      for (const note in noteOffRegistrar) {
        // if(!noteRegistrar[note]){
        //     console.log(noteOffRegistrar[note])
        //     console.log(noteRegistrar)
        // }
        const noteOffData = noteOffRegistrar[note];
        //console.log(note, noteOffData, player.getDisplayedAudioContextPlaytime() * 1000)
        if(note == "stopAllNotes"){
          if(noteOffData.ctxTime <= currentTime){
            for (const noteOn in noteRegistrar) {
              const noteOnData = noteRegistrar[noteOn];
              if(noteOnData.ctxTime < noteOffData.ctxTime){
                const noteOnData = noteRegistrar[noteOn];
                //console.log("all off", noteRegistrar[noteOn], note)
                delete noteRegistrar[noteOn];
              }
            }
            delete noteOffRegistrar[note];
          }
        }
        else 
        // if(noteOffData.now <= player.getDisplayedAudioContextPlaytime() * 1000){
        //   for (const noteOn in noteRegistrar) {
        //     const noteOnData = noteRegistrar[noteOn];
        //     if((noteOnData.note == noteOffData.note && noteOnData.channel == noteOffData.channel ) && noteOnData.now < noteOffData.now){
        //       console.log("time off", noteRegistrar[noteOn], note)
        //       delete noteRegistrar[noteOn];
        //     }
        //   }
        //   delete noteOffRegistrar[note];
        // }
        //console.log( "==============", currentTime)
        if(noteOffData.ctxTime <= currentTime){
         // console.log( "==== noteOff checking", noteOffData, "---", currentTime)
          for (const noteOn in noteRegistrar) {
            const noteOnData = noteRegistrar[noteOn];
            //console.log(noteOnData)
            if((noteOnData.note == noteOffData.note && noteOnData.channel == noteOffData.channel ) && noteOnData.ctxTime < noteOffData.ctxTime){
              //console.log("timeoff", noteOnData)
              delete noteRegistrar[noteOn];
            }
          }
          delete noteOffRegistrar[note];
        }
      }

      if(player.getDisplayedAudioContextPlaytime() < player.lastDisplayedAudioContextPlaytime){
        // noteRegistrar = {}
        // noteOffRegistrar = {}
        // root.stopAllNotes()
        // console.log(player.getDisplayedAudioContextPlaytime(), player.lastDisplayedAudioContextPlaytime)
        
      }
      player.lastDisplayedAudioContextPlaytime = player.getDisplayedAudioContextPlaytime();


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

  root.setUseMetronome = function (value) {
    player.useMetronome = value;
  }

  root.getActiveNotes = function () {
    const currentTime = player.getContext().currentTime; //player.getDisplayedAudioContextPlaytime() * 1000
    var notes = []
    //console.log(noteRegistrar)
    for(var noteOn in noteRegistrar){
      const noteOnData = noteRegistrar[noteOn];
      if(noteOnData.ctxTime <= currentTime){
        // let alreadyOff = false;
        // for(var noteOff in noteOffRegistrar){
        //   const noteOffData = noteOffRegistrar[noteOff];
        //   if(noteOffData.note == noteOnData.note && noteOffData.channel == noteOnData.channel && noteOffData.ctxTime < currentTime - 0.01){
        //     alreadyOff = true
        //     break;
        //   }
        // }
        // if(!alreadyOff){
          notes.push(noteOnData)
        //}
      }
    }
    //console.log(notes, currentTime)
    return notes;
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
    //console.log("clearAnimation");

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

    //console.log("setAnimation");
    // /
    var frame = function () {
      //console.log("frame");
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
    player.animationFrameId = window.requestAnimationFrame(frame)
  }

  // helpers

  player.loadMidiFile = async function () { //onsuccess, onprogress, onerror
    try {
      // console.log(MidiFile(player.currentData), new Replayer(MidiFile(player.currentData), player.timeWarp, null, player.BPM))
      console.log(MidiFile(player.currentData));
      player.replayer = new Replayer(MidiFile(player.currentData), player.timeWarp, null, player.BPM, player.TimeSignitures, player.Measures )
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
  //       startAudio(player.queuedTime, true)
  //     } else if (player.getAudioContextPlaytime() >= (player.queuedTime / 1000) - player.minLookAheadTime && player.queuedTime < player.endTime) { // grab next sequence
  //       startAudio(player.queuedTime, true)
  //     }
  //   }, wait)
  // }


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
  //   player.queuedTime = 0.5
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
  //     // console.log(currentTime, player.queuedTime, obj[0], obj[0].event);
  //     //console.log(player.queuedTime, obj[1], offset);
  //     // if (player.getAudioContextPlaytime() >= (player.queuedTime / 1000) - player.minLookAheadTime){
  //     //   break;
  //     // }
  //     //player.eventPosition += 1;
      
  //     player.queuedTime += obj[1]
  //     if ((player.queuedTime) <= currentTime) {
  //       offset = player.queuedTime;
  //       //console.log("in", currentTime, player.queuedTime, obj[1], obj[0].event);
  //       if (currentTime > 0.5) {
  //            //console.log("in", currentTime, player.queuedTime, obj[1], obj[0].event);
  //           continue;
  //       }
  //     }

  //     if(obj[1] > 0){
  //       allowedTimeStep -= 1;
  //     }
  //     //console.log("!!", currentTime, player.queuedTime, offset);
  //     // /
  //     currentTime = player.queuedTime - offset;
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

      

  //     var queueTime = player.queuedTime - offset + player.startDelay
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
  //          event.rawData[1] = note
  //         //console.log(channelId, note, event.velocity, delay);
  //         eventQueue.push({
  //           event: event,
  //           time: queueTime,
  //           source: root.noteOn(event, channelId, note, event.velocity, delay),
  //           interval: scheduleTracking(event, channelId, note, player.queuedTime + player.startDelay, scheduleWait, 144, event.velocity, event)
  //         })
  //         messages++
  //         break
  //       case 'noteOff':
  //         if (channel.mute) break
  //         note = event.noteNumber + (player.MIDIOffset || 0)
  //          event.rawData[1] = note
  //         //console.log(note, player.MIDIOffset, event.noteNumber);
  //         eventQueue.push({
  //           event: event,
  //           time: queueTime,
  //           source: root.noteOff(event, channelId, note, delay),
  //           interval: scheduleTracking(event, channelId, note, player.queuedTime, scheduleWait, 128, 0, event)
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


