const clone = function (o) {
  if (typeof o !== 'object') return (o)
  if (o === null) return (o)
  var ret = (typeof o.length === 'number') ? [] : {}
  for (var key in o) ret[key] = clone(o[key])
  return ret
}

export function Replayer (midiFile, timeWarp, eventProcessor, bpm, inputTimeSignitures, inputMeasures) {
  var trackStates = []
  var beatsPerMinute = bpm || 120
  var bpmOverride = !!bpm
  var ticksPerBeat = midiFile.header.ticksPerBeat

  var timeSignitures = inputTimeSignitures
  if(!timeSignitures || timeSignitures.length == 0)
    timeSignitures = [{time:0, numerator:4, denominator: 4}];

  var measures = inputMeasures
  if(!measures || measures.length == 0)
    measures = [0.0];

  for (let i = 0; i < midiFile.tracks.length; i++) {
    trackStates[i] = {
      'nextEventIndex': 0,
      'ticksToNextEvent': (midiFile.tracks[i].length ? midiFile.tracks[i][0].deltaTime : null)
    }
  }

  function getNextEvent () {
    var ticksToNextEvent = null
    var nextEventTrack = null
    var nextEventIndex = null

    for (let i = 0; i < trackStates.length; i++) {
      if (
        trackStates[i].ticksToNextEvent != null &&
        (ticksToNextEvent == null || trackStates[i].ticksToNextEvent < ticksToNextEvent)
      ) {
        ticksToNextEvent = trackStates[i].ticksToNextEvent
        nextEventTrack = i
        nextEventIndex = trackStates[i].nextEventIndex
      }
    }
    if (nextEventTrack != null) {
      /* consume event from that track */
      var nextEvent = midiFile.tracks[nextEventTrack][nextEventIndex]
      if (midiFile.tracks[nextEventTrack][nextEventIndex + 1]) {
        trackStates[nextEventTrack].ticksToNextEvent += midiFile.tracks[nextEventTrack][nextEventIndex + 1].deltaTime
      } else {
        trackStates[nextEventTrack].ticksToNextEvent = null
      }
      trackStates[nextEventTrack].nextEventIndex += 1
      /* advance timings on all tracks by ticksToNextEvent */
      for (let i = 0; i < trackStates.length; i++) {
        if (trackStates[i].ticksToNextEvent != null) {
          trackStates[i].ticksToNextEvent -= ticksToNextEvent
        }
      }
      return {
        'ticksToEvent': ticksToNextEvent,
        'event': nextEvent,
        'track': nextEventTrack,
        'type': 'midiEvent',
      }
    } else {
      return null
    }
  }

  
  function addMetronomeEvents(currentTick, ticksToProcess, temporal){
    var i = 0;
    var endingTick = currentTick + ticksToProcess;
    var totalWait = 0;
    //console.log("ticksToProcess", ticksToProcess, endingTick, timeSignitures)
    for(var sign of timeSignitures){
      //console.log(sign, currentTick + ticksToProcess)
      i++;
      var signTime = sign.time;
      var nextSignTime = timeSignitures.length < i ? timeSignitures[i].time * ticksPerBeat: currentTick + ticksToProcess
      if(signTime >= currentTick + ticksToProcess){
        break;
      }
      var beatTime = ticksPerBeat * 4 / sign.denominator;


      //console.log(currentTick, currentTick + wait , endingTick)

      let wait;
      if((currentTick - signTime) % beatTime != 0){
        wait =  beatTime - ((currentTick - signTime) % beatTime)
      }
      else{
       wait = 0;
      }
      
      if(currentTick + wait < endingTick){
        
        addSingleMetronomeEvent(currentTick, wait, sign)
        totalWait += wait;
        currentTick += wait;

        //current tick is now aligned with beat
        while(currentTick + beatTime < nextSignTime && currentTick + beatTime < endingTick){
          let wait = beatTime;
          addSingleMetronomeEvent(currentTick, wait, sign)
          totalWait += wait;
          currentTick += wait;
        }
      }
    }

    return totalWait;

    function addSingleMetronomeEvent(currentTick, wait, sign) {
      var beatsToGenerate = wait / ticksPerBeat
      var secondsToGenerate = beatsToGenerate / (beatsPerMinute / 60)
      var time = (secondsToGenerate * 1000 * timeWarp) || 0

      var metronomeEventsType = 'light'
      // if ((((wait + currentTick) - (sign.time * ticksPerBeat)) / ticksPerBeat) % sign.numerator == 0) {
      //   metronomeEventsType = 'heavy'
      // }
      for (const measureTime of measures) {
        //console.log(measureTime * ticksPerBeat * 4, wait + currentTick)
         if(measureTime * ticksPerBeat * 4 == wait + currentTick){
           metronomeEventsType = 'heavy'
           break;
         }
      }
     

      //console.log(currentTick, "addSingleMetronomeEvent", wait, metronomeEventsType)

      temporal.push(
        [
          {
            'ticksToEvent': wait,
            'event': {},
            'track': 16,
            'type': 'metronomeEvent',
            'metronomeEventsType': metronomeEventsType
          },
          time
        ]
      )
    }
  }
  //
  var totalTick = 0;
  var midiEvent
  var temporal = []
  ~(function processEvents () {
    function processNext () {
      if (!bpmOverride && midiEvent.event.type === 'meta' && midiEvent.event.subtype === 'setTempo') {
        // tempo change events can occur anywhere in the middle and affect events that follow
        beatsPerMinute = 60000000 / midiEvent.event.microsecondsPerBeat
      }
      // /
      var beatsToGenerate = 0
      var secondsToGenerate = 0
      var  ticksInMetronomeEvents = 0
      if (midiEvent.ticksToEvent > 0) {
        var ticksInMetronomeEvents = addMetronomeEvents(totalTick, midiEvent.ticksToEvent, temporal);
        totalTick += midiEvent.ticksToEvent;

        //console.log(midiEvent.ticksToEvent, ticksInMetronomeEvents)
        midiEvent.ticksToEvent = midiEvent.ticksToEvent - ticksInMetronomeEvents;

        //console.log(midiEvent.ticksToEvent)

        beatsToGenerate = (midiEvent.ticksToEvent) / ticksPerBeat
        secondsToGenerate = beatsToGenerate / (beatsPerMinute / 60)
      }
      // /
      var time = (secondsToGenerate * 1000 * timeWarp) || 0

      temporal.push([midiEvent, time])
      midiEvent = getNextEvent()
    }
    // /
    midiEvent = getNextEvent()
    if (midiEvent) {
      while (midiEvent) processNext(true)
    }

    //console.log(temporal);
  })()


  return {
    getData: function () {
      return clone(temporal)
    }
  }
}
