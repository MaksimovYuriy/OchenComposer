import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const context=vm.createContext({});
vm.runInContext(ts.transpile(['core.ts','scene-plan.ts','semantics.ts','generated/assets.ts'].map(p=>readFileSync(p,'utf8')).join('\n')+'\nglobalThis.library={assets:ASSETS,backdrops:BACKDROPS};',{target:ts.ScriptTarget.ES2020}),context);
const {assets,backdrops}=context.library,recipe=JSON.parse(readFileSync('catalog/scene-plan.example.json','utf8'));
let index=0;
function inline(svg){const prefix='s'+(++index)+'_';return svg.replace(/\bid="([^"]+)"/g,(_,id)=>'id="'+prefix+id+'"').replace(/url\(#([^)]+)\)/g,(_,id)=>'url(#'+prefix+id+')');}
const cards=[];
for(const size of ['large','small'])for(const [width,height] of [[1000,1000],[1200,630],[800,1200]]){
 const scene=context.composeAiScene(recipe,assets.filter(a=>a.role==='main'&&a.size===size),assets.filter(a=>a.role==='background'),width,height,0,'color');
 const backdrop=backdrops.find(b=>b.size===size),factor=Math.max(width/backdrop.width,height/backdrop.height);
 const clip='canvas'+index;
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+width+' '+height+'"><defs><clipPath id="'+clip+'"><rect width="'+width+'" height="'+height+'"/></clipPath></defs><g clip-path="url(#'+clip+')"><g transform="translate('+((width-backdrop.width*factor)/2)+' '+((height-backdrop.height*factor)/2)+') scale('+factor+')">'+inline(backdrop.svg)+'</g></g>'+scene.placements.map(p=>{
 const m=p.transform;return '<g transform="matrix('+[m[0][0],m[1][0],m[0][1],m[1][1],m[0][2],m[1][2]].join(' ')+') scale('+p.scale+')">'+inline(p.asset.svg)+'</g>';
 }).join('')+'</svg>';
 cards.push('<figure>'+svg+'<figcaption>'+size+' · '+width+' × '+height+' · 3 книги, телефон на первой, монета на второй</figcaption></figure>');
}
mkdirSync('out',{recursive:true});writeFileSync('out/ai-scene-example.html','<meta charset="utf-8"><style>body{margin:0;padding:16px;font:13px system-ui;background:#eee;display:grid;grid-template-columns:repeat(3,400px);gap:14px}figure{margin:0;background:white;padding:12px}svg{width:376px;height:370px}figcaption{font-size:12px}</style>'+cards.join(''));
console.log('out/ai-scene-example.html: local fixture render; not an actual model response.');
