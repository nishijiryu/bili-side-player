import type {AppState,Playlist,Track} from './types';
const KEY='biliPlaylistState';
const now=()=>new Date().toISOString();
export function defaults():AppState{const id=crypto.randomUUID();return{schemaVersion:1,playlists:[{id,name:'我的歌单',tracks:[],createdAt:now(),updatedAt:now()}],currentPlaylistId:id,settings:{playMode:'sequential',autoplay:true,volume:1,muted:false}}}
export function validateState(v:unknown):AppState|null{if(!v||typeof v!=='object')return null;const x=v as any;if(x.schemaVersion!==1||!Array.isArray(x.playlists)||!x.playlists.length||!x.playlists.every(validPlaylist))return null;if(!x.playlists.some((p:Playlist)=>p.id===x.currentPlaylistId))return null;if(!x.settings||!['sequential','loop-list','loop-one','shuffle'].includes(x.settings.playMode)||typeof x.settings.autoplay!=='boolean'||typeof x.settings.volume!=='number'||x.settings.volume<0||x.settings.volume>1||typeof x.settings.muted!=='boolean')return null;return x as AppState;}
function validPlaylist(p:any){return p&&typeof p.id==='string'&&typeof p.name==='string'&&Array.isArray(p.tracks)&&p.tracks.every((t:any)=>typeof t.id==='string'&&typeof t.bvidOrAid==='string'&&typeof t.url==='string'&&typeof t.title==='string');}
export async function loadState(){const raw=(await chrome.storage.local.get(KEY))[KEY];return validateState(raw)??defaults();}
export async function saveState(s:AppState){if(!validateState(s))throw new Error('拒绝保存无效数据');await chrome.storage.local.set({[KEY]:s});}
export function importPlaylists(raw:string):Playlist[]{const x=JSON.parse(raw);const list=Array.isArray(x)?x:x.playlists;if(!Array.isArray(list)||!list.length||!list.every(validPlaylist))throw new Error('备份结构或字段无效');return list.map((p:any)=>({...p,id:crypto.randomUUID(),name:`${p.name}（导入）`,tracks:p.tracks.map((t:Track)=>({...t,id:crypto.randomUUID()})),createdAt:now(),updatedAt:now()}));}
export {KEY};
