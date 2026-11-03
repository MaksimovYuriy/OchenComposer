import {mkdir,readFile,writeFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {readSource} from './sources.mjs';

const context=vm.createContext({});
vm.runInContext(ts.transpile(['composition','paletteModel','scene','ai','generated/assets.ts'].map(readSource).join('\n')+'\nglobalThis.library={assets:ASSETS,backdrops:BACKDROPS,palettes:PALETTE_LIBRARY};',{target:ts.ScriptTarget.ES2020}),context);
const {assets,backdrops,palettes}=context.library;
const guide=JSON.parse(await readFile(new URL('../catalog/ai-composition-rules.json',import.meta.url),'utf8'));
const cases=[
 {file:'01-learning.svg',title:'Знания и связь',ids:['book','phone','coin'],width:1000,height:1000,size:'large',palette:'violet',mode:'names',description:'Сборка по названиям: книга, телефон, монета. L, квадрат, фиолетовая схема.'},
 {file:'02-growth.svg',title:'Идеи и развитие',ids:['lamp','book','flowers'],width:800,height:1200,size:'small',palette:'orange',mode:'names',description:'Сборка по названиям: лампа, книга, цветы. S, вертикальный формат, оранжевая схема.'},
 {file:'03-dialogue.svg',title:'Идея между знаниями',width:1200,height:630,size:'large',palette:'turquoise',mode:'prepared-plan',description:'Локальное исполнение подготовленного JSON-плана: две книги с наклоном к центру и лампа между ними. Это пример формата ответа ИИ, не сохранённый ответ реального API.',recipe:guide.examples[0].plan},
];
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const original=palettes.find(p=>p.id==='violet');
let serial=0;
function sourceSvg(svg,palette){
 const prefix='source_'+(++serial)+'_';
 return svg.replace(/\bid="([^"]+)"/g,(_,id)=>'id="'+prefix+id+'"')
  .replace(/url\(#([^\)]+)\)/g,(_,id)=>'url(#'+prefix+id+')')
  .replace(/((?:xlink:)?href=")#([^"]+)/g,(_,attribute,id)=>attribute+'#'+prefix+id)
  .replace(/\b(fill|stroke|stop-color|flood-color|color)=(['"])(#[0-9a-f]{6})\2/gi,(_,attribute,quote,color)=>{
   const role=Object.keys(original.colors).find(key=>original.colors[key].toLowerCase()===color.toLowerCase());
   return attribute+'='+quote+(role?palette.colors[role]:color)+quote;
  });
}
const manifest=[];
await mkdir(new URL('../examples/',import.meta.url),{recursive:true});
for(const sample of cases){
 const main=assets.filter(a=>a.role==='main'&&a.size===sample.size),background=assets.filter(a=>a.role==='background');
 const plan=sample.recipe?context.composeAiScene(sample.recipe,main,background,sample.width,sample.height,0,'color'):context.composeScene(sample.ids.map(id=>main.find(a=>a.id===id)),background,false,sample.width,sample.height,'auto',0);
 const palette=palettes.find(p=>p.id===sample.palette),backdrop=backdrops.find(b=>b.size===sample.size);
 const scale=Math.max(sample.width/backdrop.width,sample.height/backdrop.height);
 const groups=plan.placements.map((p,index)=>({id:'ochen_item_'+String(index+1).padStart(4,'0'),name:p.asset.name,assetId:p.asset.id,state:p.asset.role}));
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+sample.width+'" height="'+sample.height+'" viewBox="0 0 '+sample.width+' '+sample.height+'"><title>'+escape(sample.title)+'</title><desc>'+escape(sample.description)+'</desc><defs><clipPath id="canvas_clip"><rect width="'+sample.width+'" height="'+sample.height+'"/></clipPath></defs><g clip-path="url(#canvas_clip)"><g transform="translate('+((sample.width-backdrop.width*scale)/2)+' '+((sample.height-backdrop.height*scale)/2)+') scale('+scale+')">'+sourceSvg(backdrop.svg,palette)+'</g></g>'+plan.placements.map((p,i)=>{
  const m=p.transform;return '<g id="'+groups[i].id+'" aria-label="'+escape(p.asset.name)+'" transform="matrix('+[m[0][0],m[1][0],m[0][1],m[1][1],m[0][2],m[1][2]].join(' ')+') scale('+p.scale+')"><title>'+escape(p.asset.name)+'</title>'+sourceSvg(p.asset.svg,palette)+'</g>';
 }).join('')+'</svg>\n';
 await writeFile(new URL('../examples/'+sample.file,import.meta.url),svg);
 manifest.push({file:sample.file,title:sample.title,description:sample.description,width:sample.width,height:sample.height,size:sample.size,palette:sample.palette,mode:sample.mode,seed:0,groups,sources:plan.placements.map(p=>p.asset.source)});
}
await writeFile(new URL('../examples/manifest.json',import.meta.url),JSON.stringify({generator:'scripts/submission-examples.mjs',note:'Локальные SVG на исходных элементах; не являются доказательством экспорта или обратного импорта в Figma и не используют живой API.',examples:manifest},null,2)+'\n');
await writeFile(new URL('../examples/index.html',import.meta.url),'<!doctype html><html lang="ru"><meta charset="utf-8"><title>Ochen Composer — примеры</title><style>body{margin:24px;font:15px/1.5 system-ui;color:#252535;background:#f4f3f8}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:20px}article{padding:16px;border-radius:12px;background:white}img{width:100%;height:320px;object-fit:contain}h1{font-size:26px}h2{font-size:18px}p{max-width:1000px}</style><h1>Ochen Composer · три векторные композиции</h1><p>Исходники SVG и готовые планы собираются тем же движком, что используется в плагине. Это локальные примеры, без обращения к API. Для проверки двух живых сценариев запустите плагин по README.</p><main>'+manifest.map(s=>'<article><h2>'+escape(s.title)+'</h2><img alt="'+escape(s.title)+'" src="'+s.file+'"><p>'+escape(s.description)+'</p><a href="'+s.file+'" download>Скачать SVG</a></article>').join('')+'</main></html>');
console.log('Prepared 3 standalone vector compositions in examples/.');
