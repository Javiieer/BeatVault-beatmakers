import type { AudioAsset, Project, Stat } from '../types'
import hard808sCover from '../../assets/demo/hard-808s.png'
import darkOrchestraCover from '../../assets/demo/dark-orchestra.png'
const wave = [28,44,22,60,36,78,48,32,68,38,54,26,70,46,30,62,40,74,34,56,25,48,66,38]
export const stats: Stat[] = [{label:'Projects',value:'24',change:'+3 this month'},{label:'Beats',value:'86',change:'+12 this month'},{label:'Samples',value:'1,248',change:'+68 this month'},{label:'Favorites',value:'142',change:'+18 this month'}]
export const projects: Project[] = []
export const assets: AudioAsset[] = [
  {id:'fl-demo-pack',name:'FL Studio Demo Pack',type:'Sound Pack',productType:'sound-pack',metadata:{duration:'Unavailable',size:'Metadata only',format:'RAR (descriptive)'},tags:[{label:'bundle',tone:'violet'},{label:'demo',tone:'muted'},{label:'sound-pack',tone:'cyan'},{label:'rar',tone:'muted'}],color:'#785cf5',favorite:false,waveform:wave,cover:hard808sCover,label:'Sound Pack · Demo',collection:'FL Studio Demo Pack',licenseLabel:'Demo / local test',accessState:'included-demo',archiveFormat:'RAR',contents:[{name:'FL 808 Kick',type:'kick'},{name:'FL Basic Snare',type:'snare'},{name:'FL Basic Hat',type:'hat'},{name:'FL 808 Tom',type:'tom'}]},
  {id:'5',name:'Vocal Chop 17',type:'Vocal',productType:'sound',metadata:{bpm:110,key:'A minor',duration:'0:12',size:'3.1 MB',format:'WAV'},tags:[{label:'airy',tone:'cyan'}],color:'#db7190',favorite:true,waveform:wave,cover:darkOrchestraCover},
  {id:'6',name:'Glass Percussion',type:'FX',productType:'sound',metadata:{duration:'0:05',size:'1.2 MB',format:'AIFF'},tags:[{label:'organic',tone:'muted'}],color:'#45a8c7',favorite:false,waveform:wave.slice(4).concat(wave.slice(0,4))}
]
