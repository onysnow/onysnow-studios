import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const frag = readFileSync("src/lib/glass-light-shader.ts","utf8").split("/* glsl */ `")[1].split("\n`;\n")[0];
const vert = readFileSync("src/lib/cursor-light-shader.ts","utf8").split("export const LIGHT_VERTEX_SHADER = /* glsl */ `")[1].split("\n`;\n")[0];
const W=1100,H=700;
const scene = "data:image/jpeg;base64," + readFileSync("/tmp/claude-0/-home-claude/c990aa08-dc39-5c02-be4f-f26c6efb9d59/scratchpad/tiny.jpg").toString("base64");
const b = await chromium.launch({executablePath:"/opt/pw-browsers/chromium",args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
const page = await b.newPage({viewport:{width:W,height:H}});
await page.setContent(`<body style="margin:0;background:#000">
<img id=bg src="${scene}" style="position:fixed;inset:0;width:${W}px;height:${H}px;object-fit:cover">
<canvas id=c style="position:fixed;inset:0;width:100%;height:100%;mix-blend-mode:plus-lighter"></canvas></body>`);
await page.waitForFunction(() => { const i=document.getElementById("bg"); return i && i.complete && i.naturalWidth>0; }, {timeout:20000});
await page.evaluate(({vs,fs,lx,ly,ch,panes})=>{
  const c=document.getElementById("c"); c.width=1100;c.height=700;
  const gl=c.getContext("webgl",{alpha:true,premultipliedAlpha:false,antialias:false});
  const mk=(t,s)=>{const sh=gl.createShader(t);gl.shaderSource(sh,s);gl.compileShader(sh);
    if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(sh));return sh;};
  const p=gl.createProgram();gl.attachShader(p,mk(gl.VERTEX_SHADER,vs));gl.attachShader(p,mk(gl.FRAGMENT_SHADER,fs));
  gl.linkProgram(p);gl.useProgram(p);
  const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  const a=gl.getAttribLocation(p,"aPosition");gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
  const U=n=>gl.getUniformLocation(p,n); const lin=x=>Math.pow(x,2.2);
  const img=document.getElementById("bg");
  const tex=gl.createTexture(); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,img);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.uniform3f(U("uWarm"),lin(1),lin(.68),lin(.3)); gl.uniform3f(U("uCool"),lin(.35),lin(.78),lin(.82));
  gl.uniform2f(U("uViewport"),1100,700); gl.uniform1f(U("uScale"),1);
  gl.uniform1i(U("uSurface"),0); gl.uniform1f(U("uHasSurface"),0);
  gl.uniform1i(U("uBackdrop"),1); gl.uniform1f(U("uHasBackdrop"),1);
  gl.uniform4f(U("uImage"),0,0,1100,700);
  gl.uniform1f(U("uImageAspect"), img.naturalWidth/img.naturalHeight);
  gl.uniform2f(U("uLight"),lx,ly); gl.uniform1f(U("uCharge"),ch);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.viewport(0,0,1100,700); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.SCISSOR_TEST);
  for (const r of panes) {
    gl.uniform4f(U("uRect"),r[0],r[1],r[2],r[3]); gl.uniform1f(U("uRadius"),24);
    gl.uniform1f(U("uTilt"),r[4]); gl.uniform1f(U("uSeed"),1);
    gl.scissor(Math.floor(r[0]-90), Math.floor(700-(r[1]+r[3])-90), Math.ceil(r[2]+180), Math.ceil(r[3]+180));
    gl.drawArrays(gl.TRIANGLES,0,3);
  }
  gl.disable(gl.SCISSOR_TEST);
},{vs:vert,fs:frag,lx:Number(process.argv[3]??300),ly:Number(process.argv[4]??410),ch:Number(process.argv[5]??0.9),panes:[[90,120,920,180,-0.55],[90,400,920,200,0.6]]});
await page.screenshot({path:process.argv[2]});
console.log("rendered");
await b.close();
