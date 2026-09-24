#!/usr/bin/env node
// Local static preview with the same isolation required by threaded browser QEMU.
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
let port=63820, directory=resolve('web'), build=false;
const args=process.argv.slice(2);
for(let i=0;i<args.length;i++) {
  if(args[i]==='--port') port=Number(args[++i]);
  else if(args[i]==='--root') directory=resolve(args[++i]);
  else if(args[i]==='--build') build=true;
  else throw Error('Usage: node tools/serve-web.mjs [--root web|dist] [--port 63820] [--build]');
}
if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid port');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8'};
const server=createServer(async(req,res)=>{
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','no-cache');
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  try {
    const url=new URL(req.url,'http://localhost');
    let name=decodeURIComponent(url.pathname),base=directory;
    if(name.includes('\0'))throw Error('Invalid path');
    if(build&&name.startsWith('/build/')){base=resolve('build');name=name.slice(6);}
    if(name.endsWith('/'))name+='index.html';
    const path=resolve(base,'.'+name);
    if(!path.startsWith(base+sep)){res.writeHead(403);res.end('Forbidden');return;}
    const info=await stat(path);
    if(!info.isFile())throw Error('Not a file');
    res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Content-Length':info.size});
    if(req.method==='HEAD'){res.end();return;}
    createReadStream(path).on('error',()=>res.destroy()).pipe(res);
  } catch {res.writeHead(404);res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Browser Turtles preview: http://127.0.0.1:${server.address().port}/ (${directory})`));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close();server.closeAllConnections();});
