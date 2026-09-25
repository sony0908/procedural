export class PerformanceMonitor {
  private frames = 0
  private lastFpsTime = performance.now()
  private fps = 0
  private frameTime = 0
  private el: HTMLElement
  constructor(el: HTMLElement) { this.el = el }
  beginFrame() {}
  endFrame(dt: number, info: { drawCalls:number, triangles:number, chunksLoaded:number, chunksActive:number, workerMs:number }) {
    this.frames++
    this.frameTime = dt * 1000
    const now = performance.now()
    if (now - this.lastFpsTime > 500) {
      this.fps = Math.round(this.frames * 1000 / (now - this.lastFpsTime))
      this.frames = 0
      this.lastFpsTime = now
    }
    this.el.innerHTML = `FPS: <b>${this.fps}</b> &nbsp; FRAME: <b>${this.frameTime.toFixed(1)}ms</b><br>`+
      `DRAW: <b>${info.drawCalls}</b> &nbsp; TRIS: <b>${(info.triangles/1000).toFixed(0)}K</b><br>`+
      `CHUNKS loaded:<b>${info.chunksLoaded}</b> active:<b>${info.chunksActive}</b><br>`+
      `WORKER: <b>${info.workerMs.toFixed(1)}ms</b>`
  }
}
