import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const context=vm.createContext({});
vm.runInContext(ts.transpile(readFileSync('core.ts','utf8')+'\n'+readFileSync('generated/assets.ts','utf8')+'\nglobalThis.library={assets:ASSETS,backdrops:BACKDROPS,palettes:PALETTE_LIBRARY};',{target:ts.ScriptTarget.ES2020}),context);
const {assets,backdrops,palettes}=context.library;
const corpus=[['book'],['phone','puzzle'],['book','phone','coin'],['lamp','book','flowers'],['folder','wallet','coin'],['headphones','flowers'],['book','book','coin'],['pen','coin'],['wallet','coin','lamp'],['puzzle','book','pen'],['book','phone','coin','folder','wallet','pen'],['book','phone','coin','folder','wallet','pen','headphones','flowers']];
const formats=[[1000,1000],[1200,630],[800,1200]];
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
let serial=0;
function inline(svg){const prefix='p'+(++serial)+'_';return svg.replace(/\bid="([^"]+)"/g,(_,id)=>'id="'+prefix+id+'"').replace(/url\(#([^)]+)\)/g,(_,id)=>'url(#'+prefix+id+')').replace(/(href=")#([^"]+)/g,(_,attr,id)=>attr+'#'+prefix+id);}
function render(plan,w,h,size){
 const backdrop=backdrops.find(b=>b.size===size),scale=Math.max(w/backdrop.width,h/backdrop.height);
 const bg='<g transform="translate('+((w-backdrop.width*scale)/2)+' '+((h-backdrop.height*scale)/2)+') scale('+scale+')">'+inline(backdrop.svg)+'</g>';
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w+' '+h+'" role="img"><defs><clipPath id="canvas'+serial+'"><rect width="'+w+'" height="'+h+'"/></clipPath></defs><g clip-path="url(#canvas'+serial+')">'+bg+'</g>'+plan.placements.map(p=>{
  const asset=assets.find(a=>a.id===p.asset.id&&a.role===p.asset.role&&a.size===size);
  const m=p.transform;return '<g transform="matrix('+[m[0][0],m[1][0],m[0][1],m[1][1],m[0][2],m[1][2]].join(' ')+')"><g transform="scale('+p.scale+')">'+inline(asset.svg)+'</g></g>';
 }).join('')+'</svg>';
}
// Store each SVG once. The review renders just the currently selected comparisons.
function compact(plan){return {placements:plan.placements.map(p=>({asset:{id:p.asset.id,role:p.asset.role},transform:p.transform,scale:p.scale}))};}
const cases=[];
for(const size of ['large','small'])for(const [w,h] of formats)for(const ids of corpus){
 const main=ids.map(id=>assets.find(a=>a.id===id&&a.role==='main'&&a.size===size));
 const background=assets.filter(a=>a.role==='background');
 for(const seed of [0,1]){
  const before=context.composeZonedScene(main,background,true,w,h,'auto',seed);
  const after=context.composeScene(main,background,true,w,h,'auto',seed);
  const beforeQuality=context.compositionQuality(before,w,h);
  cases.push({size,w,h,format:w+' × '+h,seed,names:main.map(a=>a.name).join(', '),before:compact(before),after:compact(after),old:beforeQuality,quality:after.quality});
 }
}
const css='body{margin:0;padding:24px;font:14px/1.5 system-ui;background:#f3f2f7;color:#262336}h1{margin:0;font-size:24px}p{max-width:840px}select{padding:7px;margin:0 14px 12px 4px}section{background:white;padding:14px;border-radius:12px;margin:16px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}.pair svg{width:100%;height:300px;background:#fafafa}h2{font-size:15px;margin:0 0 8px}.metric{font-size:12px;color:#625d73}article{min-width:0}header{position:sticky;top:0;background:#f3f2f7;padding-bottom:8px;z-index:2}';
const html='<!doctype html><meta charset="utf-8"><title>Ochen · Приёмка 5A</title><style>'+css+'</style><header><h1>Композиции · приёмка 5A</h1><p>Слева — прежняя сборка, справа — подбор раскладки. Сравните читаемость, баланс и связность группы. Это локальные SVG из исходников; экспорт и импорт Figma проверяются отдельно.</p><label>Детализация <select id="size"><option>large</option><option>small</option></select></label><label>Формат <select id="format">'+formats.map(([w,h])=>'<option>'+w+' × '+h+'</option>').join('')+'</select></label><label>Seed <select id="seed"><option>0</option><option>1</option></select></label><label>Палитра <select id="palette">'+palettes.map(p=>'<option value="'+p.id+'">'+escape(p.name)+'</option>').join('')+'</select></label></header><main id="gallery"></main><script>const assets='+JSON.stringify(assets).replaceAll('<','\\u003c')+',backdrops='+JSON.stringify(backdrops).replaceAll('<','\\u003c')+';let serial=0;'+inline.toString()+render.toString()+';const cases='+JSON.stringify(cases).replaceAll('<','\u003c')+',palettes='+JSON.stringify(palettes)+';function draw(){const list=cases.filter(c=>c.size===document.getElementById("size").value&&c.format===document.getElementById("format").value&&c.seed===Number(document.getElementById("seed").value));const palette=palettes.find(p=>p.id===document.getElementById("palette").value),source=palettes.find(p=>p.id==="violet");function paint(svg){return svg.replace(/#[0-9a-f]{6}/gi,hex=>{const role=Object.keys(source.colors).find(k=>source.colors[k].toLowerCase()===hex.toLowerCase());return role?palette.colors[role]:hex})}document.getElementById("gallery").innerHTML=list.map(c=>"<section><h2>"+c.names+"</h2><div class=pair><article><strong>До</strong>"+paint(render(c.before,c.w,c.h,c.size))+"<p class=metric>Заполнение "+Math.round(c.old.density*100)+"%</p></article><article><strong>После</strong>"+paint(render(c.after,c.w,c.h,c.size))+"<p class=metric>Заполнение "+Math.round(c.quality.density*100)+"% · "+c.quality.candidates+" вариантов · "+c.quality.warnings.join(" ")+"</p></article></div></section>").join("")}document.querySelectorAll("select").forEach(s=>s.onchange=draw);draw();</script>';
mkdirSync('out',{recursive:true});writeFileSync('out/composition-review-5a.html',html);
writeFileSync('out/composition-review-5a.json',JSON.stringify(cases.map(({before,after,...rest})=>rest),null,2));
const contact=cases.filter(c=>c.seed===0&&['Книга','Книга, Телефон, Монета','Лампа, Книга, Цветы','Наушники, Цветы'].includes(c.names)||c.seed===0&&c.names.split(',').length>=6);
writeFileSync('out/composition-contact-5a.html','<meta charset="utf-8"><style>body{margin:0;padding:12px;background:#eee;display:grid;grid-template-columns:repeat(6,220px);gap:10px}figure{margin:0;background:white;padding:8px}svg{width:204px;height:235px}figcaption{font:11px/1.4 system-ui}</style>'+contact.map(c=>'<figure>'+render(c.after,c.w,c.h,c.size)+'<figcaption>'+escape(c.names)+'<br>'+c.size+' · '+c.format+' · '+Math.round(c.quality.density*100)+'%</figcaption></figure>').join(''));
console.log('out/composition-review-5a.html: '+cases.length+' comparisons, '+corpus.length+' sets, L/S, 3 formats, seeds 0/1.');
