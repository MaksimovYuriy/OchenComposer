import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Real DOMParser coverage: no replacement XML parser in the Node tests.
const html=readFileSync('ui.html','utf8');
const validator=html.slice(html.indexOf('function validateSvgExport('),html.indexOf("el('tab-build').onclick"));
const checks=`
const base={width:100,height:80,groups:[{id:'ochen_item_0001',name:'Book & coin'}]};
const good='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><defs><linearGradient id="paint"><stop stop-color="#abcdef"/></linearGradient><clipPath id="clip"><rect width="100" height="80"/></clipPath></defs><g id="ochen_item_0001" transform="rotate(8 50 40)" clip-path="url(#clip)"><path fill="url(#paint)" d="M0 0h20v20z"/></g></svg>';
const results=[];
function check(name,svg,accept){let output,error;try{output=validateSvgExport({...base,svg})}catch(e){error=e}if(accept&&error)throw error;if(!accept&&!error)throw new Error(name+': unexpected acceptance');if(accept&&!output.includes('rotate(8 50 40)'))throw new Error('Transform lost');results.push(name+': PASS')}
check('vector groups, gradient, clipping and transform',good,true);
for(const [name,svg] of [
 ['raster',good.replace('<path','<image href="data:image/png;base64,AA"/><path')],
 ['external',good.replace('url(#paint)','url(https://example.com/p)')],
 ['missing reference',good.replace('url(#clip)','url(#absent)')],
 ['missing group',good.replace('ochen_item_0001','other')],
 ['duplicate id',good.replace('<path','<g id="paint"/><path')],
 ['wrong size',good.replace('100 80','200 80')],
 ['invalid XML',good.slice(0,-6)],
 ['event attribute',good.replace('<path','<path onclick="x()"')],
 ['DOCTYPE','<!DOCTYPE svg>'+good]
])check(name,svg,false);
document.getElementById('results').textContent=JSON.stringify(results);
`;
// Failure must produce a visible marker instead of a misleading empty success.
const harness='<meta charset="utf-8"><pre id="results">FAILED</pre><script>'+validator+'\ntry{'+checks+'}catch(e){document.getElementById("results").textContent="FAILED: "+e.message}</script>';
mkdirSync('out',{recursive:true});writeFileSync('out/svg-export-check.html',harness);
const browser=process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const run=spawnSync(browser,['--headless','--no-sandbox','--in-process-gpu','--disable-gpu','--no-first-run','--virtual-time-budget=3000','--user-data-dir='+resolve('out/svg-check-profile-'+Date.now()),'--dump-dom',pathToFileURL(resolve('out/svg-export-check.html')).href],{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
if(run.error)throw run.error;
const result=run.stdout.match(/<pre id="results">([\s\S]*?)<\/pre>/)?.[1];
if(run.status!==0||!result||result.includes('FAILED'))throw new Error(result||run.stderr);
console.log(result);
