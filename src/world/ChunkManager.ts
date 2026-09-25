import * as THREE from 'three'
import type { ChunkData } from '../workers/world.worker'

const CHUNK_SIZE = 24
const VIEW_DIST = 3 // chunks radius, small for test like MD §35

export class ChunkManager {
  private worker: Worker
  private scene: THREE.Scene
  private chunks = new Map<string, THREE.Group>()
  private pending = new Set<string>()
  private lastWorkerMs = 0
  private seed = 1337
  private materials: Record<string, THREE.Material>

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.materials = {
      flat_ground: new THREE.MeshStandardMaterial({ color: 0x8b8378, roughness: 0.95 }),
      mud: new THREE.MeshStandardMaterial({ color: 0x6b5d4f, roughness: 0.98 }),
      crater_field: new THREE.MeshStandardMaterial({ color: 0x7a6e5d, roughness: 0.96 }),
      destroyed_ground: new THREE.MeshStandardMaterial({ color: 0x9a9184, roughness: 0.9 }),
      crater: new THREE.MeshStandardMaterial({ color: 0x5a5042, roughness: 1 }),
      trench_straight: new THREE.MeshStandardMaterial({ color: 0x4a3f32, roughness: 0.95 }),
    }
    this.worker = new Worker(new URL('../workers/world.worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (e: MessageEvent<any>) => {
      if (e.data.type==='chunk') {
        this.lastWorkerMs = e.data.genMs
        this.buildChunk(e.data as ChunkData)
        this.pending.delete(`${e.data.cx},${e.data.cz}`)
      }
    }
  }

  update(playerPos: THREE.Vector3) {
    const pcx = Math.floor(playerPos.x / CHUNK_SIZE)
    const pcz = Math.floor(playerPos.z / CHUNK_SIZE)
    for(let dx=-VIEW_DIST; dx<=VIEW_DIST; dx++) for(let dz=-VIEW_DIST; dz<=VIEW_DIST; dz++){
      const cx=pcx+dx, cz=pcz+dz
      const key=`${cx},${cz}`
      if(!this.chunks.has(key) && !this.pending.has(key)){
        this.pending.add(key)
        this.worker.postMessage({ type:'gen', cx, cz, seed:this.seed })
      }
    }
    // unload far chunks (> VIEW_DIST+1)
    for(const [key, group] of this.chunks){
      const [cx, cz] = key.split(',').map(Number)
      if(Math.abs(cx-pcx)>VIEW_DIST+1 || Math.abs(cz-pcz)>VIEW_DIST+1){
        this.scene.remove(group)
        this.chunks.delete(key)
      }
    }
  }

  private buildChunk(data: ChunkData){
    const group = new THREE.Group()
    group.name = `chunk_${data.cx}_${data.cz}`
    for(const m of data.modules){
      let mesh: THREE.Mesh
      if(m.type==='crater'){
        const g = new THREE.CircleGeometry(2.2*m.scale, 20)
        g.rotateX(-Math.PI/2)
        mesh = new THREE.Mesh(g, this.materials[m.type])
        mesh.position.set(m.x, 0.02, m.z)
        mesh.rotation.y = m.rot
      } else if(m.type==='trench_straight'){
        const g = new THREE.BoxGeometry(3, 0.6, 10)
        mesh = new THREE.Mesh(g, this.materials[m.type])
        mesh.position.set(m.x, 0.12, m.z)
        mesh.rotation.y = m.rot
        const edge = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 10.2), new THREE.MeshStandardMaterial({color:0x8c7c5a}))
        edge.position.copy(mesh.position); edge.position.y+=0.45; edge.rotation.y=m.rot
        group.add(edge)
        // duckboards line
        const db = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 9.6), new THREE.MeshStandardMaterial({color:0x6e5a3a}))
        db.rotation.x=-Math.PI/2; db.rotation.z=m.rot; db.position.set(m.x, 0.03, m.z)
        group.add(db)
      } else {
        const g = new THREE.PlaneGeometry(6,6)
        mesh = new THREE.Mesh(g, this.materials[m.type]!)
        mesh.rotation.x=-Math.PI/2
        mesh.position.set(m.x, 0, m.z)
        mesh.rotation.z = m.rot
      }
      mesh.receiveShadow=false
      group.add(mesh)
    }
    this.scene.add(group)
    this.chunks.set(`${data.cx},${data.cz}`, group)
  }

  getStats(){ return { loaded: this.chunks.size, active: this.chunks.size, lastWorkerMs: this.lastWorkerMs } }
}
