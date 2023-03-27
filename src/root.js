class MidiPlayer{
    API = {
        WebMidi:{
            root:this,
            enabled: true,
            get avaliable(){return this.root.WebAudio != null},
            get api(){return this.root.WebMIDI},
        },
        WebAudio:{
            root:this,
            enabled: true,
            get avaliable(){return this.root.WebAudio != null},
            get api(){return this.root.WebAudio},
        },
        AudioTag:{
            root:this,
            enabled: true,
            get avaliable(){return this.AudioTag != null},
            get api(){return this.root.AudioTag},
            
        }
    }

    setController = (event, channel, type, value, delay) => {
        for (const apiName in this.API) {
            var api = this.API[apiName];
            if(api.enabled && api.avaliable){
                api.api.setController(event, channel, type, value, delay)
            }
        }
    }

    programChange = (event, channel, program, delay)  => { // change patch (instrument)
        for (const apiName in this.API) {
            var api = this.API[apiName];
            if(api.enabled && api.avaliable){
                api.api.programChange(event, channel, program, delay)
            }
        }
    }

    pitchBend = (event, channel, program, delay)  => { // pitch bend
        for (const apiName in this.API) {
            var api = this.API[apiName];
            
            if(api.enabled && api.avaliable){
                api.api.pitchBend(event, channel, program, delay)
            }
        }
    }

    noteOn = (event,channel, note, velocity, delay)  => {
        for (const apiName in this.API) {
            var api = this.API[apiName];
            console.log(api, api.enabled, api.avaliable)
            if(api.enabled && api.avaliable){
                api.api.noteOn(event,channel, note, velocity, delay)
            }
        }
    }
    noteOff = (event, channel, note, delay)  => {
        for (const apiName in this.API) {
            var api = this.API[apiName];
            if(api.enabled && api.avaliable){
                api.api.noteOff(event, channel, note, delay)
            }
        }
    }

    stopAllNotes = (lookAhead)  => {
        for (const apiName in this.API) {
            var api = this.API[apiName];
            console.log(api, api.enabled, api.avaliable)
            if(api.enabled && api.avaliable){
                api.api.stopAllNotes(lookAhead)
            }
        }
    }
}

export default  new MidiPlayer();
