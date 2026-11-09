const vertexSource = `
  attribute vec2 position;
  varying vec2 uv;
  void main() {
    uv = position * .5 + .5;
    gl_Position = vec4(position, 0., 1.);
  }
`

const fragmentSource = `
  precision mediump float;
  varying vec2 uv;
  uniform sampler2D image;
  uniform vec2 resolution;
  uniform vec2 imageSize;
  uniform float progress;

  void main() {
    vec2 aspect = resolution / min(resolution.x, resolution.y);
    vec2 point = (uv - vec2(.49, .48)) * aspect;
    float distance = length(point);
    float angle = atan(point.y, point.x);
    float travel = pow(progress, .72);
    float radius = travel * length(aspect) * .63;
    float energy = (1. - progress) * smoothstep(0., .07, progress);
    float wobble = (sin(angle * 7. + progress * 13.) * .016
      + sin(angle * 11. - progress * 9.) * .009) * energy;
    float front = distance + wobble - radius;
    float reveal = 1. - smoothstep(-.035, .018, front);

    // Radial refraction follows the impact, rather than moving the whole image.
    float wake = exp(-abs(front) * 11.) * energy;
    float wave = sin(front * 62.) * wake;
    vec2 direction = point / max(distance, .001);
    vec2 refracted = uv + direction / aspect * wave * .024;
    float fit = min(resolution.x / imageSize.x, resolution.y / imageSize.y);
    vec2 occupied = imageSize * fit / resolution;
    vec2 imageUv = (refracted - .5) / occupied + .5;
    vec4 color = texture2D(image, clamp(imageUv, 0., 1.));
    float inside = step(0., imageUv.x) * step(imageUv.x, 1.)
      * step(0., imageUv.y) * step(imageUv.y, 1.);
    color.a *= inside * reveal;
    color.rgb += wave * .1;

    // Three crests make the expanding aperture read as water, even over alpha.
    float crest = exp(-pow(front * 105., 2.)) * .38
      + exp(-pow((front + .065) * 120., 2.)) * .19
      + exp(-pow((front + .14) * 100., 2.)) * .1;
    float edge = min(min(uv.x, 1. - uv.x), min(uv.y, 1. - uv.y));
    float rings = crest * energy * smoothstep(0., .09, edge);
    float alpha = color.a + rings * (1. - color.a);
    vec3 premultiplied = color.rgb * color.a + vec3(.64, .88, 1.) * rings * (1. - color.a);
    gl_FragColor = vec4(premultiplied / max(alpha, .0001), alpha);
  }
`

/** One transient canvas/context per hero. Original responsive images remain the default. */
export function createLiquidReveal() {
  const canvas = document.createElement("canvas")
  canvas.className = "texno-hero-liquid"
  canvas.setAttribute("aria-hidden", "true")
  const gl = canvas.getContext("webgl", { alpha: true, antialias: false, depth: false, premultipliedAlpha: false })
  if (!gl) return null

  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)
    if (!shader) return null
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader)
      return null
    }
    return shader
  }
  const vertex = compile(gl.VERTEX_SHADER, vertexSource)
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource)
  const program = gl.createProgram()
  if (!vertex || !fragment || !program) {
    if (vertex) gl.deleteShader(vertex)
    if (fragment) gl.deleteShader(fragment)
    if (program) gl.deleteProgram(program)
    gl.getExtension("WEBGL_lose_context")?.loseContext()
    return null
  }
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    gl.getExtension("WEBGL_lose_context")?.loseContext()
    return null
  }
  gl.useProgram(program)
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, "position")
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
  const resolution = gl.getUniformLocation(program, "resolution")
  const imageSize = gl.getUniformLocation(program, "imageSize")
  const progress = gl.getUniformLocation(program, "progress")
  let frame = 0
  let generation = 0
  let current: HTMLElement | null = null
  const finish = () => {
    generation++
    cancelAnimationFrame(frame)
    if (current) delete current.dataset.liquidActive
    current = null
    canvas.remove()
  }
  canvas.addEventListener("webglcontextlost", finish)

  return {
    play(picture: HTMLElement, delay: number) {
      finish()
      const image = picture.querySelector("img")
      if (!image || gl.isContextLost()) return revealWithoutWebGL(picture, delay)
      const token = generation
      current = picture
      picture.dataset.liquidActive = "true"
      const start = () => {
        if (generation !== token) return
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
        } catch {
          finish()
          return
        }
        const density = Math.min(window.devicePixelRatio || 1, 1.5)
        canvas.width = Math.max(1, Math.round(picture.clientWidth * density))
        canvas.height = Math.max(1, Math.round(picture.clientHeight * density))
        gl.viewport(0, 0, canvas.width, canvas.height)
        gl.uniform2f(resolution, canvas.width, canvas.height)
        gl.uniform2f(imageSize, image.naturalWidth, image.naturalHeight)
        gl.uniform1f(progress, 0)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
        picture.append(canvas)
        const started = performance.now() + delay
        const draw = (now: number) => {
          if (generation !== token) return
          const time = Math.min(1, Math.max(0, (now - started) / 1050))
          gl.uniform1f(progress, time)
          gl.drawArrays(gl.TRIANGLES, 0, 6)
          if (time < 1) frame = requestAnimationFrame(draw)
          else finish()
        }
        frame = requestAnimationFrame(draw)
      }
      if (image.complete && image.naturalWidth) start()
      else image.decode().then(start, finishIfCurrent)
      function finishIfCurrent() { if (generation === token) finish() }
      return finishIfCurrent
    },
    destroy() {
      finish()
      gl.deleteTexture(texture)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.getExtension("WEBGL_lose_context")?.loseContext()
    },
  }
}

/** A wavy radial aperture when GPU rendering is unavailable; never leave a mask behind. */
export function revealWithoutWebGL(picture: HTMLElement, delay: number) {
  const frames = Array.from({ length: 14 }, (_, step) => {
    const progress = step / 13
    const radius = Math.pow(progress, .72) * 90
    const points = Array.from({ length: 64 }, (_, point) => {
      const angle = point / 64 * Math.PI * 2
      const wave = (Math.sin(angle * 7 + progress * 13) * 2 + Math.sin(angle * 11 - progress * 9)) * (1 - progress)
      return `${49 + Math.cos(angle) * (radius + wave)}% ${52 + Math.sin(angle) * (radius + wave)}%`
    })
    return { clipPath: `polygon(${points.join(",")})` }
  })
  const animation = picture.animate(frames, { duration: 950, delay, fill: "backwards" })
  const rings = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  rings.setAttribute("viewBox", "0 0 100 100")
  rings.setAttribute("preserveAspectRatio", "none")
  rings.setAttribute("aria-hidden", "true")
  rings.classList.add("texno-hero-liquid-rings")
  const waves = [0, 75, 145].map(offset => {
    const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle")
    ring.setAttribute("cx", "49")
    ring.setAttribute("cy", "52")
    ring.setAttribute("r", "38")
    rings.append(ring)
    return ring.animate([
      { transform: "scale(.02)", opacity: 0 },
      { opacity: .35, offset: .12 },
      { transform: "scale(1.9)", opacity: 0 },
    ], { duration: 800, delay: delay + offset, fill: "both" })
  })
  picture.append(rings)
  animation.finished.then(() => rings.remove(), () => rings.remove())
  return () => {
    animation.cancel()
    waves.forEach(wave => wave.cancel())
    rings.remove()
  }
}
