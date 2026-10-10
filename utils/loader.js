import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginsPath = path.join(__dirname, "../plugins");

const COLORS={reset:"\x1b[0m",
    red:"\x1b[38;5;196m",
    orange:"\x1b[38;5;208m",
    gold:"\x1b[38;5;220m",
    green:"\x1b[38;5;46m",
    cyan:"\x1b[38;5;51m",
    blue:"\x1b[38;5;39m",
    purple:"\x1b[38;5;93m",
    gray:"\x1b[38;5;245m"};
const WATCH_DEBOUNCE=700;
let pluginsCache=null, loadingPromise=null, watchers=[], watchTimer=null, watchCallback=null, watcherStarted=false;

function ensurePluginsDirectory(){try{fs.mkdirSync(pluginsPath,{recursive:true});
    return true}catch(e){console.error("❌ Plugins Directory Error:",e?.message||e);
    return false}}
function getPluginFiles(){
  if(!ensurePluginsDirectory())return [];
  const out=[];
  const walk=(dir)=>{
    let entries=[]; try{entries=fs.readdirSync(dir,{withFileTypes:true})}catch{return}
    for(const e of entries){
      if(e.name.startsWith("."))continue;
      const full=path.join(dir,e.name);
      if(e.isDirectory()) walk(full);
      else if(e.isFile()&&e.name.endsWith(".js")) out.push(path.relative(pluginsPath,full));
    }
  };
  walk(pluginsPath);
  return out.sort();
}
async function importPlugin(file){
  const filePath=path.join(pluginsPath,file);
  try{
    const module=await import(`${pathToFileURL(filePath).href}?update=${Date.now()}`);
    const plugin=module?.default;
    if(!plugin||typeof plugin!=="object")return null;
    return plugin;
  }catch(error){console.log(`${COLORS.red}❌ ERROR IN PLUGIN [${file}]:${COLORS.reset} ${String(error?.message||error).slice(0,220)}`);
      return null}
}
export async function loadPlugins(sock){
  if(pluginsCache)return pluginsCache;
  if(loadingPromise)return loadingPromise;
  loadingPromise=(async()=>{
    try{
      const files=getPluginFiles();
      console.log(`\n${COLORS.purple}╔═══════════════════════════════════════════════╗\n${COLORS.gold}║        👑 ARTHUR PLUGIN ENGINE 👑            ║\n${COLORS.purple}╠═══════════════════════════════════════════════╣\n${COLORS.cyan}║ 📦 FILES   : ${String(files.length).padEnd(35)}║\n${COLORS.purple}╚═══════════════════════════════════════════════╝${COLORS.reset}`);
      const results=await Promise.all(files.map(async file=>({file,plugin:await importPlugin(file)})));
      pluginsCache=results.filter(x=>x.plugin).map(x=>x.plugin);
      for(const x of results)if(x.plugin)console.log(`${COLORS.green}✅${COLORS.reset} ${x.file}`);
      console.log(`${COLORS.green}👑 ARTHUR: ${pluginsCache.length} plugins loaded${COLORS.reset}`);
      return pluginsCache;
    }catch(e){console.error("❌ Plugin Loader Fatal Error:",e?.message||e);pluginsCache=[];return pluginsCache}
    finally{loadingPromise=null}
  })();
  return loadingPromise;
}
export function invalidatePluginCache(){pluginsCache=null;loadingPromise=null}
export function clearPluginsCache(){invalidatePluginCache()}
export async function reloadPlugins(sock){invalidatePluginCache();return loadPlugins(sock)}

function watchDirectory(dir){
  try{
    const w=fs.watch(dir,{persistent:false},(eventType,filename)=>{
      if(!filename)return;
      if(watchTimer)clearTimeout(watchTimer);
      watchTimer=setTimeout(async()=>{
        watchTimer=null;invalidatePluginCache();
        if(typeof watchCallback==="function")try{await watchCallback()}catch{}
      },WATCH_DEBOUNCE);
    });
    watchers.push(w);
    let entries=[];try{entries=fs.readdirSync(dir,{withFileTypes:true})}catch{return}
    for(const e of entries)if(e.isDirectory()&&!e.name.startsWith("."))watchDirectory(path.join(dir,e.name));
  }catch{}
}
export function watchPlugins(onChangeCallback){
  if(watcherStarted)return watchers;
  ensurePluginsDirectory();watchCallback=typeof onChangeCallback==="function"?onChangeCallback:null;
  watchDirectory(pluginsPath);watcherStarted=true;return watchers;
}
export function stopPluginWatcher(){for(const w of watchers)try{w.close()}catch{}watchers=[];watcherStarted=false}
export function getPluginFilesList(){return getPluginFiles()}
