import React, { useEffect, useRef } from "react";

interface ShaderBackgroundProps {
  className?: string;
  timeScale?: number;
  colorCount?: number;
  cursorEffect?: number;
}

export function ShaderBackground({
  className = "w-full h-full",
  timeScale = 0.5,
  colorCount = 4.0,
  cursorEffect = 1.0,
}: ShaderBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl");
    if (!gl) return;

    // Fullscreen quad vertex shader
    const vsSource = `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    // Liquid metal procedural fragment shader
    const fsSource = `
      precision highp float;
      uniform vec4 u_scene;  // [width, height, time, colorCount]
      uniform vec4 u_space;  // [offsetX, offsetY, scaleX, scaleY]
      uniform vec4 u_cursor; // [unused, cursorEffect, cursorStrength, cursorRadius]

      void main() {
        vec2 uv = gl_FragCoord.xy / u_scene.xy;
        float t = u_scene.z;
        
        // Liquid distortion coordinates
        vec2 p = uv * 2.0 - 1.0;
        p.x *= u_scene.x / u_scene.y;
        
        float len = length(p);
        float angle = atan(p.y, p.x);
        
        // Fluid ripple sine wave superposition
        float wave = sin(len * 6.0 - t * 2.0) + sin(p.x * 4.0 + t) + cos(p.y * 4.0 + t);
        float spec = pow(max(0.0, sin(wave * 2.0)), 8.0);
        
        // Liquid metallic palette
        vec3 col = vec3(0.1, 0.12, 0.15) + vec3(0.7, 0.75, 0.85) * (0.5 + 0.5 * sin(wave + vec3(0.0, 0.5, 1.0)));
        col += spec * 0.6; // Chrome highlight
        
        gl_FragColor = vec4(col, 1.0);
      }
    `;

    function compileShader(source: string, type: number) {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    }

    const vs = compileShader(vsSource, gl.VERTEX_SHADER);
    const fs = compileShader(fsSource, gl.FRAGMENT_SHADER);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    // Quad vertices
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const posLoc = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uScene = gl.getUniformLocation(program, "u_scene");
    const uSpace = gl.getUniformLocation(program, "u_space");
    const uCursor = gl.getUniformLocation(program, "u_cursor");

    let animId = 0;
    const startTime = performance.now();

    function resize() {
      if (!canvas) return;
      canvas.width = canvas.clientWidth * window.devicePixelRatio;
      canvas.height = canvas.clientHeight * window.devicePixelRatio;
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();
    window.addEventListener("resize", resize);

    function render(now: number) {
      const elapsed = (now - startTime) / 1000.0;
      gl.uniform4f(uScene, canvas.width, canvas.height, elapsed * timeScale, colorCount);
      gl.uniform4f(uSpace, 0, 0, 1, 1);
      gl.uniform4f(uCursor, 0, cursorEffect, 1.0, 0.5);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      animId = requestAnimationFrame(render);
    }
    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
    };
  }, [timeScale, colorCount, cursorEffect]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: "block", width: "100%", height: "100%" }}
    />
  );
}

export default ShaderBackground;
