import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from '@playwright/test'

const fragment = `
precision mediump float;
uniform vec2 resolution;
uniform float phase;
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) {
  vec2 i=floor(p),f=fract(p);
  f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
}
float fbm(vec2 p) {
  return .57*noise(p)+.28*noise(p*2.03+3.7)+.15*noise(p*4.01+9.2);
}
void main() {
  vec2 uv=gl_FragCoord.xy/resolution;
  vec2 p=uv*vec2(2.0,1.5);
  vec2 drift=vec2(cos(phase),sin(phase))*.32;
  vec2 warp=vec2(fbm(p+drift),fbm(p+vec2(4.3,1.2)-drift));
  float flow=fbm(p+warp*2.5+drift*.4);
  float ridge=sin(uv.x*5.5+uv.y*2.0+flow*7.0);
  float silver=smoothstep(-.6,.9,ridge);
  float light=.025+pow(silver,1.8)*(.16+.20*smoothstep(.2,.8,flow));
  light*=.68+.32*smoothstep(0.,.65,distance(uv,vec2(.48,.55)));
  gl_FragColor=vec4(vec3(light+(hash(gl_FragCoord.xy)-.5)*.024),1.);
}`

const output = path.resolve(import.meta.dirname, '../public/brand/hero')
const temporary = await mkdtemp(path.join(tmpdir(), 'aircastle-hero-'))
const browser = await chromium.launch()
let encoder
try {
  const page = await browser.newPage()
  await page.setContent('<canvas width="960" height="600"></canvas>')
  await page.evaluate((source) => {
    const canvas = document.querySelector('canvas')
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true })
    if (!gl) throw new Error('Hero generation requires WebGL')
    const compile = (type, code) => {
      const shader = gl.createShader(type)
      gl.shaderSource(shader, code)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader))
      return shader
    }
    const program = gl.createProgram()
    gl.attachShader(
      program,
      compile(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'),
    )
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, source))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program))
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    )
    const position = gl.getAttribLocation(program, 'p')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    gl.uniform2f(gl.getUniformLocation(program, 'resolution'), canvas.width, canvas.height)
    gl.viewport(0, 0, canvas.width, canvas.height)
    window.renderMesh = (phase) => {
      gl.uniform1f(gl.getUniformLocation(program, 'phase'), phase)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      return canvas.toDataURL('image/png').split(',')[1]
    }
  }, fragment)
  encoder = spawn(
    'ffmpeg',
    [
      '-loglevel',
      'error',
      '-y',
      '-f',
      'image2pipe',
      '-framerate',
      '24',
      '-i',
      'pipe:0',
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'slow',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      path.join(temporary, 'mesh.mp4'),
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  )
  const finished = once(encoder, 'close')
  for (let frame = 0; frame < 384; frame++) {
    const png = Buffer.from(
      await page.evaluate((phase) => window.renderMesh(phase), (frame / 384) * Math.PI * 2),
      'base64',
    )
    if (!frame) await writeFile(path.join(temporary, 'mesh.png'), png)
    if (!encoder.stdin.write(png)) await once(encoder.stdin, 'drain')
  }
  encoder.stdin.end()
  const [code] = await finished
  if (code !== 0) throw new Error(`Hero encoder exited ${code}`)
  await mkdir(output, { recursive: true })
  for (const name of ['mesh.mp4', 'mesh.png'])
    await rename(path.join(temporary, name), path.join(output, name))
  console.log(`Generated monochrome hero in ${output}`)
} finally {
  encoder?.kill()
  await browser.close()
  await rm(temporary, { recursive: true, force: true })
}
