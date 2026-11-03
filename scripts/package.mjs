import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
for(const script of ['build.mjs','submission-examples.mjs'])execFileSync(process.execPath,[fileURLToPath(new URL(script,import.meta.url))],{cwd:root,stdio:'inherit'});
const files=['manifest.json','code.js','ui.html','README.md','package.json','package-lock.json','tsconfig.json','eslint.config.js','.gitignore'];
const allowed={src:new Set(['ts','js','css','html']),assets:new Set(['svg']),catalog:new Set(['json','md']),docs:new Set(['md']),scripts:new Set(['mjs']),tests:new Set(['mjs']),examples:new Set(['svg','json','html'])};
async function collect(directory,extensions){
 for(const entry of await readdir(new URL('../'+directory+'/',import.meta.url),{withFileTypes:true})){
  if(entry.isSymbolicLink())throw new Error('Symlinks are not permitted in the review archive: '+directory+'/'+entry.name);
  const path=directory+'/'+entry.name;
  if(entry.isDirectory())await collect(path,extensions);
  else if(extensions.has(entry.name.split('.').at(-1)))files.push(path);
 }
}
for(const [directory,extensions] of Object.entries(allowed))await collect(directory,extensions);
// Portable ZIP (stored entries), without external archivers or extra dependencies.
const table=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0});
function crc32(data){let n=0xffffffff;for(const byte of data)n=table[(n^byte)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
const local=[],central=[],inventory=[];let offset=0;
for(const path of [...new Set(files)].sort()){
 const data=await readFile(new URL('../'+path,import.meta.url));
 if(/sk-or-v1-[a-z0-9]{32,}/i.test(data.toString('utf8')))throw new Error('Possible API key detected; archive not written. File: '+path);
 const name=Buffer.from('OchenComposer/'+path,'utf8'),crc=crc32(data);
 const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(33,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(name.length,26);
 local.push(header,name,data);
 const record=Buffer.alloc(46);record.writeUInt32LE(0x02014b50);record.writeUInt16LE(20,4);record.writeUInt16LE(20,6);record.writeUInt16LE(0x800,8);record.writeUInt16LE(33,14);record.writeUInt32LE(crc,16);record.writeUInt32LE(data.length,20);record.writeUInt32LE(data.length,24);record.writeUInt16LE(name.length,28);record.writeUInt32LE(offset,42);central.push(record,name);
 offset+=header.length+name.length+data.length;
 inventory.push({path,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
}
const index=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(inventory.length,8);end.writeUInt16LE(inventory.length,10);end.writeUInt32LE(index.length,12);end.writeUInt32LE(offset,16);
await mkdir(new URL('../dist/',import.meta.url),{recursive:true});
const archive=Buffer.concat([...local,index,end]);
await writeFile(new URL('../dist/OchenComposer-review.zip',import.meta.url),archive);
await writeFile(new URL('../dist/package-manifest.json',import.meta.url),JSON.stringify({archive:'OchenComposer-review.zip',sha256:createHash('sha256').update(archive).digest('hex'),files:inventory},null,2)+'\n');
console.log('dist/OchenComposer-review.zip: '+inventory.length+' files, '+archive.length+' bytes. No node_modules, .git, out, dist or user credentials.');
