// Simple deterministic modular terrain generator (runs off main thread)
export type ChunkData = {
  cx:number, cz:number,
  modules: { type:string, x:number, z:number, rot:number, scale:number }[],
  seed:number
}
function mulberry32(a:number){return function(){let t=a+=0x6D2B79F5; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296;}}
function hash2(x:number,z:number,seed:number){ const r=mulberry32((x*73856093 ^ z*19349663 ^ seed)>>>0); return r(); }

self.onmessage = (e: MessageEvent<{type:string, cx:number, cz:number, seed:number}>)=>{
  const t0 = performance.now()
  const { type, cx, cz, seed } = e.data
  if(type!=='gen') return
  // Chunk 24x24m, generate modules: ground tiles, crater, trench stub
  const modules: ChunkData['modules']=[]
  const chunkSize=24
  const baseX=cx*chunkSize, baseZ=cz*chunkSize
  const r = hash2(cx,cz,seed)
  // decide biome placeholder
  const craterCount = r>0.82 ? 1 : 0
  const trench = hash2(cx+99,cz+31,seed) > 0.72
  // ground tiles 4x4 per chunk (6m each)
  for(let ix=0;ix<4;ix++) for(let iz=0;iz<4;iz++){
    const x=baseX+ix*6+3, z=baseZ+iz*6+3
    const v=hash2(cx*4+ix, cz*4+iz, seed+1)
    let type='flat_ground'
    if(v>0.88) type='crater_field'
    else if(v>0.74) type='mud'
    else if(v>0.62) type='destroyed_ground'
    modules.push({ type, x, z, rot: Math.floor(v*4)*Math.PI/2, scale: 1 })
  }
  if(craterCount){
    const x=baseX+12+(hash2(cx,cz,seed+2)-0.5)*10
    const z=baseZ+12+(hash2(cx+1,cz+1,seed+3)-0.5)*10
    modules.push({ type:'crater', x, z, rot: hash2(cx,cz,seed+9)*Math.PI*2, scale: 0.9+hash2(cx,cz,seed+10)*0.6 })
  }
  if(trench){
    const x=baseX+12, z=baseZ+12
    modules.push({ type:'trench_straight', x, z, rot: hash2(cx,cz,seed+11)>0.5?0:Math.PI/2, scale:1 })
  }
  const t1=performance.now()
  ;(self as any).postMessage({ type:'chunk', cx, cz, modules, seed, genMs: t1-t0 })
}
