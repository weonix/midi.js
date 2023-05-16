/*
  ----------------------------------------------------------------------
  Web MIDI API - Native Soundbanks
  ----------------------------------------------------------------------
  http://webaudio.github.io/web-midi-api/
  ----------------------------------------------------------------------
*/
import root from '../root'

(function () {
  var plugin = null;
  var output = null;
  var midi = root.WebMIDI = {api: 'webmidi'}
  var stateChanageEventCallback = null;
  midi.outputs = [];


  midi.send = function (data, delay) { // set channel volume
    if(!output || !event.rawData){
      return
    }
    delay += midi.ctxStartTime
    output.send(data, delay * 1000)
  }

  midi.setController = function (event, channel, type, value, delay) {
    if(!output || !event.rawData){
      return
    }
    delay += midi.ctxStartTime
    let rawdata = event.rawData
    if(root.MidiChannelMapping[channel] != undefined){
      rawdata = midi.setEventChannel(rawdata, root.MidiChannelMapping[channel])
    }
    output.send(rawdata, delay * 1000)
    //output.send([channel, type, value], delay * 1000)
  }

  midi.setVolume = function (channel, volume, delay) { // set channel volume
  if(!output || !event.rawData){
      return
    }
    delay += midi.ctxStartTime
    if(root.MidiChannelMapping[channel] != undefined){
      channel = root.MidiChannelMapping[channel]
    }
    output.send([0xB0 + channel, 0x07, volume], delay * 1000)
  }

  midi.programChange = function (event, channel, program, delay) { // change patch (instrument)
    if(!output || !event.rawData){
      return
    }
    delay += midi.ctxStartTime
    return 
    if(root.MidiChannelMapping[channel] != undefined){
      rawdata = midi.setEventChannel(rawdata, root.MidiChannelMapping[channel])
    }
    output.send(event.rawData, delay * 1000)
    //output.send([0xC0 + channel, program], delay * 1000)
  }

  midi.pitchBend = function (event, channel, program, delay) { // pitch bend
  if(!output || !event.rawData){
      return
    }
    delay += midi.ctxStartTime
    let rawdata = event.rawData
    if(root.MidiChannelMapping[channel] != undefined){
      rawdata = midi.setEventChannel(rawdata, root.MidiChannelMapping[channel])
    }
    output.send(rawdata,delay * 1000)
    //console.log([0xE0 + channel, program],delay * 1000);
    //output.send([0xE0 + channel, program], delay * 1000)
  }

  midi.noteOn = function (event, channel, note, velocity, delay) {
    if(!output || !event.rawData){
      return
    }
    delay += midi.ctxStartTime
    let rawdata = event.rawData
    //console.log(rawdata, channel, root.MidiChannelMapping[channel], root.MidiChannelMapping)
    if(root.MidiChannelMapping[channel] != undefined){
      rawdata = midi.setEventChannel(rawdata, root.MidiChannelMapping[channel])
     // console.log(rawdata)
    }
    //console.log("noteOn", delay * 1000 )
    output.send(rawdata, delay * 1000)
    //output.send([0x90 + channel, note, velocity], delay * 1000)
  }

  midi.noteOff = function (event, channel, note, delay) {
    if(!output || !event.rawData){
      return
    }
    delay += midi.ctxStartTime
    let rawdata = event.rawData
    if(root.MidiChannelMapping[channel] != undefined){
      rawdata = midi.setEventChannel(rawdata, root.MidiChannelMapping[channel])
    }
    output.send(rawdata, delay * 1000)
    //output.send([0x80 + channel, note, 0], delay * 1000)
  }

  midi.chordOn = function (channel, chord, velocity, delay) {
    if(!output){
      return
    }
      if(root.MidiChannelMapping[channel] != undefined){
          channel = root.MidiChannelMapping[channel]
      }
    for (var n = 0; n < chord.length; n++) {
      var note = chord[n]
      output.send([0x90 + channel, note, velocity], delay * 1000)
    }
  }

  midi.chordOff = function (channel, chord, delay) {
    if(!output ){
      return
    }
      if(root.MidiChannelMapping[channel] != undefined){
          channel = root.MidiChannelMapping[channel]
      }

    
    for (var n = 0; n < chord.length; n++) {
      var note = chord[n]
      output.send([0x80 + channel, note, 0], delay * 1000)
    }
  }

  midi.stopAllNotes = function (delay, lookAhead) {
    if(!output){
      return
    }
    if(output.clear){
      output.clear()
    }

    if (delay == 0){
      delay = window.performance.now() / 1000
    }
    else{
      delay += midi.ctxStartTime
    }

    //output.send([0x90, 100, 100], (lookAhead + delay) * 1000)
    
    for (var channel = 0; channel < 16; channel++) {
      //output.send([0xB0 + channel, 0x7B, 0])
      output.send([0xB0 + channel, 0x7B, 0], delay * 1000)
      //output.send([0x80 + channel, 1, 1], delay * 1000)
      // output.send([0xB0 + channel, 0x7B, 0])
    }
    //console.log("stopAllNotes",lookAhead, (lookAhead + delay)*1000)
    output.send([0xFC], delay * 1000)
    // output.send([0xFC])
  }

  midi.connect = async function (opts) {
    // console.log(opts)
    // root.setDefaultPlugin(midi)
    // var errFunction = function (err) { // well at least we tried!
    //   if (window.AudioContext) { // Chrome
    //     opts.api = 'webaudio'
    //   } else if (window.Audio) { // Firefox
    //     opts.api = 'audiotag'
    //   } else { // no support
    //     return err
    //   }
    //   root.loadPlugin(opts)
    // }
    // /
    
    
    // console.log(output)
    // if (output == undefined) { // nothing there...
    //   errFunction()
    // } else {
    
      // console.log( opts.onsuccess)
      // opts.onsuccess && opts.onsuccess()
    // }

  }

  midi.userConnect = async () => {
    try {
      var access = await navigator.requestMIDIAccess()
      plugin = access;
      console.log(access)
      updateOutputList();
      stateChanageEventCallback && stateChanageEventCallback(null)
      access.onstatechange = (event) => {
        //console.log(event);
        updateOutputList();
        stateChanageEventCallback && stateChanageEventCallback(event);
      }

      function updateOutputList() {
        midi.outputs.clear();
        var outputs = access.outputs;
        if (typeof outputs === 'function') { // Chrome pre-43
          outputs = outputs();
        }
        for (const out of outputs) {
          midi.outputs.push(out[1]);
        }
      }
      return true;
    } catch (error) {
      console.log(error)
    }
    return false;
    
  }

  midi.setStateChangeEventListener = function (callback) {
    stateChanageEventCallback = callback;
  }

  midi.setOutput= function (id) {
    for (const out of midi.outputs) {
      if(out.id == id){
        output = out;
        return;
      }
    }
    output = null;
  }

  midi.setEventChannel = function(rawData, channelNum) {
    rawData[0] = ( rawData[0] & 0xf0) | channelNum;
    return rawData
  }

  midi.recordCtxStartTime = (delay) => {
    midi.ctxStartTime = window.performance.now() / 1000 + delay
  }
})()
