import * as THREE from 'three'

// MD §2 game-feel pipeline: INPUT -> TARGET_DIR -> TARGET_SPEED -> ACCEL/DECEL -> VELOCITY -> MOVEMENT -> ROTATION -> CAMERA
export class FPSController {
  yaw=0; pitch=0
  pos = new THREE.Vector3(0,1.7,12)
  vel = new THREE.Vector3()
  targetVel = new THREE.Vector3()
  keys = new Set<string>()
  mouseDown=false
  // tuning like summer-afternoon feel
  accel=18
  decel=22
  maxWalk=4.3
  maxRun=7.0
  constructor(private camera: THREE.PerspectiveCamera){
    addEventListener('keydown', e=>{
      if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(e.code)){
        if(e.code.startsWith('Arrow')||e.code.startsWith('Shift')||e.code.startsWith('Key')) e.preventDefault()
        this.keys.add(e.code)
      }
    })
    addEventListener('keyup', e=>{ this.keys.delete(e.code) })
    addEventListener('blur', ()=>this.keys.clear())
    addEventListener('mousedown', e=>{ if(e.button===0) this.mouseDown=true })
    addEventListener('mouseup', e=>{ if(e.button===0) this.mouseDown=false })
    addEventListener('mousemove', e=>{
      if(document.pointerLockElement){
        this.yaw -= e.movementX*0.0022
        this.pitch = Math.max(-1.25, Math.min(1.25, this.pitch - e.movementY*0.0022))
      }
    })
  }

  update(dt:number, canMove:(from:THREE.Vector3,to:THREE.Vector3)=>boolean){
    const fwd=new THREE.Vector3(-Math.sin(this.yaw),0,-Math.cos(this.yaw))
    const right=new THREE.Vector3(Math.cos(this.yaw),0,-Math.sin(this.yaw))
    const input=new THREE.Vector3()
    if(this.keys.has('KeyW')||this.keys.has('ArrowUp')) input.add(fwd)
    if(this.keys.has('KeyS')||this.keys.has('ArrowDown')) input.sub(fwd)
    if(this.keys.has('KeyA')||this.keys.has('ArrowLeft')) input.sub(right)
    if(this.keys.has('KeyD')||this.keys.has('ArrowRight')) input.add(right)
    const sprint=this.keys.has('ShiftLeft')||this.keys.has('ShiftRight')
    const max = sprint? this.maxRun : this.maxWalk
    if(input.lengthSq()>0){
      input.normalize().multiplyScalar(max)
      this.targetVel.copy(input)
    } else {
      this.targetVel.set(0,0,0)
    }
    // accel / decel smoothing
    const lerp = (a:number,b:number,t:number)=> a + (b-a)*t
    const ax = this.targetVel.length()>0.01 ? this.accel : this.decel
    const t = 1 - Math.exp(-ax*dt)
    this.vel.x = lerp(this.vel.x, this.targetVel.x, t)
    this.vel.z = lerp(this.vel.z, this.targetVel.z, t)

    const next = this.pos.clone()
    const stepX = this.pos.clone(); stepX.x += this.vel.x*dt
    if(canMove(this.pos, stepX)) next.x = stepX.x; else this.vel.x*=0.2
    const stepZ = this.pos.clone(); stepZ.z += this.vel.z*dt
    if(canMove(this.pos, stepZ)) next.z = stepZ.z; else this.vel.z*=0.2
    // keep height
    next.y = 1.7
    this.pos.copy(next)
    // camera follow exactly player head + pitch/yaw
    this.camera.position.copy(this.pos)
    this.camera.rotation.order='YXZ'
    this.camera.rotation.y=this.yaw
    this.camera.rotation.x=this.pitch
  }
  isMoving(){ return this.vel.length()>0.2 }
  isSprinting(){ return this.isMoving() && (this.keys.has('ShiftLeft')||this.keys.has('ShiftRight')) }
}
